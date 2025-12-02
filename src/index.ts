import buzzerPlugin from './plugins/buzzer.plugin';
import keyboardPlugin from './plugins/keyboard.plugin';
import soundPlugin from './plugins/sound.plugin';
import webhookPlugin from './plugins/webhook.plugin';
import supabasePlugin from './plugins/supabase.plugin';
import ledPlugin from './plugins/led.plugin';
import { startPrintWorker } from './print-worker';
import server from './server';
import { autoUpdate } from './helpers/auto-updater';

const port = Number(process.env.PORT) || 3000;

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  server.log.info(`${signal} received, starting graceful shutdown`);
  
  try {
    await server.close();
    server.log.info('Server closed successfully');
    process.exit(0);
  } catch (err) {
    server.log.error({ error: err }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  server.log.fatal({ error: err }, 'Uncaught exception');
  // Give time for logs to flush
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  server.log.fatal({ reason, promise }, 'Unhandled promise rejection');
  // Give time for logs to flush
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

async function main() {
  // Check for updates at startup if enabled
  if (process.env.AUTO_UPDATE_ENABLED === 'true') {
    const owner = process.env.GITHUB_OWNER || 'screenable';
    const repo = process.env.GITHUB_REPO || 'printable';
    const autoApply = process.env.AUTO_UPDATE_APPLY === 'true';
    const token = process.env.GITHUB_TOKEN; // Optional: required for private repos
    
    try {
      await autoUpdate(owner, repo, autoApply, token);
    } catch (error) {
      server.log.warn('Auto-update check failed:', error);
    }
  }

  await server.register(keyboardPlugin);
  await server.register(supabasePlugin);
  await server.register(soundPlugin);
  await server.register(buzzerPlugin);
  await server.register(webhookPlugin);
  await server.register(ledPlugin);
  await startPrintWorker(server);
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
  console.error('Fatal error during startup:', err);
  process.exit(1);
});