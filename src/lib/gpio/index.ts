// src/lib/gpio/index.ts
import type { GpioDriver } from './types';

export type { GpioDriver, GpioLevel } from './types';

interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Lädt das gewünschte GPIO-Backend. Schlägt das Laden fehl (Modul nicht
 * installiert / falsche Plattform), wird null zurückgegeben und GPIO ist
 * deaktiviert – der Rest der Box (Drucken, Sync, Tastatur) läuft weiter.
 */
export function createGpioDriver(backend: string, log: Logger): GpioDriver | null {
  if (backend === 'none') {
    log.warn({}, 'GPIO-Backend "none" – Button/Buzzer deaktiviert.');
    return null;
  }
  try {
    if (backend === 'pigpio') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('./pigpio').createPigpioDriver();
    }
    // Default: gpiox (Pi 5 / char-device V2)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./gpiox').createGpioxDriver();
  } catch (err) {
    log.error({ err, backend }, 'GPIO-Backend konnte nicht geladen werden – GPIO deaktiviert.');
    return null;
  }
}
