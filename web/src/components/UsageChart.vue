<script setup lang="ts">
// Generisches Ein-Serien-Liniendiagramm (Nutzung nach Stunde ODER nach Tag).
// Inline-SVG, keine Chart-Bibliothek. Akzentlinie, recessive Achsen/Grid,
// Text in Ink-Tokens, Peak-Markierung, Hover-Crosshair mit Tooltip.
import { computed, ref } from 'vue';

const props = defineProps<{
  values: number[];
  /** Tooltip-Text je Punkt (gleiche Länge wie values). */
  pointLabels: string[];
  /** X-Achsen-Beschriftungen an bestimmten Indizes. */
  ticks: { i: number; text: string }[];
  /** Caption-Präfix für den Höchstwert, z.B. "Stoßzeit" / "Spitzentag". */
  peakLabel?: string;
}>();

const ACCENT = '#ffcd00';
const W = 720;
const H = 220;
const padL = 34;
const padR = 12;
const padT = 12;
const padB = 26;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

const n = computed(() => props.values.length);
const yMax = computed(() => Math.max(1, ...props.values));
const total = computed(() => props.values.reduce((a, b) => a + b, 0));
const peak = computed(() => {
  let hi = -1;
  for (let i = 0; i < n.value; i++) if (props.values[i] > (props.values[hi] ?? -1)) hi = i;
  return hi >= 0 && props.values[hi] > 0 ? hi : null;
});

const xAt = (i: number) => padL + (n.value <= 1 ? plotW / 2 : (i / (n.value - 1)) * plotW);
const yAt = (v: number) => padT + plotH - (v / yMax.value) * plotH;

const linePath = computed(() =>
  props.values.map((c, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(c).toFixed(1)}`).join(' '),
);
const areaPath = computed(
  () => `${linePath.value} L${xAt(n.value - 1).toFixed(1)},${yAt(0).toFixed(1)} L${xAt(0).toFixed(1)},${yAt(0).toFixed(1)} Z`,
);
const yTicks = computed(() => {
  const m = yMax.value;
  return [0, Math.round(m / 2), m];
});

const hover = ref<number | null>(null);
function onMove(e: MouseEvent) {
  const r = (e.currentTarget as SVGElement).getBoundingClientRect();
  const ratio = (e.clientX - r.left) / r.width;
  hover.value = Math.max(0, Math.min(n.value - 1, Math.round(ratio * (n.value - 1))));
}
</script>

<template>
  <div class="relative">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full select-none"
      role="img"
      aria-label="Nutzung im Zeitverlauf"
      @mousemove="onMove"
      @mouseleave="hover = null"
    >
      <g class="text-slate-700">
        <template v-for="t in yTicks" :key="'y' + t">
          <line :x1="padL" :x2="W - padR" :y1="yAt(t)" :y2="yAt(t)" stroke="currentColor" stroke-width="1" opacity="0.5" />
          <text :x="padL - 6" :y="yAt(t) + 4" text-anchor="end" class="fill-slate-500" font-size="11">{{ t }}</text>
        </template>
      </g>
      <g>
        <text v-for="t in ticks" :key="'x' + t.i" :x="xAt(t.i)" :y="H - 8" text-anchor="middle" class="fill-slate-500" font-size="11">{{ t.text }}</text>
      </g>
      <defs>
        <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="ACCENT" stop-opacity="0.26" />
          <stop offset="100%" :stop-color="ACCENT" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="areaPath" fill="url(#usageFill)" />
      <path :d="linePath" fill="none" :stroke="ACCENT" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle v-if="peak !== null" :cx="xAt(peak)" :cy="yAt(values[peak])" r="4" :fill="ACCENT" stroke="#0d0f14" stroke-width="2" />
      <template v-if="hover !== null">
        <line :x1="xAt(hover)" :x2="xAt(hover)" :y1="padT" :y2="H - padB" :stroke="ACCENT" stroke-width="1" opacity="0.4" />
        <circle :cx="xAt(hover)" :cy="yAt(values[hover])" r="4" :fill="ACCENT" stroke="#0d0f14" stroke-width="2" />
      </template>
    </svg>
    <div
      v-if="hover !== null"
      class="absolute -top-1 -translate-x-1/2 pointer-events-none bg-brand-panel border border-brand-border rounded px-2 py-1 text-xs whitespace-nowrap"
      :style="{ left: (xAt(hover) / W) * 100 + '%' }"
    >
      {{ pointLabels[hover] }}: <strong>{{ values[hover] }}</strong>
    </div>
    <p class="text-xs text-slate-400 mt-1">
      Gesamt {{ total }}
      <template v-if="peak !== null"> · {{ peakLabel || 'Spitze' }} {{ pointLabels[peak] }} ({{ values[peak] }})</template>
    </p>
  </div>
</template>
