// src/plugins/webhook.plugin.ts
import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { CONFIG } from '../config';

export default fp(async fastify => {
  const url = CONFIG.WEBHOOK_URL;
  if (!url) {
    fastify.log.warn('WEBHOOK_URL nicht gesetzt – Webhook-Plugin deaktiviert.');
    return;
  }

  // einfacher Schutz gegen Prellen/Doppelklicks zusätzlich zur GPIO-Seite
  const COOLDOWN = CONFIG.WEBHOOK_COOLDOWN_MS;
  let lastAt = 0;

  const onPress = async () => {

    const now = Date.now();
    if (now - lastAt < COOLDOWN) return;
    lastAt = now;

    try {
      const rnd = Math.random() < 0.5
      let requestBody = {}
      if(rnd){
        requestBody = {
        template_name: 'edeka-demo',
        data:{
          percent: Math.floor( Math.random()*10)
        }
      }
      }else{
 requestBody = {
        template_name: 'edeka-demo-2',
        data:{
          code: (Math.random() + 1).toString(36).substring(7).toUpperCase()
        }
      }
      }
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        fastify.log.error({ status: res.status, text }, 'Webhook POST fehlgeschlagen');
      } else {
        fastify.log.info('Webhook POST erfolgreich');
      }
    } catch (err) {
      fastify.log.error({ err }, 'Webhook POST Fehler');
    }
  };

  bus.on('button.press', onPress);

  fastify.addHook('onClose', (_i, done) => {
    bus.off('button.press', onPress);
    done();
  });
});