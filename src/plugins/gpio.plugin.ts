import fp from 'fastify-plugin';
import { Gpio as PigpioGpio } from 'pigpio';
import { bus } from '../event-bus';
import { CONFIG } from '../config';

type GpioLike = {
  on: (event: 'interrupt', cb: (level: 0 | 1) => void) => void;
  disableInterrupt: () => void;
};

export default fp(async (fastify) => {
  let gpio: GpioLike;

  if (process.platform === 'linux') {
    fastify.log.info(`🐷 Initialisiere pigpio für GPIO${CONFIG.GPIO_PIN}`);

    const realGpio = new PigpioGpio(CONFIG.GPIO_PIN, {
      mode: PigpioGpio.INPUT,
      alert: true,
    });

    // optional: software-debounce (in ms)
    const debounceMs = CONFIG.DEBOUNCE_MS ?? 10;
    realGpio.glitchFilter(debounceMs * 1000); // pigpio erwartet µs

    gpio = {
      on: (event, cb) => {
        if (event === 'interrupt') {
          realGpio.on('alert', (level) => cb(level as 0 | 1));
        }
      },
      disableInterrupt: () => {
        realGpio.disableAlert();
        realGpio.removeAllListeners('alert');
        realGpio.digitalRead(); // forces final state read
      },
    };
  } else {
    console.warn('⚠️ GPIO stub active (non-Linux platform). No real GPIO will be accessed.');
    gpio = {
      on: (event, cb) => {
        if (event === 'interrupt') {
          setInterval(() => cb(1), 5000);
          setInterval(() => cb(0), 5500);
        }
      },
      disableInterrupt: () => { /* no-op */ },
    };
  }

  gpio.on('interrupt', (value) => {
    if (value === 1) {
      fastify.log.info(`Button pressed on pin ${CONFIG.GPIO_PIN}`);
      bus.emit('button.press', { pin: CONFIG.GPIO_PIN });
    } else {
      fastify.log.info(`Button released on pin ${CONFIG.GPIO_PIN}`);
      bus.emit('button.release', { pin: CONFIG.GPIO_PIN });
    }
  });

  fastify.addHook('onClose', (_instance, done) => {
    gpio.disableInterrupt();
    done();
  });
});