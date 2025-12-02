// src/plugins/memory-monitor.plugin.ts
import fp from 'fastify-plugin';

const MEMORY_CHECK_INTERVAL_MS = 60000; // Check every minute
const MEMORY_WARNING_THRESHOLD_MB = 400; // Warn if heap usage exceeds this
const MEMORY_CRITICAL_THRESHOLD_MB = 700; // Critical if heap usage exceeds this

export default fp(async fastify => {
  const checkMemoryUsage = () => {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);

    fastify.log.debug(
      { heapUsedMB, heapTotalMB, rssMB },
      'Memory usage check'
    );

    if (heapUsedMB > MEMORY_CRITICAL_THRESHOLD_MB) {
      fastify.log.error(
        { heapUsedMB, heapTotalMB, rssMB, threshold: MEMORY_CRITICAL_THRESHOLD_MB },
        'CRITICAL: Memory usage is very high! Consider restarting the application.'
      );
      
      // Force garbage collection if available (requires --expose-gc flag)
      if (global.gc) {
        fastify.log.info('Running garbage collection');
        global.gc();
      }
    } else if (heapUsedMB > MEMORY_WARNING_THRESHOLD_MB) {
      fastify.log.warn(
        { heapUsedMB, heapTotalMB, rssMB, threshold: MEMORY_WARNING_THRESHOLD_MB },
        'WARNING: Memory usage is elevated'
      );
    }
  };

  // Start periodic memory monitoring
  const intervalId = setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL_MS);

  fastify.addHook('onClose', (_instance, done) => {
    if (intervalId) {
      clearInterval(intervalId);
      fastify.log.info('Memory monitor stopped');
    }
    done();
  });

  fastify.log.info(
    { intervalMs: MEMORY_CHECK_INTERVAL_MS, warningThresholdMB: MEMORY_WARNING_THRESHOLD_MB },
    'Memory monitor initialized'
  );
});
