// src/lib/gpio/types.ts
export type GpioLevel = 0 | 1;

/**
 * Minimaler GPIO-Treiber, unabhängig von der konkreten Bibliothek.
 * Backends: 'gpiox' (Pi 5 / char-device V2) und 'pigpio' (Pi ≤4, /dev/mem).
 */
export interface GpioDriver {
  readonly name: string;

  /**
   * Überwacht einen Eingangspin (mit Pull-up) und ruft `onChange` bei jeder
   * (entprellten) Pegeländerung mit dem neuen Pegel (0/1) auf.
   */
  watchButton(pin: number, debounceMs: number, onChange: (level: GpioLevel) => void): void;

  /** Setzt einen Ausgangspin für `ms` auf HIGH, danach LOW (Buzzer/LED-Impuls). */
  pulse(pin: number, ms: number): void;

  /** Gibt alle belegten Pins/Timer frei. */
  close(): void;
}
