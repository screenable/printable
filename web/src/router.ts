import { createRouter, createWebHashHistory } from 'vue-router';
import { isAuthenticated } from './lib/supabase';
import BonEditorView from './views/BonEditorView.vue';
import DeviceView from './views/DeviceView.vue';
import DevicesView from './views/DevicesView.vue';
import GeneratorView from './views/GeneratorView.vue';
import LoginView from './views/LoginView.vue';

export const router = createRouter({
  // Hash-History: läuft auf jedem statischen Host ohne Rewrite-Regeln.
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/', name: 'devices', component: DevicesView },
    { path: '/generator', name: 'generator', component: GeneratorView },
    { path: '/device/:id', name: 'device', component: DeviceView, props: true },
    { path: '/bon-editor', name: 'bon-editor', component: BonEditorView },
  ],
});

// Auth-Guard: alle Routen außer /login erfordern eine Session.
router.beforeEach((to) => {
  if (to.name === 'login') {
    return isAuthenticated() ? { path: '/' } : true;
  }
  if (!isAuthenticated()) {
    return { name: 'login', query: to.fullPath === '/' ? {} : { redirect: to.fullPath } };
  }
  return true;
});
