// src/services/sync-service.ts
//
// Gleicht die Box periodisch mit Supabase ab – aber NIE im heißen Pfad:
//
//   runter:  Geräte-Config, Template-Mix, reservierte Gutschein-Batches
//   rauf:    ausgegebene Codes (claimed), Druck-Historie, Heartbeat
//
// Jeder Schritt ist best-effort und in try/catch gekapselt: Ist die Box offline,
// scheitert der Sync leise, der Druckbetrieb läuft aus dem lokalen Cache weiter.
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { CONFIG } from '../config';
import { JsonStore } from '../lib/json-store';
import { getCurrentVersion } from '../helpers/auto-updater';
import { FilledTemplateSchema } from '../types/template.validation';
import type { RuntimeTemplate } from '../types/dispense.types';
import type { PartialDeviceConfig } from '../types/config.types';
import { supabase } from '../lib/supabase-client';
import {
  configService,
  eventStore,
  imageCache,
  jobStore,
  selector,
  templateRegistry,
  voucherStore,
} from '../app-context';

export interface SyncServiceDeps {
  log: FastifyBaseLogger;
}

export class SyncService {
  private log: FastifyBaseLogger;
  private timer?: ReturnType<typeof setInterval>;
  /** Vom Backend gewünschte App-Version (für den Self-Updater). */
  desiredVersion?: string;
  /** Zuletzt verarbeitete Neustart-Anforderung (persistiert gegen Loops). */
  private reboot: JsonStore<{ lastHandled: string | null }>;
  /** Zuletzt verarbeiteter Zähler-Reset (persistiert, damit er nur einmal greift). */
  private dispenseReset: JsonStore<{ lastHandled: string | null }>;

  constructor(deps: SyncServiceDeps) {
    this.log = deps.log;
    this.reboot = new JsonStore(join(CONFIG.DATA_DIR, 'reboot.json'), { lastHandled: null });
    this.dispenseReset = new JsonStore(join(CONFIG.DATA_DIR, 'dispense-reset.json'), {
      lastHandled: null,
    });
  }

  /** Führt einen kompletten Sync-Zyklus aus. */
  async syncOnce(): Promise<void> {
    await this.pullConfig();
    await this.pullTemplates();
    await this.pullVouchers();
    await this.reconcileVouchers();
    await this.pushOutbox();
    await this.pushHeartbeat();
  }

