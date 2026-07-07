import { createApp } from 'vue';
import App from './App.vue';
import { initAuth } from './lib/supabase';
import { router } from './router';
import './style.css';

// Zuerst eine evtl. gespeicherte Session laden, damit der Router-Guard beim
// ersten Navigieren schon weiß, ob der Nutzer angemeldet ist.
initAuth().finally(() => {
  createApp(App).use(router).mount('#app');
});
