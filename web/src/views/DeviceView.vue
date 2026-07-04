<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { getClient } from '../lib/supabase';
import type { DeviceRow, DeviceTemplateRow, RewardType, TemplateRow } from '../lib/types';

const props = defineProps<{ id: string }>();

const REWARDS: RewardType[] = ['none', 'static', 'unique'];
const REWARD_LABEL: Record<string, string> = {
  none: 'Trost (kein Code)',
  static: 'Statischer Code (Barcode/Bild)',
  unique: 'App-Code (individuell)',
};

const device = ref<DeviceRow | null>(null);
const sub = ref('');

// Config-Formular
const cfg = ref({ name: '', location: '', desired: '', printerHost: '', printerPort: 9100, cooldownMs: 1000, redeemBaseUrl: '', json: '' });
const cfgMsg = ref('');

// Preise (Template-Mix)
const templates = ref<TemplateRow[]>([]);
const mix = ref<DeviceTemplateRow[]>([]);
const addTplId = ref<number | null>(null);
const mixMsg = ref('');

const visibleMix = computed(() => mix.value.filter(r => !r._delete));
const totalWeight = computed(() =>
  visibleMix.value.filter(r => r.enabled !== false).reduce((s, r) => s + (Number(r.probability) || 0), 0),
);

// Von der Box gemeldete Ausgabe-Zähler + Pool-Bestände.
const dispensed = ref<Record<string, number>>({});
const stock = ref<Record<string, { available: number; reserved: number; claimed: number }>>({});

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
}

function pct(r: DeviceTemplateRow): string {
  if (r.enabled === false) return '–';
  const t = totalWeight.value;
  if (t <= 0) return '0 %';
  return Math.round(((Number(r.probability) || 0) / t) * 100) + ' %';
}

function poolFor(cat: string | null) {
  return (cat && stock.value[cat]) || { available: 0, reserved: 0, claimed: 0 };
}

function dispensedFor(r: DeviceTemplateRow): number {
  if (r.reward_type === 'unique') return poolFor(r.voucher_category).claimed;
  return dispensed.value[r.template_name ?? ''] ?? 0;
}

function remainingFor(r: DeviceTemplateRow): string {
  if (r.reward_type === 'unique') return String(poolFor(r.voucher_category).available);
  if (r.total_limit != null) return String(Math.max(0, r.total_limit - dispensedFor(r)));
  return '∞';
}

function statusFor(r: DeviceTemplateRow): { text: string; cls: string } {
  if (r.enabled === false) return { text: 'Gesperrt', cls: 'pill' };
  if (r.reward_type === 'unique') {
    return poolFor(r.voucher_category).available > 0
      ? { text: 'Aktiv', cls: 'pill pill-ok' }
      : { text: 'Pool leer', cls: 'pill pill-warn' };
  }
  if (r.total_limit != null && dispensedFor(r) >= r.total_limit) {
    return { text: 'Erschöpft', cls: 'pill pill-warn' };
  }
  return { text: 'Aktiv', cls: 'pill pill-ok' };
}

function onRewardChange(r: DeviceTemplateRow) {
  if (r.reward_type === 'unique' && !r.voucher_category && r.template_name) {
    r.voucher_category = slug(r.template_name);
  }
}

