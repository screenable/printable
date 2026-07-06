<script setup lang="ts">
import { ref } from 'vue';
import { getClient, settings } from '../lib/supabase';

const form = ref({
  id: '',
  name: '',
  location: '',
  printerHost: '192.168.100.200',
  printerPort: 9100,
  buttonPin: 17,
  buzzerLedPin: 5,
  npCount: 0,
  wledIp: '',
});
const msg = ref('');
const installCmd = ref('');

async function create() {
  const c = getClient();
  if (!c) {
    msg.value = 'Bitte zuerst unter „Boxen" verbinden.';
    return;
  }
  if (!form.value.id.trim()) {
    msg.value = 'Geräte-ID fehlt.';
    return;
  }
  const config = {
    printer: { host: form.value.printerHost.trim(), port: Number(form.value.printerPort), model: 'epson-tm-m30iii' },
    gpio: { buttonPin: Number(form.value.buttonPin), debounceMs: 10, buzzerLedPin: Number(form.value.buzzerLedPin) },
    neopixel: { count: Number(form.value.npCount), gpio: 18, brightness: 80 },
    led: { doneHoldMs: 2200, errorHoldMs: 3000, workingFallbackMs: 15000, wledIp: form.value.wledIp.trim() || undefined },
    dispense: { cooldownMs: 1000 },
  };
  const { error } = await c.from('devices').upsert({
    id: form.value.id.trim(),
    name: form.value.name.trim() || null,
    location: form.value.location.trim() || null,
    config,
  });
  if (error) {
    msg.value = 'Fehler: ' + error.message;
    return;
  }
  msg.value = 'Angelegt ✓';
  installCmd.value =
    `curl -fsSL https://raw.githubusercontent.com/screenable/printable/main/install.sh \\\n` +
    `  | sudo DEVICE_ID="${form.value.id.trim()}" \\\n` +
    `         SUPABASE_URL="${settings.url}" \\\n` +
    `         SUPABASE_KEY="<ANON_ODER_DEVICE_KEY>" bash`;
}

function copy() {
  navigator.clipboard.writeText(installCmd.value);
}
</script>

<template>
  <h1 class="text-2xl font-semibold mb-1">Neue Box anlegen</h1>
  <p class="text-slate-400 mb-5">
    Legt eine <code class="text-xs bg-[#0d0f14] px-1.5 py-0.5 rounded">devices</code>-Row an und
    erzeugt den fertigen Installations-Befehl für den Raspberry Pi.
  </p>

  <section class="panel mb-5">
    <div class="grid gap-3 sm:grid-cols-3">
      <div><label class="label">Geräte-ID</label><input v-model="form.id" class="input" placeholder="box-edeka-nord-01" /></div>
      <div><label class="label">Name</label><input v-model="form.name" class="input" placeholder="EDEKA Nord" /></div>
      <div><label class="label">Standort</label><input v-model="form.location" class="input" placeholder="Hamburg" /></div>
    </div>

    <h2 class="text-sm uppercase tracking-wide text-slate-400 mt-5 mb-2">Hardware</h2>
    <div class="grid gap-3 sm:grid-cols-3">
      <div><label class="label">Drucker-IP</label><input v-model="form.printerHost" class="input" /></div>
      <div><label class="label">Drucker-Port</label><input v-model.number="form.printerPort" type="number" class="input" /></div>
      <div><label class="label">Button GPIO</label><input v-model.number="form.buttonPin" type="number" class="input" /></div>
      <div><label class="label">Buzzer/LED GPIO</label><input v-model.number="form.buzzerLedPin" type="number" class="input" /></div>
      <div><label class="label">NeoPixel Anzahl</label><input v-model.number="form.npCount" type="number" class="input" /></div>
      <div><label class="label">WLED IP (optional)</label><input v-model="form.wledIp" class="input" placeholder="192.168.1.100" /></div>
    </div>

    <div class="flex items-center gap-3 mt-4">
      <button class="btn btn-primary" @click="create">Box anlegen</button>
      <span class="text-sm text-slate-400">{{ msg }}</span>
    </div>
  </section>

  <section v-if="installCmd" class="panel">
    <h2 class="text-sm uppercase tracking-wide text-slate-400 mb-2">Installation auf dem Raspberry Pi</h2>
    <pre class="bg-[#0d0f14] border border-brand-border rounded-lg p-3 overflow-x-auto text-xs whitespace-pre">{{ installCmd }}</pre>
    <button class="btn btn-ghost mt-3" @click="copy">Befehl kopieren</button>
  </section>
</template>
