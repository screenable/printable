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
  const supabase = createClient<Database>(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  fastify.decorate('supabase', supabase);
  // 3. Optional: bei Shutdown sauber beenden
  fastify.addHook('onClose', (_instance, done) => {
    setTimeout(async() => {
        await supabase.removeAllChannels()
    }, 20);
    done();
  });
});