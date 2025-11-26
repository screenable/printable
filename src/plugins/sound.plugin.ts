import fp from 'fastify-plugin';
import player from 'play-sound';
import { bus } from '../event-bus';
import path from 'node:path';
import fs from 'node:fs/promises';

interface SoundPlugin {
  playBeep: () => Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    sound: SoundPlugin;
  }
}

export default fp(async fastify => {
  // Player-Instanz
  const audio = player({player:'aplay'});

  // 📁 Absoluter Pfad zur WAV-Datei (nicht relativ!)
  const soundFile = path.resolve(__dirname, '..', 'assets', 'sounds', 'beep.wav');

  // ✅ Prüfen, ob Datei existiert
  try {
    await fs.access(soundFile);
    fastify.log.info(`🎵 Sounddatei gefunden: ${soundFile}`);
  } catch {
    fastify.log.error(`❌ Sounddatei nicht gefunden: ${soundFile}`);
  }

  const soundPlugin: SoundPlugin = {
    playBeep: async () => {
      return new Promise<void>((resolve, reject) => {
        const start = Date.now();

        const child = audio.play(soundFile, {aplay:['-D', 'sysdefault:Headphones']}, err => {
          if (err) {
            fastify.log.error({
              msg: '❌ Fehler beim Abspielen des Sounds mit aplay',
              soundFile,
              error: String(err),
              hint: [
                'Ist aplay installiert?',
                'Stimmt der Pfad zur WAV-Datei?',
                'Läuft der Service mit Zugriff auf die Audio-Hardware?',
              ],
            });
            return reject(err);
          }

          fastify.log.info(`🔊 Beep-Sound erfolgreich abgespielt (${Date.now() - start} ms)`);
          resolve();
        });

        // Debug-Ausgabe
        child.on('spawn', () => {
          // @ts-ignore
          const cmd = child?.spawnfile || 'aplay';
          // @ts-ignore
          const args = child?.spawnargs || [];
          fastify.log.debug({ msg: '▶️ aplay gestartet', cmd, args });
        });
      });
    },
  };

  // Plugin registrieren
  fastify.decorate('sound', soundPlugin);

  // 🎛️ Event-Listener für Button-Press
  bus.on('button.press', async data => {
    fastify.log.info(`🔘 Button press auf Pin ${data.pin}, spiele beep.wav ...`);
    try {
      await soundPlugin.playBeep();
    } catch (err) {
      fastify.log.error('❌ Fehler beim Abspielen des Beeps:', err);
    }
  });

  fastify.log.info('🎵 Sound-Plugin mit aplay initialisiert');
});
