<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { getClient } from '../lib/supabase';
import { renderReceipt } from '../lib/receipt';
import type {
  DeviceEventRow,
  DeviceRow,
  DeviceTemplateRow,
  DispenseStatRow,
  PrintJobRow,
  ReceiptElement,
  RewardType,
  TemplateRow,
} from '../lib/types';

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

// Zugriff auf frei definierbare Template-Daten (z.B. der Anzeige-Preis {{price}}).
function dataVal(r: DeviceTemplateRow, key: string): string {
  const v = r.data?.[key];
  return v == null ? '' : String(v);
}
function setDataVal(r: DeviceTemplateRow, key: string, val: string): void {
  r.data = { ...(r.data || {}), [key]: val };
}

// Nur noch nicht zugeordnete Layouts zur Auswahl anbieten.
const availableToAdd = computed(() => {
  const used = new Set(visibleMix.value.map(r => r.template_id));
  return templates.value.filter(t => !used.has(t.id));
});

// ── Plausibilität ───────────────────────────────────────────────────────────
// Enthält das Layout überhaupt eine Code-Darstellung (Platzhalter oder Barcode/Bild)?
function layoutHasCodeRef(r: DeviceTemplateRow): boolean {
  const els = r.template_layout?.elements;
  if (!els) return true; // Layout unbekannt -> nicht warnen
  return els.some((el: ReceiptElement) => {
    if (el.type === 'barcode' || el.type === 'image') return true;
    const v = typeof el.value === 'string' ? el.value : '';
    return v.includes('{{code}}') || v.includes('{{redeem_url}}');
  });
}

function warningsFor(r: DeviceTemplateRow): string[] {
  const w: string[] = [];
  if (r.enabled === false) return w;
  if ((Number(r.probability) || 0) <= 0) w.push('Gewicht 0 – dieser Preis wird nie ausgewählt.');
  if (r.reward_type === 'unique') {
    if (!r.voucher_category) {
      w.push('Kategorie fehlt – App-Codes können nicht zugeordnet werden.');
    } else {
      const pool = poolFor(r.voucher_category);
      if (pool.available + pool.claimed + pool.reserved === 0) {
        w.push('Noch keine Codes im Pool für diese Kategorie.');
      } else if (pool.available === 0) {
        w.push('Pool leer – aktuell wird stattdessen der Trost-Preis gedruckt.');
      }
    }
  }
  if (r.reward_type === 'static' && !r.static_code) {
    w.push('Kein Static-Code – stelle sicher, dass der Code/Barcode im Layout steckt.');
  }
  if (r.reward_type !== 'none' && !layoutHasCodeRef(r)) {
    w.push('Layout enthält keinen Code/Barcode/QR – der Bon zeigt keinen Gutschein.');
  }
  return w;
}

// ── Vorschau (gemeinsames Modal) ────────────────────────────────────────────
const previewOpen = ref(false);
const previewTitle = ref('');
const previewCanvas = ref<HTMLCanvasElement | null>(null);
let previewEls: ReceiptElement[] = [];
let previewSample: Record<string, string> = {};

async function openPreview(title: string, elements: ReceiptElement[], sample: Record<string, string>) {
  previewTitle.value = title;
  previewEls = elements;
  previewSample = sample;
  previewOpen.value = true;
  await nextTick();
  if (previewCanvas.value) renderReceipt(previewCanvas.value, previewEls, previewSample);
}

function previewPrize(r: DeviceTemplateRow) {
  const els = r.template_layout?.elements;
  if (!els) return;
  const code = 'ABCD-1234';
  const base = cfg.value.redeemBaseUrl || 'https://app.screenable.io/r/';
  openPreview(r.template_name || 'Preis', els, {
    price: dataVal(r, 'price') || '25%',
    code: r.reward_type === 'static' && r.static_code ? r.static_code : code,
    redeem_url: base + code,
  });
}

function previewJob(j: PrintJobRow) {
  if (j.filled_template?.elements) openPreview(j.data?.template || 'Bon', j.filled_template.elements, {});
}