  /** Startet den periodischen Sync und macht sofort einen ersten Durchlauf. */
  start(): void {
    void this.syncOnce();
    this.timer = setInterval(() => void this.syncOnce(), CONFIG.SYNC_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // --------------------------------------------------------------- Pull

  async pullConfig(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('config, desired_version, dispensed, dispensed_reset_at, restart_requested_at')
        .eq('id', CONFIG.DEVICE_ID)
        .single();
      if (error) throw error;
      if (data) {
        configService.apply(data.config as PartialDeviceConfig);
        this.desiredVersion = data.desired_version ?? undefined;
        // Gesamt-Zähler vom Backend übernehmen. Normalfall: nur hochzählen (robust
        // gegen Re-Image). Nach einem Konsolen-Reset (neuerer dispensed_reset_at)
        // die gemeldeten Zähler einmalig exakt übernehmen – so wirkt das
        // Zurücksetzen auch lokal, auch für statische Codes.
        if (data.dispensed) {
          const dispensed = data.dispensed as Record<string, number>;
          if (this.consumeResetSignal(data.dispensed_reset_at ?? null)) {
            voucherStore.setTotals(dispensed);
            this.log.info('sync: dispense counters reset from console');
          } else {
            voucherStore.seedTotals(dispensed);
          }
        }
        this.checkReboot(data.restart_requested_at ?? null);
      }
    } catch (err) {
      this.log.warn({ err }, 'sync: pullConfig failed (offline?) – using cached config');
    }
  }

  /**
   * Fern-Neustart: Ist restart_requested_at neuer als der zuletzt verarbeitete
   * Wert, merkt sich die Box den Zeitpunkt (persistent) und beendet sich –
   * systemd startet den Dienst neu. Der persistierte Wert verhindert einen Loop.
   */
  private checkReboot(requestedAt: string | null): void {
    if (!requestedAt) return;
    if (this.reboot.get().lastHandled === requestedAt) return;
    this.log.warn({ requestedAt }, 'Fern-Neustart angefordert – Dienst wird neu gestartet');
    this.reboot.set({ lastHandled: requestedAt });
    process.exit(0);
  }

  /**
   * Zähler-Reset aus der Konsole: Ist dispensed_reset_at neuer als der zuletzt
   * verarbeitete Wert, wird er (persistent) gemerkt und true zurückgegeben – so
   * greift der Reset genau einmal je Anforderung und nicht bei jedem Sync erneut.
   */
  private consumeResetSignal(resetAt: string | null): boolean {
    if (!resetAt) return false;
    if (this.dispenseReset.get().lastHandled === resetAt) return false;
    this.dispenseReset.set({ lastHandled: resetAt });
    return true;
  }

  async pullTemplates(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('device_templates')
        .select(
          'probability, cooldown_sec, voucher_category, reward_type, static_code, daily_limit, total_limit, is_fallback, data, templates(name, template)',
        )
        .eq('device_id', CONFIG.DEVICE_ID)
        .eq('enabled', true);
      if (error) throw error;
      if (!data || data.length === 0) return;

      const templates: RuntimeTemplate[] = [];
      for (const row of data as unknown as DeviceTemplateRow[]) {
        const tpl = Array.isArray(row.templates) ? row.templates[0] : row.templates;
        if (!tpl) continue;
        const parsed = FilledTemplateSchema.safeParse(tpl.template);
        if (!parsed.success) {
          this.log.warn({ template: tpl.name }, 'sync: invalid layout – skipping');
          continue;
        }
        templates.push({
          name: tpl.name,
          probability: row.probability ?? 0,
          cooldownSeconds: row.cooldown_sec ?? 0,
          data: (row.data as Record<string, unknown>) ?? {},
          voucherCategory: row.voucher_category ?? undefined,
          rewardType: (row.reward_type as RuntimeTemplate['rewardType']) ?? 'none',
          staticCode: row.static_code ?? undefined,
          dailyLimit: row.daily_limit ?? undefined,
          totalLimit: row.total_limit ?? undefined,
          isFallback: row.is_fallback ?? false,
          layout: parsed.data,
        });
      }

      if (templates.length > 0) {
        templateRegistry.replace(templates);
        selector.setTemplates(templateRegistry.all());
        this.log.info({ count: templates.length }, 'sync: templates updated');
        // Referenzierte Bon-Bilder in den Offline-Cache laden, solange online.
        const imageUrls = templates.flatMap(t =>
          t.layout.elements.filter(el => el.type === 'image').map(el => el.input),
        );
        if (imageUrls.length > 0) void imageCache.warm(imageUrls);
      }
    } catch (err) {
      this.log.warn({ err }, 'sync: pullTemplates failed – using cached templates');
    }
  }

  async pullVouchers(): Promise<void> {
    // Für jede unique-Kategorie den lokalen Bestand bis zum Sollwert auffüllen.
    const targets = new Map<string, number>();
    for (const t of templateRegistry.all()) {
      if (t.rewardType === 'unique' && t.voucherCategory) {
        // Sollbestand = dailyLimit (falls gesetzt) oder ein sinnvoller Default.
        targets.set(t.voucherCategory, Math.max(t.dailyLimit ?? 0, 20));
      }
    }

    for (const [category, target] of targets) {
      const need = target - voucherStore.remaining(category);
      if (need <= 0) continue;
      try {
        const { data, error } = await supabase.rpc('reserve_vouchers', {
          p_device_id: CONFIG.DEVICE_ID,
          p_category: category,
          p_limit: need,
        });
        if (error) throw error;
        const codes = ((data as { code: string }[]) ?? []).map(r => r.code);
        if (codes.length > 0) {
          const added = voucherStore.loadBatch(category, codes);
          this.log.info({ category, added }, 'sync: reserved voucher batch');
        }
      } catch (err) {
        this.log.warn({ err, category }, 'sync: reserveVouchers failed');
      }
    }
  }

