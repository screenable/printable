// src/services/config-service.ts
//
// Hält die Laufzeit-Konfiguration der Box (Drucker, GPIO, NeoPixel, LED,
// Cooldown). Quelle der Wahrheit ist `devices.config` in Supabase; hier wird
// sie lokal gecacht, sodass die Box auch offline (und beim allerersten Boot)
// mit sinnvollen Werten startet.
import { join } from 'node:path';
import { CONFIG } from '../config';
import { JsonStore } from '../lib/json-store';
import type { DeviceConfig, PartialDeviceConfig } from '../types/config.types';

function buildDefaults(): DeviceConfig {
  const d = CONFIG.DEFAULTS;
  return {
    printer: { ...d.printer },
    gpio: { ...d.gpio },
    neopixel: { ...d.neopixel },
    led: { ...d.led },
    dispense: { ...d.dispense },
  };
}

function mergeConfig(base: DeviceConfig, patch: PartialDeviceConfig): DeviceConfig {
  return {
    printer: { ...base.printer, ...patch.printer },
    gpio: { ...base.gpio, ...patch.gpio },
    neopixel: { ...base.neopixel, ...patch.neopixel },
    led: { ...base.led, ...patch.led },
    dispense: { ...base.dispense, ...patch.dispense },
  };
}

export class ConfigService {
  private store: JsonStore<DeviceConfig>;
  private current: DeviceConfig;

  constructor(dataDir: string = CONFIG.DATA_DIR) {
    // Beim ersten Start existiert noch kein Cache -> Defaults aus ENV/Code.
    this.store = new JsonStore<DeviceConfig>(join(dataDir, 'device-config.json'), buildDefaults());
    this.current = this.store.get();
  }

  /** Aktuelle, effektive Konfiguration. */
  get(): DeviceConfig {
    return this.current;
  }

  /**
   * Übernimmt eine (Teil-)Config aus Supabase, merged sie über die Defaults und
   * persistiert das Ergebnis als Offline-Cache.
   */
  apply(remote: PartialDeviceConfig | null | undefined): DeviceConfig {
    const merged = mergeConfig(buildDefaults(), remote ?? {});
    this.current = merged;
    this.store.set(merged);
    return merged;
  }
}

// Singleton – die Hardware-Plugins lesen synchron beim Boot daraus.
export const configService = new ConfigService();
