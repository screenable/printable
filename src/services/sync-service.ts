// src/services/sync-service.ts
//
// Gleicht die Box periodisch mit Supabase ab – aber NIE im heißen Pfad:
//
//   runter:  Geräte-Config, Template-Mix, reservierte Gutschein-Batches
//   rauf:    ausgegebene Codes (claimed), Druck-Historie, Heartbeat
//
// Jeder Schritt ist best-effort und in try/catch gekapselt: Ist die Box offline,
// scheitert der Sync leise, der Druckbetrieb läuft aus dem lokalen Cache weiter.
import type { FastifyBaseLogger } from 'fastify';
import { CONFIG } from '../config';
import { getCurrentVersion } from '../helpers/auto-updater';
import { FilledTemplateSchema } from '../types/template.validation';
import type { RuntimeTemplate } from '../types/dispense.types';
import type { PartialDeviceConfig } from '../types/config.types';
import { supabase } from '../lib/supabase-client';
import {
  configService,
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

  constructor(deps: SyncServiceDeps) {
    this.log = deps.log;
  }

  /** Führt einen kompletten Sync-Zyklus aus. */
  async syncOnce(): Promise<void> {
    await this.pullConfig();
    await this.pullTemplates();
    await this.pullVouchers();
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
        .select('config, desired_version, dispensed')
        .eq('id', CONFIG.DEVICE_ID)
        .single();
      if (error) throw error;
      if (data) {
        configService.apply(data.config as PartialDeviceConfig);
        this.desiredVersion = data.desired_version ?? undefined;
        // Gesamt-Zähler vom Backend übernehmen (robust gegen Re-Image).
        if (data.dispensed) voucherStore.seedTotals(data.dispensed as Record<string, number>);
      }
    } catch (err) {
      this.log.warn({ err }, 'sync: pullConfig failed (offline?) – using cached config');
    }
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