// ── Laden ─────────────────────────────────────────────────────────────────
async function loadDevice() {
  const c = getClient();
  if (!c) return;
  const { data, error } = await c.from('devices').select('*').eq('id', props.id).single();
  if (error) { sub.value = 'Fehler: ' + error.message; return; }
  const d = data as DeviceRow;
  device.value = d;
  dispensed.value = d.dispensed || {};
  sub.value = [d.name, d.location].filter(Boolean).join(' · ');
  cfg.value = {
    name: d.name || '',
    location: d.location || '',
    desired: d.desired_version || '',
    printerHost: d.config?.printer?.host || '',
    printerPort: d.config?.printer?.port || 9100,
    cooldownMs: d.config?.dispense?.cooldownMs ?? 1000,
    redeemBaseUrl: d.config?.dispense?.redeemBaseUrl || '',
    json: JSON.stringify(d.config || {}, null, 2),
  };
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

// ── Speichern ─────────────────────────────────────────────────────────────
async function saveConfig() {
  const c = getClient();
  if (!c) return;
  let config: Record<string, unknown>;
  try { config = JSON.parse(cfg.value.json); } catch (e) { cfgMsg.value = 'JSON ungültig: ' + (e as Error).message; return; }
  config.printer = { ...(config.printer as object), host: cfg.value.printerHost, port: Number(cfg.value.printerPort) };
  config.dispense = {
    ...(config.dispense as object),
    cooldownMs: Number(cfg.value.cooldownMs),
    ...(cfg.value.redeemBaseUrl ? { redeemBaseUrl: cfg.value.redeemBaseUrl } : {}),
  };
  const { error } = await c.from('devices').update({
    name: cfg.value.name || null,
    location: cfg.value.location || null,
    desired_version: cfg.value.desired || null,
    config,
  }).eq('id', props.id);
  cfgMsg.value = error ? 'Fehler: ' + error.message : 'Gespeichert ✓';
  if (!error) loadDevice();
}

function addRow() {
  const tpl = templates.value.find(t => t.id === addTplId.value);
  if (!tpl) return;
  mix.value.push({
    device_id: props.id, template_id: tpl.id, template_name: tpl.name, enabled: true,
    probability: 10, cooldown_sec: 0, data: {}, reward_type: 'none',
    voucher_category: null, static_code: null, daily_limit: null, total_limit: null, is_fallback: false,
  });
}

async function saveMix() {
  const c = getClient();
  if (!c) return;
  const toDelete = mix.value.filter(r => r._delete && r.id).map(r => r.id as number);
  if (toDelete.length) await c.from('device_templates').delete().in('id', toDelete);
  const rows = visibleMix.value.map(r => ({
    id: r.id, device_id: props.id, template_id: r.template_id,
    probability: Number(r.probability) || 0, cooldown_sec: Number(r.cooldown_sec) || 0,
    reward_type: r.reward_type || 'none', voucher_category: r.voucher_category || null,
    static_code: r.static_code || null, daily_limit: r.daily_limit ? Number(r.daily_limit) : null,
    total_limit: r.total_limit ? Number(r.total_limit) : null, is_fallback: !!r.is_fallback,
    enabled: r.enabled !== false, data: r.data || {},
  }));
  const { error } = await c.from('device_templates').upsert(rows, { onConflict: 'device_id,template_id' });
  mixMsg.value = error ? 'Fehler: ' + error.message : 'Gespeichert ✓';
  if (!error) loadMix();
}

// Codes direkt für einen Preis (dessen Kategorie) in den Pool laden.
async function addCodesForRow(r: DeviceTemplateRow) {
  const c = getClient();
  if (!c) return;
  const cat = (r.voucher_category || '').trim();
  const codes = (r._newCodes || '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!cat) { r._codesMsg = 'Erst eine Kategorie vergeben.'; return; }
  if (!codes.length) { r._codesMsg = 'Keine Codes eingegeben.'; return; }
  const { error } = await c.from('voucher_pool').upsert(codes.map(code => ({ code, category: cat })), { onConflict: 'code', ignoreDuplicates: true });
  r._codesMsg = error ? 'Fehler: ' + error.message : `${codes.length} Codes geladen ✓`;
  if (!error) { r._newCodes = ''; loadStock(); }
}

onMounted(() => { loadDevice(); loadMix(); loadStock(); });
</script>

<template>
  <div class="flex items-center justify-between mb-1">
    <h1 class="text-2xl font-semibold">{{ id }}</h1>
    <RouterLink to="/" class="text-sm text-slate-400 hover:text-slate-100">← Alle Boxen</RouterLink>
  </div>
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
      <div class="sm:col-span-3"><label class="label">Einlöse-Basis-URL (QR dynamischer Codes)</label><input v-model="cfg.redeemBaseUrl" class="input" placeholder="https://app.screenable.io/r/" /></div>
    </div>
    <details class="mt-3">
      <summary class="text-xs text-slate-400 cursor-pointer">Vollständige config (JSON)</summary>
      <textarea v-model="cfg.json" class="input font-mono text-xs min-h-[140px] mt-2" spellcheck="false"></textarea>
    </details>
    <div class="flex items-center gap-3 mt-3">
      <button class="btn btn-primary" @click="saveConfig">Konfiguration speichern</button>
      <span class="text-sm text-slate-400">{{ cfgMsg }}</span>
    </div>
  </section>

  <!-- Preise -->
  <section class="panel">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-1">Preise</h2>
    <p class="text-slate-400 text-sm mb-4">
      Jeder Preis = Bon-Layout + <strong>Gewicht</strong> (relativ; ≈ Anteil = Wahrscheinlichkeit) +
      <strong>Reward</strong> + <strong>Limit</strong>. App-Codes werden über die
      <strong>Kategorie</strong> zugeordnet: zwei Preise mit eigenen Codes = zwei Kategorien, jede
      mit eigenem Vorrat.
    </p>

    <div class="space-y-3">
      <div
        v-for="(r, i) in visibleMix"
        :key="r.id ?? 'new-' + i"
        class="rounded-lg border border-brand-border bg-[#0d0f14] p-4"
      >
        <!-- Kopf -->
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3">
            <span class="font-semibold">{{ r.template_name }}</span>
            <span :class="statusFor(r).cls">{{ statusFor(r).text }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="btn btn-ghost px-3 py-1 text-xs"
              :class="r.enabled === false ? 'text-emerald-400' : 'text-amber-300'"
              @click="r.enabled = r.enabled === false"
            >
              {{ r.enabled === false ? 'Entsperren' : 'Sperren' }}
            </button>
            <button class="btn btn-ghost px-2 py-1 text-slate-400" @click="r._delete = true">✕</button>
          </div>
        </div>

        <!-- Basis-Felder -->
        <div class="grid gap-3 mt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label class="label">Gewicht <span class="text-slate-500">({{ pct(r) }})</span></label>
            <input v-model.number="r.probability" type="number" class="input" />
          </div>
          <div>
            <label class="label">Reward-Typ</label>
            <select v-model="r.reward_type" class="input" @change="onRewardChange(r)">
              <option v-for="rw in REWARDS" :key="rw" :value="rw">{{ REWARD_LABEL[rw] }}</option>
            </select>
          </div>
          <div>
            <label class="label">Cooldown (s)</label>
            <input v-model.number="r.cooldown_sec" type="number" class="input" />
          </div>
          <div>
            <label class="label">Limit / Tag</label>
            <input v-model.number="r.daily_limit" type="number" class="input" placeholder="∞" />
          </div>
        </div>

        <!-- Trost -->
        <label v-if="r.reward_type === 'none'" class="flex items-center gap-2 mt-3 text-sm text-slate-300">
          <input v-model="r.is_fallback" type="checkbox" />
          Als Trost-/Fallback-Preis verwenden (bekommt automatisch den Rest der Wahrscheinlichkeit)
        </label>

        <!-- Statischer Code -->
        <div v-else-if="r.reward_type === 'static'" class="grid gap-3 mt-3 sm:grid-cols-3">
          <div>
            <label class="label">Static-Code (optional)</label>
            <input v-model="r.static_code" class="input" placeholder="fester Code (im Layout als Barcode)" />
          </div>
          <div>
            <label class="label">Max gesamt</label>
            <input v-model.number="r.total_limit" type="number" class="input" placeholder="∞" />
          </div>
          <div>
            <label class="label">Ausgegeben / Rest</label>
            <div class="input tabular-nums text-slate-400">{{ dispensedFor(r) }} / {{ remainingFor(r) }}</div>
          </div>
        </div>

        <!-- App-Code (Pool) -->
        <div v-else class="mt-3 rounded-lg border border-brand-border p-3">
          <div class="grid gap-3 sm:grid-cols-3">
            <div>
              <label class="label">Kategorie (Code-Zuordnung)</label>
              <input v-model="r.voucher_category" class="input" placeholder="z. B. 5eur-gutschein" />
            </div>
            <div>
              <label class="label">Max gesamt</label>
              <input v-model.number="r.total_limit" type="number" class="input" placeholder="= Pool" />
            </div>
            <div>
              <label class="label">Bestand</label>
              <div class="input tabular-nums text-slate-400">
                {{ poolFor(r.voucher_category).available }} frei ·
                {{ poolFor(r.voucher_category).claimed }} eingelöst
              </div>
            </div>
          </div>
          <label class="label">Neue Codes hinzufügen (einer pro Zeile)</label>
          <textarea v-model="r._newCodes" class="input font-mono text-xs min-h-[80px]" :placeholder="'CODE-0001\nCODE-0002'"></textarea>
          <div class="flex items-center gap-3 mt-2">
            <button class="btn" @click="addCodesForRow(r)">Codes in Pool laden</button>
            <span class="text-sm text-slate-400">{{ r._codesMsg }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-3 mt-4 flex-wrap">
      <select v-model.number="addTplId" class="input w-auto">
        <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <button class="btn" @click="addRow">+ Preis hinzufügen</button>
      <button class="btn btn-primary" @click="saveMix">Preise speichern</button>
      <span class="text-sm text-slate-400">{{ mixMsg }}</span>
    </div>
  </section>
</template>
