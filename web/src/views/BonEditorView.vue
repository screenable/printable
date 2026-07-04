<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getClient } from '../lib/supabase';
import { renderReceipt } from '../lib/receipt';
import type { ReceiptElement, ReceiptTemplate, TemplateRow } from '../lib/types';

const placeholders = '{{code}}, {{redeem_url}}, {{price}}, {{date}}, {{time}}';

const SYMBOLOGIES = ['ean13', 'ean8', 'upca', 'upce', 'coda39', 'itf', 'codabar'];

// Palette: jeder Eintrag hängt ein Element an.
const PALETTE: { label: string; make: () => ReceiptElement }[] = [
  { label: 'Text', make: () => ({ type: 'text', value: 'Text' }) },
  { label: 'Code-Text', make: () => ({ type: 'text', value: 'Code: {{code}}' }) },
  { label: 'Ausrichtung', make: () => ({ type: 'align', value: 'center' }) },
  { label: 'Größe', make: () => ({ type: 'size', width: 1, height: 1 }) },
  { label: 'Fett', make: () => ({ type: 'bold', value: true }) },
  { label: 'Leerzeile', make: () => ({ type: 'newline', count: 1 }) },
  { label: 'Linie', make: () => ({ type: 'rule', style: 'single' }) },
  { label: 'QR (Einlösen)', make: () => ({ type: 'qrcode', value: '{{redeem_url}}', options: { model: 2, size: 6, errorlevel: 'm' } }) },
  { label: 'Barcode', make: () => ({ type: 'barcode', value: '{{code}}', symbology: 'ean13', height: 60 }) },
  { label: 'Bild', make: () => ({ type: 'image', input: 'https://beispiel.de/barcode.png', width: 300, height: 120 }) },
  { label: 'Schnitt', make: () => ({ type: 'cut', value: 'full' }) },
];

const STARTER: ReceiptElement[] = [
  { type: 'align', value: 'center' },
  { type: 'size', width: 2, height: 2 },
  { type: 'bold', value: true },
  { type: 'text', value: 'EDEKA Frische' },
  { type: 'newline', count: 1 },
  { type: 'size', width: 1, height: 1 },
  { type: 'bold', value: false },
  { type: 'text', value: 'GUTSCHEIN' },
  { type: 'newline', count: 2 },
  { type: 'size', width: 2, height: 1 },
  { type: 'text', value: '{{price}} RABATT' },
  { type: 'newline', count: 2 },
  { type: 'size', width: 1, height: 1 },
  { type: 'text', value: 'Code: {{code}}' },
  { type: 'newline', count: 1 },
  { type: 'qrcode', value: '{{redeem_url}}', options: { model: 2, size: 6, errorlevel: 'm' } },
  { type: 'newline', count: 1 },
  { type: 'text', value: 'In der App einlösen' },
  { type: 'newline', count: 3 },
  { type: 'cut', value: 'full' },
];

const templates = ref<TemplateRow[]>([]);
const selectedId = ref<number | ''>('');
const name = ref('');
const elements = ref<ReceiptElement[]>(clone(STARTER));
const msg = ref('');
const canvas = ref<HTMLCanvasElement | null>(null);
const dragIndex = ref<number | null>(null);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const TYPE_LABEL: Record<string, string> = {
  text: 'Text', line: 'Zeile', align: 'Ausrichtung', size: 'Größe', bold: 'Fett',
  italic: 'Kursiv', underline: 'Unterstrichen', newline: 'Leerzeile', rule: 'Linie',
  qrcode: 'QR-Code', barcode: 'Barcode', image: 'Bild', cut: 'Schnitt',
};

function draw() {
  if (canvas.value) renderReceipt(canvas.value, elements.value);
}
watch(elements, draw, { deep: true });

// ── Element-Operationen ─────────────────────────────────────────────────────
function add(make: () => ReceiptElement) {
  elements.value.push(make());
}
function remove(i: number) {
  elements.value.splice(i, 1);
}
function duplicate(i: number) {
  elements.value.splice(i + 1, 0, clone(elements.value[i]));
}
function move(from: number, to: number) {
  if (from === to) return;
  const arr = elements.value.slice();
  const [m] = arr.splice(from, 1);
  arr.splice(to, 0, m);
  elements.value = arr;
}
function onDrop(i: number) {
  if (dragIndex.value !== null) move(dragIndex.value, i);
  dragIndex.value = null;
}

