<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { getClient } from '../lib/supabase';
import { preloadImages, renderReceipt } from '../lib/receipt';
import { optimizeForReceipt, RECEIPT_MAX_WIDTH } from '../lib/receipt-image';
import {
  type Align,
  type BarcodeBlock,
  type Block,
  compile,
  type CutBlock,
  decompile,
  type ImageBlock,
  type QrBlock,
  type RuleBlock,
  SIZE_LABEL,
  type SizeKey,
  type SpaceBlock,
  type TextBlock,
} from '../lib/receipt-blocks';
import type { ReceiptTemplate, TemplateRow } from '../lib/types';

/** Blöcke mit Ausrichtung (QR/Barcode) für Template-Casts. */
type QrLike = { align: Align };

const IMAGE_BUCKET = 'template-images';
const placeholders = '{{code}}, {{redeem_url}}, {{price}}, {{date}}, {{time}}';
const SYMBOLOGIES = ['ean13', 'ean8', 'upca', 'upce', 'coda39', 'itf', 'codabar'];

const ALIGNS: { v: Align; label: string }[] = [
  { v: 'left', label: 'Links' },
  { v: 'center', label: 'Mitte' },
  { v: 'right', label: 'Rechts' },
];
const SIZE_KEYS: SizeKey[] = ['normal', 'gross', 'riesig'];

// Palette: jeder Eintrag hängt einen neuen Block an.
const PALETTE: { label: string; make: () => Block }[] = [
  { label: 'Text', make: () => ({ kind: 'text', text: 'Text', align: 'center', size: 'normal', bold: false, italic: false, underline: false }) },
  { label: 'Leerzeile', make: () => ({ kind: 'space', count: 1 }) },
  { label: 'Linie', make: () => ({ kind: 'rule', style: 'single' }) },
  { label: 'QR-Code', make: () => ({ kind: 'qrcode', value: '{{redeem_url}}', align: 'center' }) },
  { label: 'Barcode', make: () => ({ kind: 'barcode', value: '{{code}}', symbology: 'ean13', height: 60, align: 'center' }) },
  { label: 'Bild', make: () => ({ kind: 'image', input: '', width: RECEIPT_MAX_WIDTH, height: 200, align: 'center' }) },
  { label: 'Schnitt', make: () => ({ kind: 'cut', value: 'full' }) },
];

const STARTER: Block[] = [
  { kind: 'text', text: 'EDEKA Frische', align: 'center', size: 'gross', bold: true, italic: false, underline: false },
  { kind: 'text', text: 'GUTSCHEIN', align: 'center', size: 'normal', bold: false, italic: false, underline: false },
  { kind: 'space', count: 1 },
  { kind: 'text', text: '{{price}} RABATT', align: 'center', size: 'gross', bold: true, italic: false, underline: false },
  { kind: 'space', count: 1 },
  { kind: 'text', text: 'Code: {{code}}', align: 'center', size: 'normal', bold: false, italic: false, underline: false },
  { kind: 'qrcode', value: '{{redeem_url}}', align: 'center' },
  { kind: 'text', text: 'In der App einlösen', align: 'center', size: 'normal', bold: false, italic: false, underline: false },
  { kind: 'space', count: 2 },
  { kind: 'cut', value: 'full' },
];

const templates = ref<TemplateRow[]>([]);
const selectedId = ref<number | ''>('');
const name = ref('');
const blocks = ref<Block[]>(clone(STARTER));
const msg = ref('');
const canvas = ref<HTMLCanvasElement | null>(null);
const dragIndex = ref<number | null>(null);

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const KIND_LABEL: Record<Block['kind'], string> = {
  text: 'Text', space: 'Leerzeile', rule: 'Linie', qrcode: 'QR-Code',
  barcode: 'Barcode', image: 'Bild', cut: 'Schnitt',
};

// ── Vorschau ────────────────────────────────────────────────────────────────
async function draw() {
  if (!canvas.value) return;
  const elements = compile(blocks.value);
  await preloadImages(elements);
  if (canvas.value) renderReceipt(canvas.value, elements);
}
watch(blocks, draw, { deep: true });

/** Live-Stil für das Text-Eingabefeld, damit es wie das Druckbild aussieht. */
function textStyle(b: TextBlock) {
  const px = b.size === 'riesig' ? 26 : b.size === 'gross' ? 20 : 14;
  return {
    fontWeight: b.bold ? '700' : '400',
    fontStyle: b.italic ? 'italic' : 'normal',
    textDecoration: b.underline ? 'underline' : 'none',
    textAlign: b.align,
    fontSize: px + 'px',
  } as Record<string, string>;
}

