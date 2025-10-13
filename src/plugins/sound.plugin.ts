import fp from 'fastify-plugin';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { bus } from '../event-bus';

const execAsync = promisify(exec);

interface SoundPlugin {
  playBeep: () => Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    sound: SoundPlugin;
  }
}

export default fp(async (fastify) => {
  // Check available audio commands on startup
  let audioCommand: string | null = null;
  const commands = ['beep', 'paplay /usr/share/sounds/alsa/Front_Left.wav', 'aplay /usr/share/sounds/alsa/Front_Left.wav', 'speaker-test -t sine -f 1000 -l 1'];
  
  for (const cmd of commands) {
    try {
      const cmdName = cmd.split(' ')[0];
      await execAsync(`which ${cmdName}`);
      audioCommand = cmd;
      fastify.log.info(`🔊 Sound plugin initialized with command: ${cmdName}`);
      break;
    } catch {
      // Command not available, try next
    }
  }
  
  if (!audioCommand) {
    fastify.log.warn('⚠️ No audio command available. Sound will be logged only.');
  }

  const soundPlugin: SoundPlugin = {
    playBeep: async () => {
      if (audioCommand) {
        try {
          await execAsync(audioCommand);
          fastify.log.info('🔊 Beep sound played');
        } catch (error) {
          fastify.log.error('❌ Failed to play sound:', error);
        }
      } else {
        fastify.log.info('🔊 BEEP! (Sound would play here if audio system available)');
      }
    }
  };

  // Register the sound plugin
  fastify.decorate('sound', soundPlugin);

  // Listen for button press events and play sound
  bus.on('button.press', async (data) => {
    fastify.log.info(`🔊 Button press detected on pin ${data.pin}, playing sound...`);
    await soundPlugin.playBeep();
  });

  fastify.log.info('🔊 Sound plugin registered and listening for button.press events');
});