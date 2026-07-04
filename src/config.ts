// src/config.ts
//
// Bootstrap-Konfiguration: NUR die Werte, die der Pi zum Starten und zum
// Verbinden mit Supabase braucht. Alles Übrige (Drucker, GPIO, NeoPixel,
// LED-Zeiten, Cooldown, Templates, Gutscheine) kommt zur Laufzeit aus der
// `devices`-Row in Supabase und wird vom config-service verwaltet.
import dotenv from 'dotenv';
import { join } from 'node:path';
dotenv.config();

const {
  ENVIRONMENT,
  SUPABASE_URL,
  SUPABASE_KEY,
  DEVICE_ID,
  DATA_DIR,
  SYNC_INTERVAL_MS,
  // Legacy-/Fallback-ENV: dienen nur noch als Default-Seed für den
  // config-service, falls beim ersten Start noch keine Remote-Config da ist.
  GPIO_PIN,
  DEBOUNCE_MS,
  GPIO_BUZZER_LED_PIN,
  NEOPIXEL_COUNT,
  NEOPIXEL_GPIO,
  NEOPIXEL_BRIGHTNESS,
  LED_DONE_HOLD_MS,
  LED_ERROR_HOLD_MS,
  WEBHOOK_COOLDOWN_MS,
  WLED_IP,
  PRINTER_HOST,
  PRINTER_PORT,
  // Self-Update
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_TOKEN,
} = process.env;

const num = (v: string | undefined, d: number) => (v !== undefined ? Number(v) : d);

/**
 * Prüft die Pflicht-ENV-Variablen. Wird bewusst NICHT beim Import ausgeführt
 * (sonst könnten Unit-Tests die Module nicht laden), sondern beim Start in
 * `main()`.
 */
export function assertConfig(): void {
  const missing = (['SUPABASE_URL', 'SUPABASE_KEY', 'DEVICE_ID'] as const).filter(
    k => !process.env[k],
  );
  if (missing.length > 0) {
    throw new Error(`Required env vars missing: ${missing.join(', ')}`);
  }
}

export const CONFIG = {
  ENVIRONMENT: ENVIRONMENT ?? 'production',
  SUPABASE_URL: SUPABASE_URL ?? '',
  SUPABASE_KEY: SUPABASE_KEY ?? '',
  DEVICE_ID: DEVICE_ID ?? 'unconfigured-device',

  /** Verzeichnis für den lokalen Offline-Store (Gutscheine, Jobs, Config-Cache). */
  DATA_DIR: DATA_DIR ?? join(process.cwd(), 'data'),
  /** Wie oft der Sync-Service mit Supabase abgleicht. */
  SYNC_INTERVAL_MS: num(SYNC_INTERVAL_MS, 30_000),

  /** Self-Update (Abschnitt 4 des Konzepts). */
  GITHUB_OWNER: GITHUB_OWNER ?? 'screenable',
  GITHUB_REPO: GITHUB_REPO ?? 'printable',
  GITHUB_TOKEN,

  /**
   * Default-Seed für den config-service. Diese Werte gelten nur, solange keine
   * `devices.config` aus Supabase geladen werden konnte (erster Boot / offline).
   */
  DEFAULTS: {
    printer: {
      host: PRINTER_HOST ?? '192.168.100.200',
      port: num(PRINTER_PORT, 9100),
      model: 'epson-tm-m30iii' as const,
    },
    gpio: {
      buttonPin: num(GPIO_PIN, 17),
      debounceMs: num(DEBOUNCE_MS, 10),
      buzzerLedPin: GPIO_BUZZER_LED_PIN ? Number(GPIO_BUZZER_LED_PIN) : 5,
    },
    neopixel: {
      count: num(NEOPIXEL_COUNT, 0),
      gpio: num(NEOPIXEL_GPIO, 18),
      brightness: num(NEOPIXEL_BRIGHTNESS, 80),
    },
    led: {
      doneHoldMs: num(LED_DONE_HOLD_MS, 2200),
      errorHoldMs: num(LED_ERROR_HOLD_MS, 3000),
      workingFallbackMs: 15_000,
      wledIp: WLED_IP,
    },
    dispense: {
      cooldownMs: num(WEBHOOK_COOLDOWN_MS, 1000),
      redeemBaseUrl: process.env.REDEEM_BASE_URL ?? 'https://app.screenable.io/r/',
    },
  },
};
