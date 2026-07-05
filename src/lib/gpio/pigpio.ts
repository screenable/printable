// src/lib/gpio/pigpio.ts
//
// GPIO-Backend für Raspberry Pi ≤ 4 über die pigpio-C-Bibliothek (/dev/mem,
// braucht root). Funktioniert NICHT auf dem Pi 5. Nur aktiv, wenn
// GPIO_BACKEND=pigpio gesetzt ist.
import type { GpioDriver, GpioLevel } from './types';

interface PigpioLine {
  glitchFilter(steady: number): void;
  on(event: 'alert', cb: (level: number) => void): void;
  digitalWrite(level: number): void;
  disableAlert(): void;
  removeAllListeners(event: string): void;
}
interface PigpioGpioCtor {
  new (pin: number, opts: Record<string, unknown>): PigpioLine;
  INPUT: number;
  OUTPUT: number;
  PUD_UP: number;
}

export function createPigpioDriver(): GpioDriver {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Gpio } = require('pigpio') as { Gpio: PigpioGpioCtor };

  const inputs: PigpioLine[] = [];
  const outputs = new Map<number, PigpioLine>();

  return {
    name: 'pigpio',

    watchButton(pin, debounceMs, onChange) {
      const g = new Gpio(pin, { mode: Gpio.INPUT, pullUpDown: Gpio.PUD_UP, alert: true });
      g.glitchFilter(debounceMs * 1000); // pigpio erwartet µs
      g.on('alert', (level: number) => onChange((level ? 1 : 0) as GpioLevel));
      inputs.push(g);
    },

    pulse(pin, ms) {
      let g = outputs.get(pin);
      if (!g) {
        g = new Gpio(pin, { mode: Gpio.OUTPUT });
        outputs.set(pin, g);
      }
      g.digitalWrite(1);
      setTimeout(() => {
        try {
          g?.digitalWrite(0);
        } catch {
          /* ignore */
        }
      }, ms);
    },

    close() {
      for (const g of inputs.splice(0)) {
        try {
          g.disableAlert();
          g.removeAllListeners('alert');
        } catch {
          /* ignore */
        }
      }
    },
  };
}
