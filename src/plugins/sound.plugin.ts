import fp from 'fastify-plugin';
import player from 'play-sound';
import { bus } from '../event-bus';

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
  const audio = player();

  const soundFile = '../assets/sounds/beep.mp3';

  const soundPlugin: SoundPlugin = {
    playBeep: async () => {
      return new Promise<void>((resolve, reject) => {
        audio.play(soundFile, err => {
          if (err) {
            fastify.log.error('❌ Fehler beim Abspielen des Sounds:', err);
            return reject(err);
          }
          fastify.log.info('🔊 Beep-Sound erfolgreich abgespielt');
          resolve();
        });
      });
    },
  };

  // Plugin registrieren
  fastify.decorate('sound', soundPlugin);

  // Eventlistener für Button-Press
  bus.on('button.press', async data => {
    fastify.log.info(`🔘 Button press auf Pin ${data.pin}, spiele beep.mp3 ...`);
    try {
      await soundPlugin.playBeep();
    } catch (err) {
      fastify.log.error('❌ Fehler beim Abspielen des Beeps:', err);
    }
  });

  fastify.log.info('🎵 Sound-Plugin mit play-sound initialisiert');
});
