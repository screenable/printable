import type { FastifyPluginCallback, RouteHandlerMethod } from 'fastify';

const register: FastifyPluginCallback = (server, options, done) => {
  const getHealth: RouteHandlerMethod = async (request, reply) => {
    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        rss: process.memoryUsage().rss,
      },
      environment: process.env.NODE_ENV || process.env.ENVIRONMENT || 'development',
    };

    return reply.status(200).send(healthStatus);
  };

  const healthSchema = {
    type: 'object',
    properties: {
      status: { type: 'string' },
      timestamp: { type: 'string' },
      uptime: { type: 'number' },
      memory: {
        type: 'object',
        properties: {
          heapUsed: { type: 'number' },
          heapTotal: { type: 'number' },
          rss: { type: 'number' },
        },
      },
      environment: { type: 'string' },
    },
  };

  server.get(
    '/health',
    {
      schema: {
        response: {
          200: healthSchema,
        },
      },
      handler: getHealth,
    },
  );

  done();
};

export default register;
