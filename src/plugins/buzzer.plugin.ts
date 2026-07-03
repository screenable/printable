import fp from 'fastify-plugin';
import { Gpio, Gpio as PigpioGpio } from 'pigpio';
import { bus } from '../event-bus';
import { configService } from '../app-context';

type GpioLike = {
  on: (event: 'interrupt', cb: (level: 0 | 1) => void) => void;
  disableInterrupt: () => void;
};

export default fp(async fastify => {
  const gpioCfg = configService.get().gpio;
  fastify.log.info(`🐷 Initialisiere pigpio für GPIO${gpioCfg.buttonPin}`);

  const realGpio = new PigpioGpio(gpioCfg.buttonPin, {
    mode: PigpioGpio.INPUT,
    pullUpDown: Gpio.PUD_UP,
    alert: true,
  });

  const led = new PigpioGpio(gpioCfg.buzzerLedPin, { mode: PigpioGpio.OUTPUT });
  led.digitalWrite(1);
  setTimeout(() => {
    led.digitalWrite(0);
  }, 2000);

  // optional: software-debounce (in ms)
  const debounceMs = gpioCfg.debounceMs ?? 10;
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

  // Fallback timeout in ms to reset initialization flag
  const INIT_TIMEOUT_MS = 1000;

  // Fallback: reset the initialization flag after a short delay even if no interrupt occurs
  setTimeout(() => {
    if (isInitializing) {
      fastify.log.debug(`Initialization period ended for GPIO${gpioCfg.buttonPin} (no interrupt occurred)`);
      isInitializing = false;
    }
  }, INIT_TIMEOUT_MS);

  gpio.on('interrupt', value => {
    // Ignore the first interrupt event that may occur during GPIO initialization
    if (isInitializing) {
      fastify.log.debug(`Ignoring initial GPIO interrupt during initialization (pin ${gpioCfg.buttonPin}, value ${value})`);
      isInitializing = false;
      return;
    }

    if (value === 1) {
      fastify.log.info(`Button pressed on pin ${gpioCfg.buttonPin}`);
      bus.emit('button.press', { pin: gpioCfg.buttonPin });
    } else {
      fastify.log.info(`Button released on pin ${gpioCfg.buttonPin}`);
      bus.emit('button.release', { pin: gpioCfg.buttonPin });
    }
  });

  fastify.addHook('onClose', (_instance, done) => {
    gpio.disableInterrupt();
    done();
  });
});