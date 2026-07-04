<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { getClient, saveSettings, settings } from '../lib/supabase';
import type { DeviceRow } from '../lib/types';

const url = ref(settings.url);
const key = ref(settings.key);
const devices = ref<DeviceRow[]>([]);
const status = ref('');
const loading = ref(false);

function save() {
  saveSettings(url.value, key.value);
  load();
}

function seenLabel(seen: string | null): { text: string; cls: string } {
  if (!seen) return { text: 'nie gesehen', cls: 'pill' };
  const min = (Date.now() - new Date(seen).getTime()) / 60000;
  return min < 5
    ? { text: 'online', cls: 'pill pill-ok' }
    : { text: `vor ${Math.round(min)} min`, cls: 'pill pill-warn' };
}

function stockLabel(stock: Record<string, number> | null): string {
  if (!stock) return '—';
  const entries = Object.entries(stock);
  return entries.length ? entries.map(([k, v]) => `${k}:${v}`).join('  ') : '—';
}

async function del(d: DeviceRow) {
  const c = getClient();
  if (!c) return;
  if (!confirm(`Box "${d.id}" wirklich löschen? Die Preise dieser Box werden mitgelöscht.`)) return;
  const { error } = await c.from('devices').delete().eq('id', d.id);
  if (error) { status.value = 'Fehler: ' + error.message; return; }
  load();
}

async function load() {
  const c = getClient();
  if (!c) {
    status.value = 'Nicht verbunden.';
    return;
  }
  loading.value = true;
  status.value = '';
  const { data, error } = await c
    .from('devices')
    .select('id, name, location, last_seen, app_version, desired_version, voucher_stock')
    .order('id');
  loading.value = false;
  if (error) {
    status.value = 'Fehler: ' + error.message;
    return;
  }
  devices.value = (data as DeviceRow[]) || [];
}

onMounted(load);
</script>

<template>
  <h1 class="text-2xl font-semibold mb-1">Boxen</h1>
  <p class="text-slate-400 mb-5">Übersicht aller Geräte, Heartbeat und Gutschein-Bestand.</p>

  <section class="panel mb-5">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-3">Verbindung</h2>
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="label">Supabase URL</label>
        <input v-model="url" class="input" placeholder="https://xxxx.supabase.co" />
      </div>
      <div>
        <label class="label">Supabase Key (anon/service)</label>
        <input v-model="key" type="password" class="input" placeholder="ey..." />
      </div>
    </div>
    <div class="flex items-center gap-3 mt-4">
      <button class="btn btn-primary" @click="save">Speichern &amp; laden</button>
      <span class="text-sm text-slate-400">{{ status }}</span>
    </div>
  </section>

  <section class="panel">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-3">Geräte</h2>
    <p v-if="loading" class="text-slate-400">Lädt…</p>
    <p v-else-if="!devices.length" class="text-slate-400">Noch keine Box angelegt.</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr>
            <th class="th">ID</th>
            <th class="th">Name</th>
            <th class="th">Status</th>
            <th class="th">Version</th>
            <th class="th">Bestand</th>
            <th class="th"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in devices" :key="d.id">
            <td class="td"><code class="text-xs bg-[#0d0f14] px-1.5 py-0.5 rounded">{{ d.id }}</code></td>
            <td class="td">{{ d.name || '—' }}</td>
            <td class="td"><span :class="seenLabel(d.last_seen).cls">{{ seenLabel(d.last_seen).text }}</span></td>
            <td class="td">
              {{ d.app_version || '?' }}
              <span v-if="d.desired_version && d.desired_version !== d.app_version" class="text-amber-300">
                → {{ d.desired_version }}
              </span>
            </td>
            <td class="td text-slate-400">{{ stockLabel(d.voucher_stock) }}</td>
            <td class="td">
              <div class="flex gap-2">
                <RouterLink :to="`/device/${encodeURIComponent(d.id)}`">
                  <button class="btn btn-ghost">Konfigurieren</button>
                </RouterLink>
                <button class="btn btn-ghost text-slate-400" title="Box löschen" @click="del(d)">✕</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
