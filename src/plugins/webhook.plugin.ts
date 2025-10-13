// src/plugins/webhook.plugin.ts
import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { CONFIG } from '../config';
import { VoucherHelper } from '../helpers/voucher-helper';

export default fp(async fastify => {
  const url = CONFIG.WEBHOOK_URL;
  if (!url) {
    fastify.log.warn('WEBHOOK_URL nicht gesetzt – Webhook-Plugin deaktiviert.');
    return;
  }

  // Initialize VoucherHelper if API key is configured
  let voucherHelper: VoucherHelper | null = null;
  if (CONFIG.VOUCHER_API_KEY) {
    voucherHelper = new VoucherHelper(CONFIG.VOUCHER_API_BASE_URL, CONFIG.VOUCHER_API_KEY);
    fastify.log.info('VoucherHelper initialized');
  } else {
    fastify.log.warn('VOUCHER_API_KEY nicht gesetzt – VoucherHelper deaktiviert.');
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
      } else {
        // Use VoucherHelper if available, otherwise generate random code
        let code: string;
        
        if (voucherHelper) {
          // Fetch voucher code from API for category '5001' (example category)
          const voucherCode = await voucherHelper.getVoucherCode('5001');
          code = voucherCode || (Math.random() + 1).toString(36).substring(7).toUpperCase();
          fastify.log.info({ voucherCode, category: '5001' }, 'Voucher code fetched');
        } else {
          // Fallback to random code generation
          code = (Math.random() + 1).toString(36).substring(7).toUpperCase();
        }
        
        requestBody = {
          template_name: 'edeka-demo-2',
          data: {
            code: code
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