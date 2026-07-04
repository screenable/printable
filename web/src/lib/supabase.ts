import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { reactive } from 'vue';

const LS_URL = 'printable.supabaseUrl';
const LS_KEY = 'printable.supabaseKey';

export const settings = reactive({
  url: localStorage.getItem(LS_URL) || '',
  key: localStorage.getItem(LS_KEY) || '',
});

let _client: SupabaseClient | null = null;
let _signature = '';

export function saveSettings(url: string, key: string): void {
  settings.url = url.trim();
  settings.key = key.trim();
  localStorage.setItem(LS_URL, settings.url);
  localStorage.setItem(LS_KEY, settings.key);
  _client = null; // beim nächsten Zugriff neu erstellen
}

export function isConfigured(): boolean {
  return Boolean(settings.url && settings.key);
}

/** Liefert den Supabase-Client oder null, wenn noch keine Zugangsdaten gesetzt sind. */
export function getClient(): SupabaseClient | null {
  if (!isConfigured()) return null;
  const sig = settings.url + '|' + settings.key;
  if (!_client || sig !== _signature) {
    _client = createClient(settings.url, settings.key, { auth: { persistSession: false } });
    _signature = sig;
  }
  return _client;
}