// ── Auswertung: Zeitraum, Statistik, Ereignisse, Historie ───────────────────
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
const range = ref({ from: isoDay(-7), to: isoDay(0) });

function rangeBounds(): { fromIso: string; toIso: string } {
  const from = new Date(range.value.from + 'T00:00:00');
  const to = new Date(range.value.to + 'T00:00:00');
  to.setDate(to.getDate() + 1); // exklusive Obergrenze = Folgetag 00:00
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}
function fmtTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('de-DE') : '';
}

interface StatAgg { template: string; done: number; error: number; total: number }
const stats = ref<StatAgg[]>([]);
const statsTotal = computed(() => stats.value.reduce((s, r) => s + r.total, 0));

async function loadStats() {
  const c = getClient();
  if (!c) return;
  const { fromIso, toIso } = rangeBounds();
  const { data } = await c.rpc('dispense_stats', { p_device_id: props.id, p_from: fromIso, p_to: toIso });
  const map: Record<string, StatAgg> = {};
  for (const r of (data as DispenseStatRow[]) || []) {
    const m = (map[r.template] ??= { template: r.template, done: 0, error: 0, total: 0 });
    const n = Number(r.count) || 0;
    if (r.status === 'done') m.done += n;
    else if (r.status === 'error') m.error += n;
    m.total += n;
  }
  stats.value = Object.values(map).sort((a, b) => b.total - a.total);
}

// Aktueller Rest-Bestand zu einem Template-Namen (aus dem Preis-Mix).
function restForTemplate(name: string): string {
  const r = visibleMix.value.find(x => x.template_name === name);
  return r ? remainingFor(r) : '—';
}

// Ereignisse
const events = ref<DeviceEventRow[]>([]);
const eventLevel = ref('');
const LEVEL_CLS: Record<string, string> = {
  error: 'pill pill-warn text-red-300',
  warn: 'pill pill-warn',
  info: 'pill',
};
async function loadEvents() {
  const c = getClient();
  if (!c) return;
  const { fromIso, toIso } = rangeBounds();
  let q = c
    .from('device_events')
    .select('id, ts, level, type, message, data')
    .eq('device_id', props.id)
    .gte('ts', fromIso)
    .lt('ts', toIso)
    .order('ts', { ascending: false })
    .limit(300);
  if (eventLevel.value) q = q.eq('level', eventLevel.value);
  const { data } = await q;
  events.value = (data as DeviceEventRow[]) || [];
}

