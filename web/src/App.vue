<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { auth, isAuthenticated, signOut } from './lib/supabase';

const route = useRoute();
const router = useRouter();

async function logout() {
  await signOut();
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="min-h-screen">
    <header
      v-if="route.name !== 'login'"
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
      <div v-if="isAuthenticated()" class="ml-auto flex items-center gap-3 text-sm">
        <span class="text-slate-400">{{ auth.user?.email }}</span>
        <button class="btn btn-ghost" @click="logout">Abmelden</button>
      </div>
    </header>

    <main class="max-w-5xl mx-auto p-6">
      <RouterView />
    </main>
  </div>
</template>
