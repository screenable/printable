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
        
        // Set a timeout to prevent hanging
        const timeout = setTimeout(() => {
          fastify.log.warn('Sound playback timeout - continuing anyway');
          resolve(); // Don't reject, audio is not critical
        }, 5000); // 5 second timeout

        const child = audio.play(soundFile, {aplay:['-D', 'sysdefault:Headphones']}, err => {
          clearTimeout(timeout);
          
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
            // Don't reject - audio failure should not stop the application
            return resolve();
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
      // Log but don't crash - audio is not critical for operation
      fastify.log.warn({ error: err }, '❌ Fehler beim Abspielen des Beeps (nicht kritisch)');
    }
  });

  fastify.log.info('🎵 Sound-Plugin mit aplay initialisiert');
});
