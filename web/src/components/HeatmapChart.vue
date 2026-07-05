<script setup lang="ts">
// Heatmap Wochentag × Stunde. Sequenzielle Ein-Hue-Skala (Amber) über der
// dunklen Fläche = Magnitude; Cell-Hover mit Caption; Legende wenig→viel.
import { computed, ref } from 'vue';

const props = defineProps<{
  /** matrix[dow 0..6 = Mo..So][hour 0..23] = Anzahl */
  matrix: number[][];
}>();

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const max = computed(() => {
  let m = 0;
  for (const row of props.matrix) for (const v of row) if (v > m) m = v;
  return m;
});
const total = computed(() => props.matrix.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0));

const peak = computed(() => {
  let best = { d: -1, h: -1, v: 0 };
  props.matrix.forEach((row, d) => row.forEach((v, h) => { if (v > best.v) best = { d, h, v }; }));
  return best.v > 0 ? best : null;
});

function alpha(v: number): number {
  if (v <= 0) return 0;
  return 0.14 + 0.86 * (v / max.value);
}
function cellStyle(v: number) {
  return v > 0
    ? { backgroundColor: `rgba(255, 205, 0, ${alpha(v).toFixed(3)})` }
    : { backgroundColor: 'rgba(255, 255, 255, 0.03)' };
}

const hover = ref<{ d: number; h: number; v: number } | null>(null);
const caption = computed(() => {
  const c = hover.value ?? peak.value;
  if (!c) return 'Keine Daten im Zeitraum.';
  const prefix = hover.value ? '' : 'Stärkste Zeit: ';
  return `${prefix}${WD[c.d]} ${c.h}–${c.h + 1} Uhr: ${c.v}`;
});
</script>

<template>
  <div>
    <div class="overflow-x-auto">
      <div class="inline-grid gap-[2px]" style="grid-template-columns: 2rem repeat(24, 15px)">
        <!-- Kopfzeile: Ecke + Stundenlabels (alle 4h) -->
        <div></div>
        <div v-for="h in HOURS" :key="'h' + h" class="text-[10px] text-slate-500 text-center leading-4">
          {{ h % 4 === 0 ? h : '' }}
        </div>
        <!-- Wochentag-Zeilen -->
        <template v-for="(row, d) in matrix" :key="'d' + d">
          <div class="text-xs text-slate-400 pr-2 flex items-center justify-end">{{ WD[d] }}</div>
          <div
            v-for="(v, h) in row"
            :key="'c' + d + '-' + h"
            class="h-[15px] rounded-[2px] cursor-default"
            :style="cellStyle(v)"
            @mouseenter="hover = { d, h, v }"
            @mouseleave="hover = null"
          ></div>
        </template>
      </div>
    </div>
    <div class="flex items-center gap-3 mt-2">
      <span class="text-xs text-slate-400">{{ caption }}</span>
      <div class="ml-auto flex items-center gap-1 text-[10px] text-slate-500">
        <span>wenig</span>
        <span
          class="inline-block h-2 w-24 rounded"
          style="background: linear-gradient(90deg, rgba(255,205,0,0.14), rgba(255,205,0,1))"
        ></span>
        <span>viel ({{ max }})</span>
      </div>
    </div>
    <p class="sr-only">Gesamt {{ total }}</p>
  </div>
</template>
