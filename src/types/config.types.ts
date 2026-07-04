// src/types/config.types.ts

/** Laufzeit-Konfiguration einer Box, gespiegelt aus `devices.config` (Supabase). */
export interface DeviceConfig {
  printer: {
    host: string;
    port: number;
    model: string;
  };
  gpio: {
    buttonPin: number;
    debounceMs: number;
    buzzerLedPin: number;
  };
  neopixel: {
    count: number;
    gpio: number;
    brightness: number;
  };
  led: {
    doneHoldMs: number;
    errorHoldMs: number;
    workingFallbackMs: number;
    wledIp?: string;
  };
  dispense: {
    cooldownMs: number;
    /** Basis-URL für den Einlöse-QR-Code dynamischer Codes ({{redeem_url}} = base + code). */
    redeemBaseUrl?: string;
  };
}

/** Teil-Update, wie es aus Supabase (`devices.config`) kommen kann. */
export type PartialDeviceConfig = {
  [K in keyof DeviceConfig]?: Partial<DeviceConfig[K]>;
};