// ── Block-Operationen ───────────────────────────────────────────────────────
function add(make: () => Block) {
  blocks.value.push(make());
}
function remove(i: number) {
  blocks.value.splice(i, 1);
}
function duplicate(i: number) {
  blocks.value.splice(i + 1, 0, clone(blocks.value[i]));
}
function move(from: number, to: number) {
  if (from === to) return;
  const arr = blocks.value.slice();
  const [m] = arr.splice(from, 1);
  arr.splice(to, 0, m);
  blocks.value = arr;
}
function onDrop(i: number) {
  if (dragIndex.value !== null) move(dragIndex.value, i);
  dragIndex.value = null;
}

// ── Bild-Upload ─────────────────────────────────────────────────────────────
const uploading = ref<number | null>(null);

function hasImage(b: ImageBlock): boolean {
  return typeof b.input === 'string' && /^https?:/.test(b.input);
}
function clearImage(i: number) {
  (blocks.value[i] as ImageBlock).input = '';
  msg.value = 'Bild entfernt – „Speichern" nicht vergessen.';
}

async function onImageUpload(i: number, ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const c = getClient();
  if (!c) { msg.value = 'Keine Supabase-Verbindung'; return; }

  uploading.value = i;
  msg.value = '';
  try {
    const opt = await optimizeForReceipt(file);
    const path = `templates/${crypto.randomUUID()}.png`;
    const { error } = await c.storage
      .from(IMAGE_BUCKET)
      .upload(path, opt.blob, { contentType: 'image/png', upsert: false });
    if (error) throw error;
    const { data } = c.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    const b = blocks.value[i] as ImageBlock;
    b.input = data.publicUrl;
    b.width = opt.width;
    b.height = opt.height;
    msg.value = `Bild optimiert (${opt.width}×${opt.height} px) – jetzt „Speichern" klicken, damit es im Template landet.`;
  } catch (e) {
    msg.value = 'Upload fehlgeschlagen: ' + (e as Error).message;
  } finally {
    uploading.value = null;
    input.value = '';
  }
}

// ── Erweitert: kompiliertes Template (nur Ansicht) ──────────────────────────
const compiledJson = computed(() => JSON.stringify({ elements: compile(blocks.value) }, null, 2));

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
    blocks.value = decompile(t.template.elements || []);
  } else {
    blocks.value = clone(STARTER);
  }
}

