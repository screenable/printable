// src/types/webhook-template.types.ts

/** Art der Belohnung – bestimmt die Offline-Strategie (siehe KONZEPT.md 5.1). */
export type RewardType = 'none' | 'static' | 'unique';

/**
 * Eine wählbare Preisstufe / ein Template inkl. Auswahl- und Limit-Parametern.
 * Wird zur Laufzeit aus `device_templates` (Supabase) geladen; die ENV-/Code-
 * Defaults dienen nur als Offline-Fallback.
 */
export interface WebhookTemplate {
  /** Eindeutiger Name (entspricht `templates.name`). */
  name: string;

  /** Gewicht für die gewichtete Zufallsauswahl (lokal, kein Netz nötig). */
  probability: number;

  /** Mindestabstand zwischen zwei Nutzungen in Sekunden (0 = keiner). */
  cooldownSeconds: number;

  /** Zusätzliche Template-Daten (z.B. `{ price: '10%' }`). */
  data: Record<string, unknown>;

  /** Optionale Kategorie für die Gutschein-Zuordnung (Pool). */
  voucherCategory?: string;

  /** Belohnungsart. Default: 'none'. */
  rewardType?: RewardType;

  /** Bei rewardType='static': allgemeingültiger Code, der für alle gilt. */
  staticCode?: string;

  /** Tempolimit: maximale Ausgaben pro Tag (lokaler Zähler). 0/undefined = kein Limit. */
  dailyLimit?: number;

  /** Gesamt-Limit: maximale Ausgaben insgesamt (lokaler Lebenszeit-Zähler, auch für static). */
  totalLimit?: number;

  /** Wird dieses Template als Trost-Fallback benutzt, wenn nichts anderes geht? */
  isFallback?: boolean;
}

/** Zeit-Tracking der letzten Nutzung je Template (für Cooldowns). */
export interface TemplateUsageTracker {
  [templateName: string]: number; // Timestamp in Millisekunden
}

/** Ergebnis einer Template-Auswahl. */
export interface TemplateSelectionResult {
  template: WebhookTemplate;
  voucherCode?: string | null;
}
