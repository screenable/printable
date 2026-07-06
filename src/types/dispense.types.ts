// src/types/dispense.types.ts
import type { FilledTemplate } from './template.validation';
import type { WebhookTemplate } from './webhook-template.types';

/** Ein Gutscheincode im lokalen Pool (SQLite-Ersatz: JSON-Store). */
export interface VoucherRecord {
  code: string;
  category: string;
  claimed: boolean;
  /** ISO-Zeitpunkt der Ausgabe (nur wenn claimed). */
  claimedAt?: string;
  /** Wurde die Einlösung schon zu Supabase hochgeladen? */
  synced: boolean;
}

/** Tageszähler für Tempolimits (dailyLimit). */
export interface DailyUsage {
  /** ISO-Datum (YYYY-MM-DD), an dem die Zähler gelten. */
  date: string;
  counts: Record<string, number>;
}

export type LocalJobStatus = 'pending' | 'printing' | 'done' | 'error';

/** Ein lokal erzeugter Druckauftrag (Offline-Queue). */
export interface LocalJob {
  id: string;
  templateName: string;
  filledTemplate: FilledTemplate;
  status: LocalJobStatus;
  createdAt: string;
  /** Ausgegebener Code (für Telemetrie / Sync). */
  code?: string;
  error?: string;
  /** Wurde der Job schon zu Supabase (print_jobs) hochgeladen? */
  synced: boolean;
}

/**
 * Laufzeit-Template inkl. der eigentlichen Bon-Elementliste (mit Platzhaltern).
 * Kombiniert die Auswahl-Parameter (WebhookTemplate) mit dem Layout aus
 * `templates.template`.
 */
export interface RuntimeTemplate extends WebhookTemplate {
  /** Bon-Layout mit Platzhaltern wie {{code}}, {{price}}. */
  layout: FilledTemplate;
}
