// src/plugins/supabase.plugin.ts
import fp from 'fastify-plugin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';
import type { Database } from '../types/database.types';

declare module 'fastify' {
  interface FastifyInstance {
    supabase: SupabaseClient<Database>;
  }
}

export default fp(async (fastify) => {
  const supabase = createClient<Database>(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
    auth: {
      persistSession: false, // Don't persist session for server-side app
    },
    global: {
      headers: {
        'x-application-name': 'printable-worker',
      },
    },
  });
  
  fastify.decorate('supabase', supabase);
  
  // Verify connection on startup
  try {
    const { error } = await supabase.from('print_jobs').select('id').limit(1);
    if (error) {
      fastify.log.warn({ error }, 'Supabase connection check failed');
    } else {
      fastify.log.info('Supabase connection verified');
    }
  } catch (err) {
    fastify.log.error({ error: err }, 'Failed to verify Supabase connection');
  }
  
  // Optional: bei Shutdown sauber beenden
  fastify.addHook('onClose', async (_instance) => {
    try {
      await supabase.removeAllChannels();
      fastify.log.info('Supabase channels cleaned up');
    } catch (err) {
      fastify.log.warn({ error: err }, 'Error cleaning up Supabase channels');
    }
  });
});