async function save(asNew = false) {
  const c = getClient();
  if (!c) return;
  if (!name.value.trim()) { msg.value = 'Name nötig'; return; }
  const template: ReceiptTemplate = { elements: compile(blocks.value) };
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
    Blöcke per <strong>Drag &amp; Drop</strong> (☰) sortieren, oben neue hinzufügen. Formatierung
    (Ausrichtung, Größe, Fett …) stellst du <strong>direkt am Text</strong> ein – rechts siehst du
    live das Druckbild (80&nbsp;mm). Platzhalter:
    <code class="text-xs bg-[#0d0f14] px-1.5 py-0.5 rounded">{{ placeholders }}</code>.
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
          v-for="(block, i) in blocks"
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
            <div class="text-xs text-slate-400 mb-1">{{ KIND_LABEL[block.kind] }}</div>

            <!-- TEXT: Eingabe + Formatier-Toolbar (WYSIWYG) -->
            <template v-if="block.kind === 'text'">
              <input
                v-model="(block as TextBlock).text"
                class="input mb-2"
                :style="textStyle(block as TextBlock)"
                :placeholder="'Text – z. B. Code: {{code}}'"
              />
              <div class="flex flex-wrap items-center gap-2">
                <div class="flex gap-1">
                  <button
                    v-for="a in ALIGNS" :key="a.v"
                    class="btn px-2 py-0.5 text-xs"
                    :class="(block as TextBlock).align === a.v ? 'btn-primary' : 'btn-ghost'"
                    @click="(block as TextBlock).align = a.v"
                  >{{ a.label }}</button>
                </div>
                <select v-model="(block as TextBlock).size" class="input w-28 py-1 text-xs">
                  <option v-for="s in SIZE_KEYS" :key="s" :value="s">{{ SIZE_LABEL[s] }}</option>
                </select>
                <div class="flex gap-1">
                  <button class="btn px-2 py-0.5 text-xs font-bold" :class="(block as TextBlock).bold ? 'btn-primary' : 'btn-ghost'" title="Fett" @click="(block as TextBlock).bold = !(block as TextBlock).bold">F</button>
                  <button class="btn px-2 py-0.5 text-xs italic" :class="(block as TextBlock).italic ? 'btn-primary' : 'btn-ghost'" title="Kursiv" @click="(block as TextBlock).italic = !(block as TextBlock).italic">K</button>
                  <button class="btn px-2 py-0.5 text-xs underline" :class="(block as TextBlock).underline ? 'btn-primary' : 'btn-ghost'" title="Unterstrichen" @click="(block as TextBlock).underline = !(block as TextBlock).underline">U</button>
                </div>
              </div>
            </template>

            <!-- LEERZEILE -->
            <div v-else-if="block.kind === 'space'" class="flex gap-2 items-center text-sm">
              <label class="text-slate-400">Anzahl Leerzeilen</label>
              <input v-model.number="(block as SpaceBlock).count" type="number" min="1" class="input w-16" />
            </div>

            <!-- LINIE -->
            <select v-else-if="block.kind === 'rule'" v-model="(block as RuleBlock).style" class="input w-40">
              <option value="single">einfach</option><option value="double">doppelt</option><option value="none">leer</option>
            </select>

            <!-- QR-CODE -->
            <div v-else-if="block.kind === 'qrcode'" class="space-y-2">
              <input v-model="(block as QrBlock).value" class="input" :placeholder="'{{redeem_url}}'" />
              <div class="flex gap-1">
                <button v-for="a in ALIGNS" :key="a.v" class="btn px-2 py-0.5 text-xs" :class="(block as QrLike).align === a.v ? 'btn-primary' : 'btn-ghost'" @click="(block as QrLike).align = a.v">{{ a.label }}</button>
              </div>
            </div>

            <!-- BARCODE -->
            <div v-else-if="block.kind === 'barcode'" class="space-y-2">
              <div class="flex gap-2 items-center">
                <input v-model="(block as BarcodeBlock).value" class="input flex-1" :placeholder="'{{code}}'" />
                <select v-model="(block as BarcodeBlock).symbology" class="input w-28">
                  <option v-for="s in SYMBOLOGIES" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
              <div class="flex gap-1">
                <button v-for="a in ALIGNS" :key="a.v" class="btn px-2 py-0.5 text-xs" :class="(block as QrLike).align === a.v ? 'btn-primary' : 'btn-ghost'" @click="(block as QrLike).align = a.v">{{ a.label }}</button>
              </div>
            </div>

            <!-- BILD -->
            <div v-else-if="block.kind === 'image'" class="space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <label class="btn btn-ghost px-2.5 py-1 text-xs cursor-pointer">
                  {{ uploading === i ? 'Lädt…' : hasImage(block as ImageBlock) ? '⬆ Bild ersetzen' : '⬆ Bild hochladen' }}
                  <input type="file" accept="image/*" class="hidden" :disabled="uploading === i" @change="onImageUpload(i, $event)" />
                </label>
                <button v-if="hasImage(block as ImageBlock)" class="btn btn-ghost px-2.5 py-1 text-xs text-slate-400" :disabled="uploading === i" @click="clearImage(i)">Entfernen</button>
                <span class="text-xs text-slate-500">wird auto. auf max. {{ RECEIPT_MAX_WIDTH }} px optimiert</span>
              </div>
              <div class="flex gap-1">
                <button v-for="a in ALIGNS" :key="a.v" class="btn px-2 py-0.5 text-xs" :class="(block as ImageBlock).align === a.v ? 'btn-primary' : 'btn-ghost'" @click="(block as ImageBlock).align = a.v">{{ a.label }}</button>
              </div>
              <img
                v-if="hasImage(block as ImageBlock)"
                :src="(block as ImageBlock).input"
                alt="Vorschau"
                class="max-h-24 border border-brand-border rounded bg-white"
              />
              <details>
                <summary class="text-xs text-slate-500 cursor-pointer">Erweitert (URL / Maße)</summary>
                <div class="flex gap-2 items-center mt-2">
                  <input v-model="(block as ImageBlock).input" class="input flex-1" placeholder="https://…/bild.png" />
                  <input v-model.number="(block as ImageBlock).width" type="number" class="input w-20" placeholder="B" />
                  <input v-model.number="(block as ImageBlock).height" type="number" class="input w-20" placeholder="H" />
                </div>
              </details>
            </div>

            <!-- SCHNITT -->
            <select v-else-if="block.kind === 'cut'" v-model="(block as CutBlock).value" class="input w-40">
              <option value="full">voll</option><option value="partial">teilweise</option>
            </select>
          </div>

          <div class="flex flex-col gap-1">
            <button class="btn btn-ghost px-2 py-0.5 text-xs" title="Duplizieren" @click="duplicate(i)">⧉</button>
            <button class="btn btn-ghost px-2 py-0.5 text-xs text-slate-400" title="Löschen" @click="remove(i)">✕</button>
          </div>
        </div>
      </div>

      <details class="mt-4">
        <summary class="text-xs text-slate-400 cursor-pointer">Technische Ansicht (kompiliertes Template)</summary>
        <textarea :value="compiledJson" readonly class="input font-mono text-xs min-h-[200px] mt-2" spellcheck="false"></textarea>
      </details>
    </section>

    <section>
      <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-2">Vorschau</h2>
      <div class="bg-slate-700/40 p-4 rounded-xl flex justify-center sticky top-20">
        <canvas ref="canvas" class="shadow-2xl rounded-sm max-w-full"></canvas>
      </div>
      <p class="text-slate-400 text-xs mt-2">
        Layout-Simulation (80&nbsp;mm, Font A, 48 Zeichen). Der Pi rendert dieselbe Element-Liste mit dem echten ESC/POS-Encoder.
      </p>
    </section>
  </div>
</template>
