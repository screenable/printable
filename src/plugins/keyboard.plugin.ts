import fp from 'fastify-plugin';
import readline from 'node:readline';
import { bus } from '../event-bus';

export default fp(async () => {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY)
    process.stdin.setRawMode(true);
  process.stdin.on('keypress', (_, key) => {
    
        bus.emit('keyboard.press', key?.name);
  });
});