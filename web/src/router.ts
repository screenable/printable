import { createRouter, createWebHashHistory } from 'vue-router';
import DevicesView from './views/DevicesView.vue';
import GeneratorView from './views/GeneratorView.vue';
import DeviceView from './views/DeviceView.vue';
import BonEditorView from './views/BonEditorView.vue';

export const router = createRouter({
  // Hash-History: läuft auf jedem statischen Host ohne Rewrite-Regeln.
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'devices', component: DevicesView },
    { path: '/generator', name: 'generator', component: GeneratorView },
    { path: '/device/:id', name: 'device', component: DeviceView, props: true },
    { path: '/bon-editor', name: 'bon-editor', component: BonEditorView },
  ],
});
