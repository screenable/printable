// src/services/voucher-store.ts
//
// Lokaler, offline-fähiger Gutschein-Pool + Tageszähler.
//
// - Bestandslimit: ergibt sich aus der Zahl der reservierten, unclaimed Codes
//   im Pool. Ein Einmal-Code liegt physisch auf genau einer Box -> das globale
//   Limit hält auch komplett offline (KONZEPT.md 5.3).
// - Tempolimit: `dailyLimit` wird über den lokalen Tageszähler durchgesetzt.
import { join } from 'node:path';
import { CONFIG } from '../config';
import { JsonStore } from '../lib/json-store';
import type { DailyUsage, VoucherRecord } from '../types/dispense.types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class VoucherStore {
  private vouchers: JsonStore<{ items: VoucherRecord[] }>;
  private usage: JsonStore<DailyUsage>;
  private totals: JsonStore<{ counts: Record<string, number> }>;

  constructor(dataDir: string = CONFIG.DATA_DIR) {
    this.vouchers = new JsonStore(join(dataDir, 'vouchers.json'), { items: [] });
    this.usage = new JsonStore<DailyUsage>(join(dataDir, 'daily-usage.json'), {
      date: today(),
      counts: {},
    });
    this.totals = new JsonStore(join(dataDir, 'totals.json'), { counts: {} });
    this.rollDateIfNeeded();
  }

  // ---------------------------------------------------------------- Bestand

  /**
   * Fügt reservierte Codes in den lokalen Pool ein (Dedupe über `code`).
   * @returns Anzahl neu hinzugefügter Codes.
   */
  loadBatch(category: string, codes: string[]): number {
    return this.vouchers.update(state => {
      const known = new Set(state.items.map(v => v.code));
      let added = 0;
      for (const code of codes) {
        if (known.has(code)) continue;
        state.items.push({ code, category, claimed: false, synced: false });
        known.add(code);
        added++;
      }
      return added;
    });
  }

  /**
   * Gleicht den lokalen Pool mit dem Server ab: Entfernt lokale, noch NICHT
   * ausgegebene Codes, die der Server nicht (mehr) als für diese Box reserviert
   * führt – z.B. weil sie in der Konsole gelöscht oder wieder freigegeben
   * wurden. Bereits ausgegebene Codes bleiben unangetastet (auch wenn noch
   * nicht synchronisiert), damit die Outbox nichts verliert.
   * @param reservedCodes Codes, die der Server aktuell als reserviert für diese
   *   Box meldet (Sollbestand).
   * @returns Anzahl lokal entfernter Codes.
   */
  reconcileReserved(reservedCodes: string[]): number {
    const keep = new Set(reservedCodes);
    return this.vouchers.update(state => {
      const before = state.items.length;
      state.items = state.items.filter(v => v.claimed || keep.has(v.code));
      return before - state.items.length;
    });
  }

  /** Anzahl noch verfügbarer (unclaimed) Codes einer Kategorie. */
  remaining(category: string): number {
    return this.vouchers.get().items.filter(v => v.category === category && !v.claimed).length;
  }

  /** Bestände je Kategorie – für Monitoring/Nachschub-Entscheidungen. */
  remainingByCategory(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const v of this.vouchers.get().items) {
      if (v.claimed) continue;
      out[v.category] = (out[v.category] ?? 0) + 1;
    }
    return out;
  }

  /**
   * Zieht den nächsten freien Code einer Kategorie, markiert ihn lokal als
   * ausgegeben (und noch nicht synchronisiert). Gibt null zurück, wenn der Pool
   * leer ist.
   */
  claimNext(category: string): string | null {
    return this.vouchers.update(state => {
      const rec = state.items.find(v => v.category === category && !v.claimed);
      if (!rec) return null;
      rec.claimed = true;
      rec.claimedAt = new Date().toISOString();
      rec.synced = false;
      return rec.code;
    });
  }

  /** Ausgegebene, noch nicht hochgeladene Codes (Outbox). */
  unsyncedClaims(): VoucherRecord[] {
    return this.vouchers.get().items.filter(v => v.claimed && !v.synced);
  }

  /** Markiert Codes nach erfolgreichem Upload als synchronisiert. */
  markSynced(codes: string[]): void {
    const set = new Set(codes);
    this.vouchers.update(state => {
      for (const v of state.items) if (set.has(v.code)) v.synced = true;
      return null;
    });
  }

  // -------------------------------------------------------------- Tageslimit

  private rollDateIfNeeded(): void {
    if (this.usage.get().date !== today()) {
      this.usage.set({ date: today(), counts: {} });
    }
  }

  /** Wie oft wurde `templateName` heute schon ausgegeben? */
  todayCount(templateName: string): number {
    this.rollDateIfNeeded();
    return this.usage.get().counts[templateName] ?? 0;
  }

  /** Zählt eine Ausgabe von `templateName` für heute hoch. */
  incrementToday(templateName: string): void {
    this.rollDateIfNeeded();
    this.usage.update(state => {
      state.counts[templateName] = (state.counts[templateName] ?? 0) + 1;
      return null;
    });
  }

  // ─────────────────────────────────────────────────────── Gesamt-Limit ─────

  /** Wie oft wurde `templateName` insgesamt ausgegeben (Lebenszeit, kein Reset)? */
  totalCount(templateName: string): number {
    return this.totals.get().counts[templateName] ?? 0;
  }

  /** Zählt eine Ausgabe von `templateName` gesamt hoch. */
  incrementTotal(templateName: string): void {
    this.totals.update(state => {
      state.counts[templateName] = (state.counts[templateName] ?? 0) + 1;
      return null;
    });
  }

  /** Alle Gesamt-Zähler (für die Telemetrie an Supabase). */
  allTotals(): Record<string, number> {
    return { ...this.totals.get().counts };
  }

  /**
   * Übernimmt vom Backend gemeldete Zähler (z.B. nach Neuaufsetzen der SD-Karte),
   * ohne je zurückzuzählen – so bleibt das Gesamt-Limit auch nach Re-Image korrekt.
   */
  seedTotals(remote: Record<string, number>): void {
    this.totals.update(state => {
      for (const [name, count] of Object.entries(remote)) {
        if ((state.counts[name] ?? 0) < count) state.counts[name] = count;
      }
      return null;
    });
  }

  /**
   * Überschreibt die Gesamt-Zähler exakt mit den gemeldeten Werten – inklusive
   * Herunterzählen. Nur für den expliziten Zähler-Reset aus der Konsole gedacht
   * (seedTotals zählt bewusst nie zurück); nicht in der Config gelistete Templates
   * fallen dabei auf 0 zurück. So wirkt das Zurücksetzen auch für statische Codes.
   */
  setTotals(remote: Record<string, number>): void {
    this.totals.set({ counts: { ...remote } });
  }
}