// ── JSON (Import/Export) ────────────────────────────────────────────────────
const json = computed({
  get: () => JSON.stringify({ elements: elements.value }, null, 2),
  set: (v: string) => {
    try {
      const parsed = JSON.parse(v);
      elements.value = Array.isArray(parsed) ? parsed : parsed.elements || [];
      msg.value = '';
    } catch (e) {
      msg.value = 'JSON: ' + (e as Error).message;
    }
  },
});

// ── Laden / Speichern ───────────────────────────────────────────────────────
async function loadList() {
  const c = getClient();
  if (!c) return;
  const { data } = await c.from('templates').select('id, name, template').order('name');
  templates.value = (data as TemplateRow[]) || [];
}

function onSelect() {
  const t = templates.value.find(x => x.id === selectedId.value);
  if (t) {
    name.value = t.name;
    elements.value = clone(t.template.elements || []);
  } else {
    elements.value = clone(STARTER);
  }
}

async function save(asNew = false) {
  const c = getClient();
  if (!c) return;
  if (!name.value.trim()) { msg.value = 'Name nötig'; return; }
  const template: ReceiptTemplate = { elements: elements.value };
  if (selectedId.value && !asNew) {
    const { error } = await c.from('templates').update({ name: name.value.trim(), template }).eq('id', selectedId.value);
    msg.value = error ? 'Fehler: ' + error.message : 'Gespeichert ✓';
  } else {
    const { error } = await c.from('templates').insert({ name: name.value.trim(), template });
    msg.value = error ? 'Fehler: ' + error.message : 'Angelegt ✓';
  }
  if (!msg.value.startsWith('Fehler')) loadList();
}

async function del() {
  const c = getClient();
  if (!c || !selectedId.value) return;
  // Plausibilität: wird das Layout von Preisen genutzt? (FK cascade würde sie mitlöschen)
  const { count } = await c
    .from('device_templates')
    .select('*', { count: 'exact', head: true })
    .eq('template_id', selectedId.value);
  if (count && count > 0) {
    msg.value = `Wird von ${count} Preis(en) verwendet – dort zuerst entfernen.`;
    return;
  }
  if (!confirm(`Template "${name.value}" wirklich löschen?`)) return;
  const { error } = await c.from('templates').delete().eq('id', selectedId.value);
  if (error) { msg.value = 'Fehler: ' + error.message; return; }
  selectedId.value = '';
  onSelect();
  msg.value = 'Gelöscht ✓';
  loadList();
}

onMounted(() => { loadList(); draw(); });
</script>