// Historie (Einzeldrucke im Zeitraum)
const jobs = ref<PrintJobRow[]>([]);
async function loadHistory() {
  const c = getClient();
  if (!c) return;
  const { fromIso, toIso } = rangeBounds();
  const { data } = await c
    .from('print_jobs')
    .select('id, data, filled_template, status, created_at')
    .eq('data->>device_id', props.id)
    .gte('created_at', fromIso)
    .lt('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(100);
  jobs.value = (data as PrintJobRow[]) || [];
}

function loadReport() {
  loadStats();
  loadEvents();
  loadHistory();
}

const globalWarnings = computed(() => {
  const w: string[] = [];
  const active = visibleMix.value.filter(r => r.enabled !== false);
  if (!active.length) return w;
  const fallbacks = active.filter(r => r.is_fallback);
  if (fallbacks.length === 0) {
    w.push('Kein aktiver Trost-/Fallback-Preis: Läuft ein Pool leer, kann die Box nichts drucken.');
  } else if (fallbacks.length > 1) {
    w.push('Mehrere Fallback-Preise markiert – die Box nutzt nur einen.');
  }
  if (totalWeight.value === 0) w.push('Alle Gewichte sind 0 – es wird nichts ausgewählt.');
  return w;
});

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
  const { data } = await c.from('device_templates').select('*, templates(name, template)').eq('device_id', props.id);
  mix.value = ((data as (DeviceTemplateRow & { templates?: { name: string; template?: unknown } })[]) || []).map(d => ({
    ...d,
    template_name: d.templates?.name,
    template_layout: d.templates?.template as DeviceTemplateRow['template_layout'],
  }));
  addTplId.value = availableToAdd.value[0]?.id ?? null;
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

async function requestReboot() {
  const c = getClient();
  if (!c) return;
  if (!confirm('Diese Box aus der Ferne neu starten? Sie übernimmt den Neustart beim nächsten Sync (~30 s).')) return;
  const { error } = await c.from('devices').update({ restart_requested_at: new Date().toISOString() }).eq('id', props.id);
  cfgMsg.value = error ? 'Fehler: ' + error.message : 'Neustart angefordert – Box startet in ~30 s ✓';
}

function addRow() {
  const tpl = templates.value.find(t => t.id === addTplId.value);
  if (!tpl) return;
  mix.value.push({
    device_id: props.id, template_id: tpl.id, template_name: tpl.name, enabled: true,
    probability: 10, cooldown_sec: 0, data: {}, reward_type: 'none',
    voucher_category: null, static_code: null, daily_limit: null, total_limit: null, is_fallback: false,
  });
  addTplId.value = availableToAdd.value[0]?.id ?? null;
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

onMounted(() => { loadDevice(); loadMix(); loadStock(); loadReport(); });
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
    <div class="flex items-center gap-3 mt-3 flex-wrap">
      <button class="btn btn-primary" @click="saveConfig">Konfiguration speichern</button>
      <button class="btn btn-ghost" title="Box aus der Ferne neu starten (ohne SSH)" @click="requestReboot">Box neu starten</button>
      <span class="text-sm text-slate-400">{{ cfgMsg }}</span>
    </div>
    <p class="text-xs text-slate-500 mt-2">
      Hinweis: Drucker-IP und Cooldown wirken live (~30 s). Änderungen an
      GPIO-Pins/LED greifen erst nach „Box neu starten".
    </p>
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

    <div v-if="globalWarnings.length" class="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <ul class="space-y-1">
        <li v-for="wtext in globalWarnings" :key="wtext" class="text-sm text-amber-200 flex gap-2">
          <span>⚠</span><span>{{ wtext }}</span>
        </li>
      </ul>
    </div>

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
            <button v-if="r.template_layout" class="btn btn-ghost px-3 py-1 text-xs" @click="previewPrize(r)">Vorschau</button>
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
            <label class="label">Anzeige-Preis (Bon-Platzhalter price)</label>
            <input :value="dataVal(r, 'price')" class="input" placeholder="z. B. 25%"
              @input="setDataVal(r, 'price', ($event.target as HTMLInputElement).value)" />
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

        <!-- Plausibilität je Preis -->
        <ul v-if="warningsFor(r).length" class="mt-3 space-y-1">
          <li v-for="wtext in warningsFor(r)" :key="wtext" class="text-xs text-amber-300 flex gap-1.5">
            <span>⚠</span><span>{{ wtext }}</span>
          </li>
        </ul>

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
      <template v-if="availableToAdd.length">
        <select v-model.number="addTplId" class="input w-auto">
          <option v-for="t in availableToAdd" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <button class="btn" @click="addRow">+ Preis hinzufügen</button>
      </template>
      <RouterLink v-else-if="!templates.length" to="/bon-editor" class="text-sm text-brand-accent2">
        Erst ein Bon-Layout im Bon-Editor anlegen →
      </RouterLink>
      <span v-else class="text-sm text-slate-500">Alle Layouts zugeordnet.</span>
      <button class="btn btn-primary" @click="saveMix">Preise speichern</button>
      <span class="text-sm text-slate-400">{{ mixMsg }}</span>
    </div>
  </section>

  <!-- Auswertung -->
  <section class="panel mt-5">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-3">Auswertung</h2>
    <div class="flex items-end gap-3 flex-wrap mb-4">
      <div><label class="label">Von</label><input v-model="range.from" type="date" class="input w-auto" /></div>
      <div><label class="label">Bis</label><input v-model="range.to" type="date" class="input w-auto" /></div>
      <button class="btn btn-primary" @click="loadReport">Laden</button>
    </div>

    <!-- Statistik: was & wie viel gebuzzert, wie viel noch übrig -->
    <h3 class="text-xs uppercase tracking-wide text-slate-500 mb-2">
      Ausgaben im Zeitraum · gesamt {{ statsTotal }}
    </h3>
    <div v-if="stats.length" class="overflow-x-auto mb-6">
      <table class="w-full">
        <thead>
          <tr><th class="th">Preis</th><th class="th">Gedruckt</th><th class="th">Fehler</th><th class="th">Rest jetzt</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in stats" :key="s.template">
            <td class="td">{{ s.template }}</td>
            <td class="td tabular-nums">{{ s.done }}</td>
            <td class="td tabular-nums" :class="{ 'text-red-300': s.error > 0 }">{{ s.error }}</td>
            <td class="td tabular-nums text-slate-400">{{ restForTemplate(s.template) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-slate-400 text-sm mb-6">Keine Ausgaben im Zeitraum.</p>

    <!-- Ereignisse (Log) -->
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs uppercase tracking-wide text-slate-500">Ereignisse</h3>
      <select v-model="eventLevel" class="input w-auto text-xs" @change="loadEvents">
        <option value="">alle Level</option>
        <option value="info">info</option>
        <option value="warn">warn</option>
        <option value="error">error</option>
      </select>
    </div>
    <div v-if="events.length" class="overflow-x-auto mb-6">
      <table class="w-full">
        <thead>
          <tr><th class="th">Zeit</th><th class="th">Level</th><th class="th">Typ</th><th class="th">Meldung</th></tr>
        </thead>
        <tbody>
          <tr v-for="e in events" :key="e.id">
            <td class="td whitespace-nowrap tabular-nums text-slate-400">{{ fmtTime(e.ts) }}</td>
            <td class="td"><span :class="LEVEL_CLS[e.level] || 'pill'">{{ e.level }}</span></td>
            <td class="td font-mono text-xs">{{ e.type }}</td>
            <td class="td">{{ e.message }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-slate-400 text-sm mb-6">Keine Ereignisse im Zeitraum.</p>

    <!-- Einzeldrucke -->
    <details>
      <summary class="text-xs uppercase tracking-wide text-slate-500 cursor-pointer">
        Einzeldrucke ({{ jobs.length }})
      </summary>
      <div v-if="jobs.length" class="overflow-x-auto mt-2">
        <table class="w-full">
          <thead>
            <tr><th class="th">Zeit</th><th class="th">Preis</th><th class="th">Code</th><th class="th">Status</th><th class="th"></th></tr>
          </thead>
          <tbody>
            <tr v-for="j in jobs" :key="j.id">
              <td class="td whitespace-nowrap tabular-nums text-slate-400">{{ fmtTime(j.created_at) }}</td>
              <td class="td">{{ j.data?.template || '—' }}</td>
              <td class="td font-mono text-xs">{{ j.data?.code || '—' }}</td>
              <td class="td">{{ j.status }}</td>
              <td class="td">
                <button v-if="j.filled_template" class="btn btn-ghost px-2 py-0.5 text-xs" @click="previewJob(j)">Vorschau</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>

  <!-- Vorschau-Modal -->
  <div v-if="previewOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="previewOpen = false">
    <div class="bg-brand-panel border border-brand-border rounded-xl p-4 max-h-[90vh] overflow-auto">
      <div class="flex items-center justify-between mb-3 gap-6">
        <span class="font-semibold">{{ previewTitle }}</span>
        <button class="btn btn-ghost px-2 py-1" @click="previewOpen = false">✕</button>
      </div>
      <div class="bg-slate-700/40 p-4 rounded-lg flex justify-center">
        <canvas ref="previewCanvas" class="shadow-2xl rounded-sm max-w-full"></canvas>
      </div>
    </div>
  </div>
</template>
