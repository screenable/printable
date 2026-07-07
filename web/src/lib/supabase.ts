import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { reactive } from 'vue';

const LS_URL = 'printable.supabaseUrl';
const LS_KEY = 'printable.supabaseKey';

// Build-Zeit-Defaults (z.B. Netlify/Vercel-Env). Sind sie gesetzt, ist die
// Verbindung fest verdrahtet und der Nutzer muss nur noch Login-Daten eingeben.
const ENV_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const ENV_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

/** Verbindung ist über Env vorgegeben – kein manuelles URL/Key-Feld nötig. */
export const connectionFromEnv = Boolean(ENV_URL && ENV_KEY);

export const settings = reactive({
  url: ENV_URL || localStorage.getItem(LS_URL) || '',
  key: ENV_KEY || localStorage.getItem(LS_KEY) || '',
});

/** Reaktiver Auth-Zustand für Router-Guard und UI. */
export const auth = reactive<{ user: User | null; session: Session | null; ready: boolean }>({
  user: null,
  session: null,
  ready: false,
});

let _client: SupabaseClient | null = null;
let _signature = '';
let _authSub: { unsubscribe: () => void } | null = null;

function subscribeAuth(client: SupabaseClient): void {
  _authSub?.unsubscribe();
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    auth.session = session;
    auth.user = session?.user ?? null;
  });
  _authSub = data.subscription;
}

export function saveSettings(url: string, key: string): void {
  settings.url = url.trim();
  settings.key = key.trim();
  if (!connectionFromEnv) {
    localStorage.setItem(LS_URL, settings.url);
    localStorage.setItem(LS_KEY, settings.key);
  }
  // Erzwingt Neuaufbau des Clients (inkl. Auth-Subscription) beim nächsten Zugriff.
  _client = null;
  _signature = '';
}

export function isConfigured(): boolean {
  return Boolean(settings.url && settings.key);
}

/** Liefert den Supabase-Client oder null, wenn noch keine Verbindung gesetzt ist. */
export function getClient(): SupabaseClient | null {
  if (!isConfigured()) return null;
  const sig = settings.url + '|' + settings.key;
  if (!_client || sig !== _signature) {
    _client = createClient(settings.url, settings.key, {
      auth: {
        // Session im localStorage halten, damit der Login über Reloads bestehen bleibt.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'printable.auth',
      },
    });
    _signature = sig;
    subscribeAuth(_client);
  }
  return _client;
}

/** Beim App-Start die evtl. gespeicherte Session laden. */
export async function initAuth(): Promise<void> {
  const c = getClient();
  if (c) {
    const { data } = await c.auth.getSession();
    auth.session = data.session;
    auth.user = data.session?.user ?? null;
  }
  auth.ready = true;
}

export function isAuthenticated(): boolean {
  return Boolean(auth.session);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: Error | null }> {
  const c = getClient();
  if (!c) return { error: new Error('Keine Supabase-Verbindung konfiguriert.') };
  const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  return { error };
}

export async function signOut(): Promise<void> {
  const c = getClient();
  if (c) await c.auth.signOut();
  auth.session = null;
  auth.user = null;
}
