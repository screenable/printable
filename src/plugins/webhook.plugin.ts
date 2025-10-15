// src/plugins/webhook.plugin.ts
import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { CONFIG } from '../config';
import { VoucherHelper } from '../helpers/voucher-helper';
import { config } from 'dotenv';

type VoucherCase = {
  price: string;
  category: string;
};

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

  const COOLDOWN = CONFIG.WEBHOOK_COOLDOWN_MS;
  let lastAt = 0;

  const CASES: VoucherCase[] = [
    { price: 'Peanuts', category: '6001' },
    { price: 'Tortellini', category: '6002' },
    { price: 'Gitterchips', category: '6004' },
  ];

  const pickCase = (): VoucherCase => {
    const i = Math.floor(Math.random() * CASES.length);
    return CASES[i];
  };

  const onPress = async () => {
    const now = Date.now();
    if (now - lastAt < COOLDOWN) return;
    lastAt = now;

    const requestBody = {
      template_name: 'edeka-voucher',
      data: {
        price: 'Fehler',
        code: 'Fehler',
      },
    };

    try {
      const chosen = pickCase();

      if (!voucherHelper) {
        fastify.log.error('VoucherHelper nicht verfügbar – sende Fehlerpayload');
      } else {
        try {
          const voucherCode = await voucherHelper.getVoucherCode(chosen.category);
          if (!voucherCode) throw new Error('Kein VoucherCode erhalten');

          requestBody.data.price = chosen.price;
          requestBody.data.code = voucherCode;

          fastify.log.info(
            { voucherCode, category: chosen.category, price: chosen.price },
            'Voucher code fetched',
          );
        } catch (innerErr) {
          fastify.log.error({ err: innerErr, category: chosen.category }, 'VoucherHelper Fehler');
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        fastify.log.error({ status: res.status, text, requestBody }, 'Webhook POST fehlgeschlagen');
      } else {
        fastify.log.info({ requestBody }, 'Webhook POST erfolgreich');
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
