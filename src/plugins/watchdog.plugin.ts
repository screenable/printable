// src/plugins/watchdog.plugin.ts
import fp from 'fastify-plugin';

const WATCHDOG_INTERVAL_MS = 30000; // Check every 30 seconds
const WATCHDOG_TIMEOUT_MS = 60000; // Consider hung if no activity for 60 seconds

export default fp(async fastify => {
  let lastActivity = Date.now();

  // Update activity timestamp on any request
  fastify.addHook('onRequest', async () => {
    lastActivity = Date.now();
  });

  // Also update on internal events
  const updateActivity = () => {
    lastActivity = Date.now();
  };

  // Monitor activity
  const checkWatchdog = () => {
    const now = Date.now();
    const timeSinceActivity = now - lastActivity;

    if (timeSinceActivity > WATCHDOG_TIMEOUT_MS) {
      fastify.log.error(
        { timeSinceActivityMs: timeSinceActivity, timeoutMs: WATCHDOG_TIMEOUT_MS },
        'WATCHDOG: No activity detected - possible hang!'
      );
      
      // Log current state for debugging
      fastify.log.error({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid,
      }, 'WATCHDOG: Process state at hang detection');
    } else {
      fastify.log.debug(
        { timeSinceActivityMs: timeSinceActivity },
        'Watchdog check OK'
      );
    }
  };

  // Start watchdog monitoring
  const watchdogInterval = setInterval(checkWatchdog, WATCHDOG_INTERVAL_MS);
  
  // Update activity on startup
  updateActivity();

  fastify.addHook('onClose', (_instance, done) => {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      fastify.log.info('Watchdog stopped');
    }
    done();
  });

  fastify.log.info(
    { intervalMs: WATCHDOG_INTERVAL_MS, timeoutMs: WATCHDOG_TIMEOUT_MS },
    'Watchdog initialized'
  );
});
