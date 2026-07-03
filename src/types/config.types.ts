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
  };
}

/** Teil-Update, wie es aus Supabase (`devices.config`) kommen kann. */
export type PartialDeviceConfig = {
  [K in keyof DeviceConfig]?: Partial<DeviceConfig[K]>;
};
