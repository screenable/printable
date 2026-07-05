<script setup lang="ts">
// Ein-Serien-Liniendiagramm: Ausgaben nach Tagesstunde (Stoßzeiten).
// Inline-SVG, keine Chart-Bibliothek. Akzentfarbe für die Linie, neutrale
// Achsen/Grid, Text in Ink-Tokens; Hover-Crosshair mit Tooltip; Peak markiert.
import { computed, ref } from 'vue';

const props = defineProps<{ counts: number[] }>(); // Länge 24 (Stunde 0..23)

const ACCENT = '#ffcd00';
const W = 720;
const H = 220;
const padL = 34;
const padR = 12;
const padT = 12;
const padB = 26;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

const yMax = computed(() => Math.max(1, ...props.counts));
const total = computed(() => props.counts.reduce((a, b) => a + b, 0));
const peak = computed(() => {
  let hi = -1;
  for (let h = 0; h < 24; h++) if (props.counts[h] > (props.counts[hi] ?? -1)) hi = h;
  return hi >= 0 && props.counts[hi] > 0 ? hi : null;
});

const xAt = (h: number) => padL + (h / 23) * plotW;
const yAt = (v: number) => padT + plotH - (v / yMax.value) * plotH;

const linePath = computed(() =>
  props.counts.map((c, h) => `${h === 0 ? 'M' : 'L'}${xAt(h).toFixed(1)},${yAt(c).toFixed(1)}`).join(' '),
);
const areaPath = computed(
  () => `${linePath.value} L${xAt(23).toFixed(1)},${yAt(0).toFixed(1)} L${xAt(0).toFixed(1)},${yAt(0).toFixed(1)} Z`,
);
const yTicks = computed(() => {
  const m = yMax.value;
  return [0, Math.round(m / 2), m];
});
const xTicks = [0, 4, 8, 12, 16, 20];

const hover = ref<number | null>(null);
function onMove(e: MouseEvent) {
  const r = (e.currentTarget as SVGElement).getBoundingClientRect();
  const ratio = (e.clientX - r.left) / r.width;
  hover.value = Math.max(0, Math.min(23, Math.round(ratio * 23)));
}
</script>

<template>
  <div class="relative">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full select-none"
      role="img"
      aria-label="Ausgaben nach Tagesstunde"
      @mousemove="onMove"
      @mouseleave="hover = null"
    >
      <!-- Gridlines + Y-Beschriftung -->
      <g class="text-slate-700">
        <template v-for="t in yTicks" :key="'y' + t">
          <line :x1="padL" :x2="W - padR" :y1="yAt(t)" :y2="yAt(t)" stroke="currentColor" stroke-width="1" opacity="0.5" />
          <text :x="padL - 6" :y="yAt(t) + 4" text-anchor="end" class="fill-slate-500" font-size="11">{{ t }}</text>
        </template>
      </g>
      <!-- X-Beschriftung (Uhrzeit) -->
      <g>
        <text v-for="h in xTicks" :key="'x' + h" :x="xAt(h)" :y="H - 8" text-anchor="middle" class="fill-slate-500" font-size="11">{{ h }}</text>
        <text :x="xAt(23)" :y="H - 8" text-anchor="end" class="fill-slate-500" font-size="11">24</text>
      </g>
      <!-- Fläche + Linie -->
      <defs>
        <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="ACCENT" stop-opacity="0.26" />
          <stop offset="100%" :stop-color="ACCENT" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="areaPath" fill="url(#usageFill)" />
      <path :d="linePath" fill="none" :stroke="ACCENT" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <!-- Peak markieren -->
      <circle v-if="peak !== null" :cx="xAt(peak)" :cy="yAt(counts[peak])" r="4" :fill="ACCENT" stroke="#0d0f14" stroke-width="2" />
      <!-- Hover -->
      <template v-if="hover !== null">
        <line :x1="xAt(hover)" :x2="xAt(hover)" :y1="padT" :y2="H - padB" :stroke="ACCENT" stroke-width="1" opacity="0.4" />
        <circle :cx="xAt(hover)" :cy="yAt(counts[hover])" r="4" :fill="ACCENT" stroke="#0d0f14" stroke-width="2" />
      </template>
    </svg>
    <div
      v-if="hover !== null"
      class="absolute -top-1 -translate-x-1/2 pointer-events-none bg-brand-panel border border-brand-border rounded px-2 py-1 text-xs whitespace-nowrap"
      :style="{ left: (xAt(hover) / W) * 100 + '%' }"
    >
      {{ hover }}–{{ hover + 1 }} Uhr: <strong>{{ counts[hover] }}</strong>
    </div>
    <p class="text-xs text-slate-400 mt-1">
      Gesamt {{ total }}
      <template v-if="peak !== null"> · Stoßzeit {{ peak }}–{{ peak + 1 }} Uhr ({{ counts[peak] }})</template>
    </p>
  </div>
</template>
