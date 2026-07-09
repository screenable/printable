<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  connectionFromEnv,
  isConfigured,
  saveSettings,
  settings,
  signInWithPassword,
} from '../lib/supabase';

const route = useRoute();
const router = useRouter();

// Verbindungsfelder nur relevant, wenn nicht über Env fest verdrahtet.
const url = ref(settings.url);
const key = ref(settings.key);

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

function saveConnection() {
  saveSettings(url.value, key.value);
  error.value = '';
}

async function submit() {
  error.value = '';
  if (!isConfigured()) {
    // Manuell eingetragene Verbindung übernehmen, falls noch nicht gespeichert.
    saveSettings(url.value, key.value);
  }
  if (!isConfigured()) {
    error.value = 'Bitte zuerst Supabase-URL und anon-Key eintragen.';
    return;
  }
  loading.value = true;
  const { error: err } = await signInWithPassword(email.value, password.value);
  loading.value = false;
  if (err) {
    error.value = err.message;
    return;
  }
  const redirect = route.query.redirect;
  router.replace(typeof redirect === 'string' ? redirect : '/');
}
</script>

<template>
  <div class="max-w-md mx-auto mt-10">
    <div class="panel">
      <h1 class="text-xl font-semibold mb-1">🖨️ Printable – Anmelden</h1>
      <p class="text-slate-400 text-sm mb-5">Melde dich mit deinem Supabase-Konto an.</p>

      <div v-if="!connectionFromEnv" class="mb-5">
        <h2 class="text-xs uppercase tracking-wide text-slate-400 mb-3">Verbindung</h2>
        <div class="grid gap-3">
          <div>
            <label class="label">Supabase URL</label>
            <input v-model="url" class="input" placeholder="https://xxxx.supabase.co" />
          </div>
          <div>
            <label class="label">Supabase anon-Key</label>
            <input v-model="key" type="password" class="input" placeholder="ey..." />
          </div>
          <div>
            <button class="btn" @click="saveConnection">Verbindung speichern</button>
          </div>
        </div>
      </div>

      <form class="grid gap-3" @submit.prevent="submit">
        <h2 class="text-xs uppercase tracking-wide text-slate-400">Login</h2>
        <div>
          <label class="label">E-Mail</label>
          <input v-model="email" type="email" autocomplete="username" class="input" placeholder="du@firma.de" />
        </div>
        <div>
          <label class="label">Passwort</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="input"
            placeholder="••••••••"
          />
        </div>
        <p v-if="error" class="text-sm text-red-400">{{ error }}</p>
        <button type="submit" class="btn btn-primary" :disabled="loading">
          {{ loading ? 'Anmelden…' : 'Anmelden' }}
        </button>
      </form>
    </div>
  </div>
</template>
