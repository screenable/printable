// src/plugins/gpio.plugin.ts
import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { CONFIG } from '../config';
import type { Gpio as OnOffGpio } from 'onoff';

type GpioLike = Pick<OnOffGpio, 'watch' | 'unexport'>;

export default fp(async (fastify) => {
  let gpio: GpioLike;

  if (process.platform === 'linux') {
    // echtes Raspberry-Pi GPIO
    const { Gpio } = require('onoff') as typeof import('onoff');
    // Wir casten zu OnOffGpio, damit TS weiß, dass watch() die korrekte Signatur hat
    const realGpio = new Gpio(
      CONFIG.GPIO_PIN,
      'in',
      'both',
      { debounceTimeout: CONFIG.DEBOUNCE_MS ?? 10 }
    ) as OnOffGpio;
    gpio = realGpio;
  } else {
    // Dummy-Implementation für macOS & Co.
    console.warn('⚠️ GPIO stub active (non-Linux platform). No real GPIO will be accessed.');
    gpio = {
      watch: (cb) => {
        // Simuliere Test-Events in der Dev-Umgebung:
        setInterval(() => cb(null, 1), 5000);
        setInterval(() => cb(null, 0), 5500);
      },
      unexport: () => { /* no-op */ }
    };
  }

  gpio.watch((err, value) => {
    if (err) {
      fastify.log.error('GPIO watch error', err);
      return;
    }
    if (value === 1) {
      fastify.log.info(`Button pressed on pin ${CONFIG.GPIO_PIN}`);
      bus.emit('button.press', { pin: CONFIG.GPIO_PIN });
    } else {
      fastify.log.info(`Button released on pin ${CONFIG.GPIO_PIN}`);
      bus.emit('button.release', { pin: CONFIG.GPIO_PIN });
    }
  });

  fastify.addHook('onClose', (_instance, done) => {
    gpio.unexport();
    done();
  });
});