<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getClient } from '../lib/supabase';
import type { DeviceRow, DeviceTemplateRow, RewardType, TemplateRow } from '../lib/types';

const props = defineProps<{ id: string }>();

const REWARDS: RewardType[] = ['none', 'static', 'unique'];

const device = ref<DeviceRow | null>(null);
const sub = ref('');

// Config-Formular
const cfg = ref({ name: '', location: '', desired: '', printerHost: '', printerPort: 9100, cooldownMs: 1000, json: '' });
const cfgMsg = ref('');

// Template-Mix
const templates = ref<TemplateRow[]>([]);
const mix = ref<DeviceTemplateRow[]>([]);
const addTplId = ref<number | null>(null);
const mixMsg = ref('');

// Gutschein-Pool
const stock = ref<Record<string, { available: number; reserved: number; claimed: number }>>({});
const vp = ref({ category: '', codes: '' });
const vpMsg = ref('');

async function loadDevice() {
  const c = getClient();
  if (!c) return;
  const { data, error } = await c.from('devices').select('*').eq('id', props.id).single();
  if (error) { sub.value = 'Fehler: ' + error.message; return; }
  const d = data as DeviceRow;
  device.value = d;
  sub.value = [d.name, d.location].filter(Boolean).join(' · ');
  cfg.value = {
    name: d.name || '',
    location: d.location || '',
    desired: d.desired_version || '',
    printerHost: d.config?.printer?.host || '',
    printerPort: d.config?.printer?.port || 9100,
    cooldownMs: d.config?.dispense?.cooldownMs ?? 1000,
    json: JSON.stringify(d.config || {}, null, 2),
  };
}

async function saveConfig() {
  const c = getClient();
  if (!c) return;
  let config: Record<string, unknown>;
  try {
    config = JSON.parse(cfg.value.json);
  } catch (e) {
    cfgMsg.value = 'JSON ungültig: ' + (e as Error).message;
    return;
  }
  config.printer = { ...(config.printer as object), host: cfg.value.printerHost, port: Number(cfg.value.printerPort) };
  config.dispense = { ...(config.dispense as object), cooldownMs: Number(cfg.value.cooldownMs) };
  const { error } = await c.from('devices').update({
    name: cfg.value.name || null,
    location: cfg.value.location || null,
    desired_version: cfg.value.desired || null,
    config,
  }).eq('id', props.id);
  cfgMsg.value = error ? 'Fehler: ' + error.message : 'Gespeichert ✓';
  if (!error) loadDevice();
}

async function loadMix() {
  const c = getClient();
  if (!c) return;
  const { data: tpls } = await c.from('templates').select('id, name').order('name');
  templates.value = (tpls as TemplateRow[]) || [];
  addTplId.value = templates.value[0]?.id ?? null;

  const { data } = await c.from('device_templates').select('*, templates(name)').eq('device_id', props.id);
  mix.value = ((data as (DeviceTemplateRow & { templates?: { name: string } })[]) || []).map(d => ({
    ...d,
    template_name: d.templates?.name,
  }));
}

function addRow() {
  const tpl = templates.value.find(t => t.id === addTplId.value);
  if (!tpl) return;
  mix.value.push({
    device_id: props.id,
    template_id: tpl.id,
    template_name: tpl.name,
    enabled: true,
    probability: 10,
    cooldown_sec: 0,
    data: {},
    reward_type: 'none',
    voucher_category: null,
    static_code: null,
    daily_limit: null,
    is_fallback: false,
  });
}

async function saveMix() {
  const c = getClient();
  if (!c) return;
  const toDelete = mix.value.filter(r => r._delete && r.id).map(r => r.id as number);
  if (toDelete.length) await c.from('device_templates').delete().in('id', toDelete);
  const rows = mix.value.filter(r => !r._delete).map(r => ({
    id: r.id,
    device_id: props.id,
    template_id: r.template_id,
    probability: Number(r.probability) || 0,
    cooldown_sec: Number(r.cooldown_sec) || 0,
    reward_type: r.reward_type || 'none',
    voucher_category: r.voucher_category || null,
    static_code: r.static_code || null,
    daily_limit: r.daily_limit ? Number(r.daily_limit) : null,
    is_fallback: !!r.is_fallback,
    enabled: r.enabled !== false,
    data: r.data || {},
  }));
  const { error } = await c.from('device_templates').upsert(rows, { onConflict: 'device_id,template_id' });
  mixMsg.value = error ? 'Fehler: ' + error.message : 'Gespeichert ✓';
  if (!error) loadMix();
}

async function loadStock() {
  const c = getClient();
  if (!c) return;
  const { data } = await c.from('voucher_pool').select('category, status').limit(10000);
  const agg: typeof stock.value = {};
  for (const v of (data as { category: string; status: 'available' | 'reserved' | 'claimed' }[]) || []) {
    agg[v.category] ??= { available: 0, reserved: 0, claimed: 0 };
    agg[v.category][v.status]++;
  }
  stock.value = agg;
}

async function addCodes() {
  const c = getClient();
  if (!c) return;
  const cat = vp.value.category.trim();
  const codes = vp.value.codes.split('\n').map(s => s.trim()).filter(Boolean);
  if (!cat || !codes.length) { vpMsg.value = 'Kategorie und Codes nötig.'; return; }
  const rows = codes.map(code => ({ code, category: cat }));
  const { error } = await c.from('voucher_pool').upsert(rows, { onConflict: 'code', ignoreDuplicates: true });
  vpMsg.value = error ? 'Fehler: ' + error.message : `${codes.length} Codes geladen ✓`;
  if (!error) { vp.value.codes = ''; loadStock(); }
}

