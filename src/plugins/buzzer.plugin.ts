import fp from 'fastify-plugin';
import { Gpio, Gpio as PigpioGpio } from 'pigpio';
import { bus } from '../event-bus';
import { CONFIG } from '../config';

type GpioLike = {
  on: (event: 'interrupt', cb: (level: 0 | 1) => void) => void;
  disableInterrupt: () => void;
};

export default fp(async fastify => {
  fastify.log.info(`🐷 Initialisiere pigpio für GPIO${CONFIG.GPIO_PIN}`);

  const realGpio = new PigpioGpio(CONFIG.GPIO_PIN, {
    mode: PigpioGpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert: true,
  });

  const led = new PigpioGpio(5, { mode: PigpioGpio.OUTPUT });
  led.digitalWrite(1);
  setTimeout(() => {
    led.digitalWrite(0);
  }, 2000);

  // optional: software-debounce (in ms)
  const debounceMs = CONFIG.DEBOUNCE_MS ?? 10;
  realGpio.glitchFilter(debounceMs * 1000); // pigpio erwartet µs

  const gpio: GpioLike = {
    on: (event, cb) => {
      if (event === 'interrupt') {
        realGpio.on('alert', (level: number) => cb(level as 0 | 1));
      }
    },
    disableInterrupt: () => {
      realGpio.disableAlert();
      realGpio.removeAllListeners('alert');
      realGpio.digitalRead(); // forces final state read
    },
  };

  // Flag to ignore spurious interrupts during initialization
  let isInitializing = true;

  gpio.on('interrupt', value => {
    // Ignore the first interrupt event that may occur during GPIO initialization
    if (isInitializing) {
      fastify.log.debug(`Ignoring initial GPIO interrupt during initialization (pin ${CONFIG.GPIO_PIN}, value ${value})`);
      isInitializing = false;
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
    gpio.disableInterrupt();
    done();
  });
});