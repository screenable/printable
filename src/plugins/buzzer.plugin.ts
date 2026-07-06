import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { configService } from '../app-context';
import { createGpioDriver } from '../lib/gpio';

export default fp(async fastify => {
  const gpio = configService.get().gpio;

  const driver = createGpioDriver(gpio.backend, fastify.log);
  if (!driver) {
    fastify.log.warn('GPIO deaktiviert – Button/Buzzer nicht verfügbar.');
    return;
  }
  fastify.log.info(
    { backend: driver.name, buttonPin: gpio.buttonPin, buzzerLedPin: gpio.buzzerLedPin, pressedLevel: gpio.pressedLevel },
    'GPIO initialisiert',
  );

  // Buzzer/LED beim Start kurz auslösen (Lebenszeichen).
  try {
    driver.pulse(gpio.buzzerLedPin, 2000);
  } catch (err) {
    fastify.log.error({ err }, 'Buzzer/LED-Init fehlgeschlagen');
  }

  // Ersten Pegelwechsel direkt nach dem Init ignorieren (Störimpuls beim Setup).
  let initializing = true;
  setTimeout(() => {
    initializing = false;
  }, 1000);

  try {
    driver.watchButton(gpio.buttonPin, gpio.debounceMs, level => {
      if (initializing) {
        initializing = false;
        fastify.log.debug({ level }, 'Initialer GPIO-Flankenwechsel ignoriert');
        return;
      }
      // pressedLevel bestimmt, welcher Pegel „gedrückt" bedeutet (Wiring-abhängig).
      if (level === gpio.pressedLevel) {
        fastify.log.info(`Button pressed (GPIO${gpio.buttonPin})`);
        bus.emit('button.press', { pin: gpio.buttonPin });
      } else {
        bus.emit('button.release', { pin: gpio.buttonPin });
      }
    });
  } catch (err) {
    fastify.log.error({ err }, 'Button-Überwachung fehlgeschlagen – GPIO deaktiviert');
  }

  fastify.addHook('onClose', (_instance, done) => {
    try {
      driver.close();
    } catch {
      /* ignore */
    }
    done();
  });
});
