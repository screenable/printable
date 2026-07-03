// src/lib/supabase-client.ts
//
// Gemeinsamer Supabase-Client für den Sync-Service. Bewusst untypisiert
// (ohne Database-Generic), damit auch die neuen Tabellen (devices,
// device_templates, voucher_pool) und RPCs ohne Typ-Reibung nutzbar sind.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../config';

export const supabase: SupabaseClient = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: false },
});
