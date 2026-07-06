<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { isConfigured } from './lib/supabase';
</script>

<template>
  <div class="min-h-screen">
    <header
      class="sticky top-0 z-10 flex items-center gap-6 px-6 py-3 bg-brand-panel border-b border-brand-border"
    >
      <span class="font-bold tracking-wide">🖨️ Printable</span>
      <nav class="flex gap-4 text-sm">
        <RouterLink
          to="/"
          class="text-slate-400 hover:text-slate-100"
          active-class="!text-slate-100"
          exact-active-class="!text-slate-100"
        >
          Boxen
        </RouterLink>
        <RouterLink
          to="/generator"
          class="text-slate-400 hover:text-slate-100"
          active-class="!text-slate-100"
        >
          Neue Box
        </RouterLink>
        <RouterLink
          to="/bon-editor"
          class="text-slate-400 hover:text-slate-100"
          active-class="!text-slate-100"
        >
          Bon-Editor
        </RouterLink>
      </nav>
      <span v-if="!isConfigured()" class="ml-auto text-xs text-amber-300">
        Nicht verbunden – Zugangsdaten unter „Boxen"
      </span>
    </header>

    <main class="max-w-5xl mx-auto p-6">
      <RouterView />
    </main>
  </div>
</template>
