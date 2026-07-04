<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { getClient } from '../lib/supabase';
import { renderReceipt } from '../lib/receipt';
import type { ReceiptElement, ReceiptTemplate, TemplateRow } from '../lib/types';

const STARTER: ReceiptTemplate = {
  elements: [
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
    { type: 'newline', count: 2 },
    { type: 'text', value: '{{date}} {{time}}' },
    { type: 'newline', count: 3 },
    { type: 'cut', value: 'full' },
  ],
};

const SNIPPETS: Record<string, ReceiptElement> = {
  text: { type: 'text', value: 'Text' },
  price: { type: 'text', value: '{{price}} RABATT' },
  code: { type: 'text', value: 'Code: {{code}}' },
  // Dynamischer Code: QR auf die Einlöse-URL der App.
  'qr-einlösen': { type: 'qrcode', value: '{{redeem_url}}', options: { model: 2, size: 6, errorlevel: 'm' } },
  // Statischer Code an der Kasse: Barcode (aus Code-Wert) …
  barcode: { type: 'barcode', value: '{{code}}', symbology: 'ean13', height: 60 },
  // … oder ein festes Barcode-Bild.
  bild: { type: 'image', input: 'https://beispiel.de/barcode.png', width: 300, height: 120 },
  rule: { type: 'rule', style: 'single' },
  newline: { type: 'newline', count: 1 },
  cut: { type: 'cut', value: 'full' },
};

const placeholders = '{{code}}, {{redeem_url}}, {{price}}, {{date}}, {{time}}';

const templates = ref<TemplateRow[]>([]);
const selectedId = ref<number | ''>('');
const name = ref('');
const json = ref(JSON.stringify(STARTER, null, 2));
const msg = ref('');
const canvas = ref<HTMLCanvasElement | null>(null);

function draw() {
  if (!canvas.value) return;
  try {
    const parsed = JSON.parse(json.value);
    const els: ReceiptElement[] = Array.isArray(parsed) ? parsed : parsed.elements;
    renderReceipt(canvas.value, els || []);
    msg.value = '';
  } catch (e) {
    msg.value = 'JSON: ' + (e as Error).message;
  }
}

watch(json, draw);

function insert(kind: string) {
  try {
    const parsed = JSON.parse(json.value);
    const obj: ReceiptTemplate = parsed.elements ? parsed : { elements: parsed };
    obj.elements.push(SNIPPETS[kind]);
    json.value = JSON.stringify(obj, null, 2);
  } catch {
    /* bei ungültigem JSON nichts tun */
  }
}

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
    json.value = JSON.stringify(t.template, null, 2);
  } else {
    json.value = JSON.stringify(STARTER, null, 2);
  }
}

async function save(asNew = false) {
  const c = getClient();
  if (!c) return;
  let template: ReceiptTemplate;
  try {
    template = JSON.parse(json.value);
  } catch {
    msg.value = 'JSON ungültig';
    return;
  }
  if (!name.value.trim()) {
    msg.value = 'Name nötig';
    return;
  }
  if (selectedId.value && !asNew) {
    const { error } = await c.from('templates').update({ name: name.value.trim(), template }).eq('id', selectedId.value);
    msg.value = error ? 'Fehler: ' + error.message : 'Gespeichert ✓';
  } else {
    const { error } = await c.from('templates').insert({ name: name.value.trim(), template });
    msg.value = error ? 'Fehler: ' + error.message : 'Angelegt ✓';
  }
  if (!msg.value.startsWith('Fehler')) loadList();
}

onMounted(() => {
  loadList();
  draw();
});
</script>

<template>
  <h1 class="text-2xl font-semibold mb-1">Bon-Editor</h1>
  <p class="text-slate-400 mb-5">
    Layout als Element-Liste bearbeiten, rechts die Live-Vorschau (80&nbsp;mm). Platzhalter:
    <code class="text-xs bg-[#0d0f14] px-1.5 py-0.5 rounded">{{ placeholders }}</code>.
  </p>

  <section class="panel mb-5 flex flex-wrap gap-4">
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
  </section>

  <div class="grid gap-5 lg:grid-cols-[1fr_380px] items-start">
    <section class="panel">
      <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-2">Elemente (JSON)</h2>
      <div class="flex flex-wrap gap-1.5 mb-2">
        <button v-for="k in Object.keys(SNIPPETS)" :key="k" class="btn btn-ghost px-2.5 py-1 text-xs" @click="insert(k)">
          + {{ k }}
        </button>
      </div>
      <textarea v-model="json" class="input font-mono text-xs min-h-[380px]" spellcheck="false"></textarea>
      <div class="flex items-center gap-3 mt-3">
        <button class="btn btn-primary" @click="save(false)">Speichern</button>
        <button class="btn" @click="save(true)">Als neu speichern</button>
        <span class="text-sm text-slate-400">{{ msg }}</span>
      </div>
    </section>

    <section>
      <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-2">Vorschau</h2>
      <div class="bg-slate-700/40 p-4 rounded-xl flex justify-center">
        <canvas ref="canvas" class="shadow-2xl rounded-sm max-w-full"></canvas>
      </div>
      <p class="text-slate-400 text-xs mt-2">
        Layout-Simulation (Font A, 42 Zeichen). Der Pi rendert dieselbe Element-Liste mit dem echten ESC/POS-Encoder.
      </p>
    </section>
  </div>
</template>