<template>
  <h1 class="text-2xl font-semibold mb-1">Bon-Editor</h1>
  <p class="text-slate-400 mb-5">
    Elemente per <strong>Drag &amp; Drop</strong> (☰) sortieren, oben neue hinzufügen, rechts die
    Live-Vorschau (80&nbsp;mm). Platzhalter: <code class="text-xs bg-[#0d0f14] px-1.5 py-0.5 rounded">{{ placeholders }}</code>.
  </p>

  <section class="panel mb-5 flex flex-wrap gap-4 items-end">
    <div class="flex-1 min-w-[220px]">
      <label class="label">Template</label>
      <select v-model="selectedId" class="input" @change="onSelect">
        <option value="">— Neues Template —</option>
        <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
    </div>
    <div class="flex-1 min-w-[220px]">
      <label class="label">Name</label>
      <input v-model="name" class="input" placeholder="edeka-frische-25" />
    </div>
    <div class="flex gap-2">
      <button class="btn btn-primary" @click="save(false)">Speichern</button>
      <button class="btn" @click="save(true)">Als neu</button>
      <button v-if="selectedId" class="btn btn-ghost text-slate-400" @click="del">Löschen</button>
    </div>
    <span class="text-sm text-slate-400 w-full">{{ msg }}</span>
  </section>

  <div class="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
    <section class="panel">
      <div class="flex flex-wrap gap-1.5 mb-4">
        <button v-for="p in PALETTE" :key="p.label" class="btn btn-ghost px-2.5 py-1 text-xs" @click="add(p.make)">
          + {{ p.label }}
        </button>
      </div>

      <div class="space-y-2">
        <div
          v-for="(el, i) in elements"
          :key="i"
          class="rounded-lg border border-brand-border bg-[#0d0f14] p-2 flex items-start gap-2"
          :class="{ 'opacity-50': dragIndex === i }"
          @dragover.prevent
          @drop="onDrop(i)"
        >
          <span
            class="cursor-grab select-none text-slate-500 px-1 pt-1"
            draggable="true"
            title="Ziehen zum Sortieren"
            @dragstart="dragIndex = i"
            @dragend="dragIndex = null"
          >☰</span>

          <div class="flex-1 min-w-0">
            <div class="text-xs text-slate-400 mb-1">{{ TYPE_LABEL[el.type] || el.type }}</div>

            <!-- Typ-spezifische Felder -->
            <input v-if="el.type === 'text' || el.type === 'line'" v-model="el.value as string" class="input" :placeholder="'Text – z. B. Code: {{code}}'" />

            <select v-else-if="el.type === 'align'" v-model="el.value as string" class="input w-40">
              <option value="left">links</option><option value="center">zentriert</option><option value="right">rechts</option>
            </select>

            <div v-else-if="el.type === 'size'" class="flex gap-2 items-center text-sm">
              <label class="text-slate-400">Breite</label>
              <input v-model.number="el.width" type="number" min="1" max="8" class="input w-16" />
              <label class="text-slate-400">Höhe</label>
              <input v-model.number="el.height" type="number" min="1" max="8" class="input w-16" />
            </div>

            <label v-else-if="el.type === 'bold' || el.type === 'italic' || el.type === 'underline'" class="text-sm text-slate-300 flex items-center gap-2">
              <input v-model="el.value as boolean" type="checkbox" /> an
            </label>

            <div v-else-if="el.type === 'newline'" class="flex gap-2 items-center text-sm">
              <label class="text-slate-400">Anzahl</label>
              <input v-model.number="el.count" type="number" min="1" class="input w-16" />
            </div>

            <select v-else-if="el.type === 'rule'" v-model="el.style as string" class="input w-40">
              <option value="single">einfach</option><option value="double">doppelt</option><option value="none">leer</option>
            </select>

            <input v-else-if="el.type === 'qrcode'" v-model="el.value as string" class="input" :placeholder="'{{redeem_url}}'" />

            <div v-else-if="el.type === 'barcode'" class="flex gap-2 items-center">
              <input v-model="el.value as string" class="input flex-1" :placeholder="'{{code}}'" />
              <select v-model="el.symbology" class="input w-28">
                <option v-for="s in SYMBOLOGIES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>

            <div v-else-if="el.type === 'image'" class="flex gap-2 items-center">
              <input v-model="el.input" class="input flex-1" placeholder="https://…/bild.png" />
              <input v-model.number="el.width" type="number" class="input w-20" placeholder="B" />
              <input v-model.number="el.height" type="number" class="input w-20" placeholder="H" />
            </div>

            <select v-else-if="el.type === 'cut'" v-model="el.value as string" class="input w-40">
              <option value="full">voll</option><option value="partial">teilweise</option>
            </select>

            <span v-else class="text-xs text-slate-500">{{ JSON.stringify(el) }}</span>
          </div>

          <div class="flex flex-col gap-1">
            <button class="btn btn-ghost px-2 py-0.5 text-xs" title="Duplizieren" @click="duplicate(i)">⧉</button>
            <button class="btn btn-ghost px-2 py-0.5 text-xs text-slate-400" title="Löschen" @click="remove(i)">✕</button>
          </div>
        </div>
      </div>

      <details class="mt-4">
        <summary class="text-xs text-slate-400 cursor-pointer">JSON (Import/Export)</summary>
        <textarea v-model="json" class="input font-mono text-xs min-h-[200px] mt-2" spellcheck="false"></textarea>
      </details>
    </section>

    <section>
      <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-2">Vorschau</h2>
      <div class="bg-slate-700/40 p-4 rounded-xl flex justify-center sticky top-20">
        <canvas ref="canvas" class="shadow-2xl rounded-sm max-w-full"></canvas>
      </div>
      <p class="text-slate-400 text-xs mt-2">
        Layout-Simulation (Font A, 42 Zeichen). Der Pi rendert dieselbe Element-Liste mit dem echten ESC/POS-Encoder.
      </p>
    </section>
  </div>
</template>
