import fp from 'fastify-plugin';
import readline from 'node:readline';
import { bus } from '../event-bus';

// Nur im interaktiven Terminal aktiv (dev/bench). Unter systemd gibt es kein
// TTY -> das Plugin bleibt wirkungslos. Leertaste/„p" löst button.press aus,
// damit man den Dispense-/Druckablauf ohne echte GPIO-Hardware testen kann.
export default fp(async fastify => {
  if (!process.stdin.isTTY) {
    fastify.log.info('Kein TTY – Tastatur-Trigger deaktiviert.');
    return;
  }
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on('keypress', (_str, key) => {
    if (key?.ctrl && key.name === 'c') {
      process.exit(0); // Ctrl+C weiterhin zum Beenden
    }
    bus.emit('keyboard.press', key?.name);
    if (key?.name === 'space' || key?.name === 'p') {
      fastify.log.info('Tastatur-Trigger -> button.press');
      bus.emit('button.press', { pin: -1, source: 'keyboard' });
    }
  });
  fastify.log.info('Tastatur-Trigger aktiv: Leertaste/„p" = Knopfdruck.');
});
