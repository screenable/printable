import buzzerPlugin from './plugins/buzzer.plugin';
import keyboardPlugin from './plugins/keyboard.plugin';
import soundPlugin from './plugins/sound.plugin';
import dispensePlugin from './plugins/dispense.plugin';
import supabasePlugin from './plugins/supabase.plugin';
import ledPlugin from './plugins/led.plugin';
import { startPrintWorker } from './print-worker';
import { SyncService } from './services/sync-service';
import { UpdaterService } from './services/updater-service';
import { assertConfig, CONFIG } from './config';
import { logEvent, configService } from './app-context';
import { getCurrentVersion } from './helpers/auto-updater';
import server from './server';

const port = Number(process.env.PORT) || 3000;

async function main() {
  assertConfig();

  await server.register(keyboardPlugin);

  // 1) Erst-Sync der Konfiguration BEVOR die Hardware-Plugins starten, damit
  //    Drucker/GPIO/LED/Cooldown aus Supabase (devices.config) kommen. Offline
  //    fällt das leise auf den lokalen Cache / die Defaults zurück.
  const sync = new SyncService({ log: server.log });
  await sync.pullConfig();
  await sync.pullTemplates();

  await server.register(supabasePlugin);
  await server.register(soundPlugin);
  await server.register(buzzerPlugin);
  await server.register(dispensePlugin);
  await server.register(ledPlugin);
  await startPrintWorker(server);

  logEvent('info', 'startup', 'Box gestartet', {
    version: getCurrentVersion(),
    device: CONFIG.DEVICE_ID,
    gpioBackend: configService.get().gpio.backend,
  });

  // 2) Periodischen Hintergrund-Sync + kontrollierten Self-Updater starten.
  sync.start();
  const updater = new UpdaterService({
    log: server.log,
    getDesiredVersion: () => sync.desiredVersion,
  });
  updater.start();

  server.addHook('onClose', (_i, done) => {
    sync.stop();
    updater.stop();
    done();
  });

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
