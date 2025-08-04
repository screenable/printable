import Fastify from 'fastify';
import autoLoad from '@fastify/autoload';
import path from 'node:path';
import keyboardPlugin from './plugins/keyboard.plugin';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

server.register(autoLoad, {
  dir: path.join(__dirname, 'routes'),
});




export default server;