onMounted(() => {
  loadDevice();
  loadMix();
  loadStock();
});
</script>

<template>
  <h1 class="text-2xl font-semibold mb-1">{{ id }}</h1>
  <p class="text-slate-400 mb-5">{{ sub }}</p>

  <!-- Konfiguration -->
  <section class="panel mb-5">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-3">Konfiguration</h2>
    <div class="grid gap-3 sm:grid-cols-3">
      <div><label class="label">Name</label><input v-model="cfg.name" class="input" /></div>
      <div><label class="label">Standort</label><input v-model="cfg.location" class="input" /></div>
      <div><label class="label">Gewünschte Version</label><input v-model="cfg.desired" class="input" placeholder="v1.2.0" /></div>
      <div><label class="label">Drucker-Host</label><input v-model="cfg.printerHost" class="input" /></div>
      <div><label class="label">Drucker-Port</label><input v-model.number="cfg.printerPort" type="number" class="input" /></div>
      <div><label class="label">Cooldown (ms)</label><input v-model.number="cfg.cooldownMs" type="number" class="input" /></div>
    </div>
    <label class="label">Vollständige <code class="text-xs">config</code> (JSON)</label>
    <textarea v-model="cfg.json" class="input font-mono text-xs min-h-[160px]" spellcheck="false"></textarea>
    <div class="flex items-center gap-3 mt-3">
      <button class="btn btn-primary" @click="saveConfig">Konfiguration speichern</button>
      <span class="text-sm text-slate-400">{{ cfgMsg }}</span>
    </div>
  </section>

  <!-- Template-Mix -->
  <section class="panel mb-5">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-1">Template-Mix (Preisstufen)</h2>
    <p class="text-slate-400 text-sm mb-3">Gewicht, Cooldown, Limit und Reward je Preis — wird live von der Box übernommen.</p>
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr>
            <th class="th">Template</th><th class="th">Gewicht</th><th class="th">Cooldown s</th>
            <th class="th">Reward</th><th class="th">Kategorie</th><th class="th">Static-Code</th>
            <th class="th">Tageslimit</th><th class="th">Fallback</th><th class="th">Aktiv</th><th class="th"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(r, i) in mix" :key="r.id ?? 'new-' + i">
            <tr v-if="!r._delete">
              <td class="td whitespace-nowrap">{{ r.template_name }}</td>
              <td class="td"><input v-model.number="r.probability" type="number" class="input w-16" /></td>
              <td class="td"><input v-model.number="r.cooldown_sec" type="number" class="input w-16" /></td>
              <td class="td">
                <select v-model="r.reward_type" class="input w-24">
                  <option v-for="rw in REWARDS" :key="rw" :value="rw">{{ rw }}</option>
                </select>
              </td>
              <td class="td"><input v-model="r.voucher_category" class="input w-32" /></td>
              <td class="td"><input v-model="r.static_code" class="input w-28" /></td>
              <td class="td"><input v-model.number="r.daily_limit" type="number" class="input w-16" /></td>
              <td class="td text-center"><input v-model="r.is_fallback" type="checkbox" /></td>
              <td class="td text-center"><input v-model="r.enabled" type="checkbox" /></td>
              <td class="td"><button class="btn btn-ghost px-2 py-1" @click="r._delete = true">✕</button></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <div class="flex items-center gap-3 mt-3 flex-wrap">
      <select v-model.number="addTplId" class="input w-auto">
        <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <button class="btn" @click="addRow">+ Template hinzufügen</button>
      <button class="btn btn-primary" @click="saveMix">Mix speichern</button>
      <span class="text-sm text-slate-400">{{ mixMsg }}</span>
    </div>
  </section>

  <!-- Gutschein-Pool -->
  <section class="panel">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-3">Gutschein-Pool</h2>
    <div v-if="Object.keys(stock).length" class="overflow-x-auto mb-4">
      <table class="w-full">
        <thead>
          <tr><th class="th">Kategorie</th><th class="th">Frei</th><th class="th">Reserviert</th><th class="th">Eingelöst</th></tr>
        </thead>
        <tbody>
          <tr v-for="(v, k) in stock" :key="k">
            <td class="td">{{ k }}</td><td class="td">{{ v.available }}</td>
            <td class="td">{{ v.reserved }}</td><td class="td">{{ v.claimed }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-slate-400 mb-4">Pool leer.</p>

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="label">Kategorie</label>
        <input v-model="vp.category" class="input" placeholder="edeka-frische-50" />
      </div>
    </div>
    <label class="label">Codes (einer pro Zeile)</label>
    <textarea v-model="vp.codes" class="input font-mono text-xs min-h-[120px]" placeholder="FRISCHE50-XYZ1&#10;FRISCHE50-XYZ2"></textarea>
    <div class="flex items-center gap-3 mt-3">
      <button class="btn btn-primary" @click="addCodes">Codes in Pool laden</button>
      <span class="text-sm text-slate-400">{{ vpMsg }}</span>
    </div>
  </section>
</template>
