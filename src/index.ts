import gpioPlugin from './plugins/gpio.plugin';
import keyboardPlugin from './plugins/keyboard.plugin';
import soundPlugin from './plugins/sound.plugin';
import supabasePlugin from './plugins/supabase.plugin';
import { startPrintWorker } from './print-worker';
import server from './server';

const port = Number(process.env.PORT) || 3000;


async function main() {
  await server.register(keyboardPlugin);
  await server.register(supabasePlugin)
  await server.register(soundPlugin)
  await server.register(gpioPlugin)
  await startPrintWorker(server)
  await server.listen(
  {
    port,
    host: '0.0.0.0',
  },
  (err, address) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    server.log.info(`Server running on ${address}`);
  },
);
 

}
main().catch(err => {
  console.error(err);
  process.exit(1);
});