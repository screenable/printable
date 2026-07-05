// src/lib/gpio/gpiox.ts
//
// GPIO-Backend für Raspberry Pi 5 (und alle 64-bit-Pis) über @iiot2k/gpiox.
// gpiox nutzt das Linux GPIO-Character-Device V2 (nicht das alte /dev/mem von
// pigpio) und funktioniert daher auf dem RP1-GPIO des Pi 5. BCM-Pin-Nummern.
//
// gpiox hat KEINE Interrupt-/Watch-Callbacks – der Button wird gepollt. Die
// Entprellung übernimmt gpiox selbst (Parameter in µs bei init_gpio).
import type { GpioDriver, GpioLevel } from './types';

const POLL_MS = 5;

// Minimales Interface des nativen Moduls (lazy required, daher hier getypt).
interface Gpiox {
  GPIO_MODE_INPUT_PULLUP: number;
  GPIO_MODE_OUTPUT: number;
  init_gpio(pin: number, mode: number, setval: number | boolean): boolean;
  get_gpio(pin: number): boolean;
  set_gpio(pin: number, value: number | boolean): boolean;
  deinit_gpio(pin: number): boolean;
  error_text(): string;
}

export function createGpioxDriver(): GpioDriver {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const gpiox = require('@iiot2k/gpiox') as Gpiox;

  const pins: number[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];

  return {
    name: 'gpiox',

    watchButton(pin, debounceMs, onChange) {
      const debounceUs = Math.max(0, Math.round(debounceMs * 1000));
      if (!gpiox.init_gpio(pin, gpiox.GPIO_MODE_INPUT_PULLUP, debounceUs)) {
        throw new Error(`gpiox init input GPIO${pin} failed: ${gpiox.error_text()}`);
      }
      pins.push(pin);

      let last: GpioLevel = gpiox.get_gpio(pin) ? 1 : 0;
      const timer = setInterval(() => {
        const level: GpioLevel = gpiox.get_gpio(pin) ? 1 : 0;
        if (level !== last) {
          last = level;
          onChange(level);
        }
      }, POLL_MS);
      timers.push(timer);
    },

    pulse(pin, ms) {
      if (!gpiox.init_gpio(pin, gpiox.GPIO_MODE_OUTPUT, 0)) {
        throw new Error(`gpiox init output GPIO${pin} failed: ${gpiox.error_text()}`);
      }
      if (!pins.includes(pin)) pins.push(pin);
      gpiox.set_gpio(pin, 1);
      setTimeout(() => {
        try {
          gpiox.set_gpio(pin, 0);
        } catch {
          /* ignore */
        }
      }, ms);
    },

    close() {
      for (const t of timers.splice(0)) clearInterval(t);
      for (const pin of pins.splice(0)) {
        try {
          gpiox.deinit_gpio(pin);
        } catch {
          /* ignore */
        }
      }
    },
  };
}