  /**
   * Gleicht den lokalen Pool mit dem Server ab: Codes, die zentral gelöscht
   * oder wieder freigegeben wurden (also nicht mehr als „reserviert für diese
   * Box" geführt werden), werden lokal entfernt – sofern sie noch nicht
   * ausgegeben wurden. So wirken Pool-Korrekturen aus der Konsole, sobald die
   * Box wieder online ist. Läuft NUR bei erfolgreicher Abfrage: Ist die Box
   * offline (Fehler/Timeout), bleibt der lokale Pool unangetastet.
   */
  async reconcileVouchers(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('voucher_pool')
        .select('code')
        .eq('device_id', CONFIG.DEVICE_ID)
        .eq('status', 'reserved')
        .limit(10000);
      if (error) throw error;
      const reserved = ((data as { code: string }[]) ?? []).map(r => r.code);
      const removed = voucherStore.reconcileReserved(reserved);
      if (removed > 0) {
        this.log.info({ removed }, 'sync: reconciled voucher pool – dropped stale local codes');
      }
    } catch (err) {
      this.log.warn({ err }, 'sync: reconcileVouchers failed – keeping local pool');
    }
  }

  // --------------------------------------------------------------- Push

  async pushOutbox(): Promise<void> {
    // 1) Ausgegebene Codes als eingelöst markieren.
    const claims = voucherStore.unsyncedClaims();
    if (claims.length > 0) {
      try {
        const synced: string[] = [];
        for (const c of claims) {
          const { error } = await supabase
            .from('voucher_pool')
            .update({ status: 'claimed', claimed_at: c.claimedAt })
            .eq('code', c.code)
            .eq('device_id', CONFIG.DEVICE_ID);
          if (!error) synced.push(c.code);
        }
        if (synced.length > 0) {
          voucherStore.markSynced(synced);
          this.log.info({ count: synced.length }, 'sync: voucher claims uploaded');
        }
      } catch (err) {
        this.log.warn({ err }, 'sync: pushOutbox (vouchers) failed');
      }
    }

    // 2) Druck-Historie hochladen.
    const jobs = jobStore.unsynced();
    if (jobs.length > 0) {
      try {
        const synced: string[] = [];
        for (const j of jobs) {
          const { error } = await supabase.from('print_jobs').insert({
            data: { code: j.code ?? null, template: j.templateName, device_id: CONFIG.DEVICE_ID },
            filled_template: j.filledTemplate,
            status: j.status,
          });
          if (!error) synced.push(j.id);
        }
        if (synced.length > 0) {
          jobStore.markSyncedAndPrune(synced);
          this.log.info({ count: synced.length }, 'sync: print jobs uploaded');
        }
      } catch (err) {
        this.log.warn({ err }, 'sync: pushOutbox (jobs) failed');
      }
    }

    // 3) Ereignis-Log hochladen.
    const events = eventStore.unsynced();
    if (events.length > 0) {
      try {
        const rows = events.map(e => ({
          device_id: CONFIG.DEVICE_ID,
          ts: e.ts,
          level: e.level,
          type: e.type,
          message: e.message ?? null,
          data: e.data ?? {},
        }));
        const { error } = await supabase.from('device_events').insert(rows);
        if (!error) {
          eventStore.markSyncedAndPrune(events.map(e => e.id));
          this.log.info({ count: events.length }, 'sync: events uploaded');
        }
      } catch (err) {
        this.log.warn({ err }, 'sync: pushOutbox (events) failed');
      }
    }
  }

  async pushHeartbeat(): Promise<void> {
    try {
      await supabase
        .from('devices')
        .update({
          last_seen: new Date().toISOString(),
          app_version: getCurrentVersion(),
          voucher_stock: voucherStore.remainingByCategory(),
          dispensed: voucherStore.allTotals(),
        })
        .eq('id', CONFIG.DEVICE_ID);
    } catch (err) {
      this.log.warn({ err }, 'sync: heartbeat failed');
    }
  }
}

interface DeviceTemplateRow {
  probability: number | null;
  cooldown_sec: number | null;
  voucher_category: string | null;
  reward_type: string | null;
  static_code: string | null;
  daily_limit: number | null;
  total_limit: number | null;
  is_fallback: boolean | null;
  data: unknown;
  templates: { name: string; template: unknown } | { name: string; template: unknown }[] | null;
}
