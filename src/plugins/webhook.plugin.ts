// src/plugins/webhook.plugin.ts
import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { CONFIG } from '../config';
import { VoucherHelper } from '../helpers/voucher-helper';
import { TemplateSelector } from '../helpers/template-selector';
import { WEBHOOK_TEMPLATES, NO_LUCK_TEMPLATE } from '../config/webhook-templates.config';

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

  // Initialize template selector with configured templates
  const templateSelector = new TemplateSelector(WEBHOOK_TEMPLATES);
  fastify.log.info({ templateCount: WEBHOOK_TEMPLATES.length }, 'TemplateSelector initialized');

  // Global cooldown to prevent button smashing
  const COOLDOWN = CONFIG.WEBHOOK_COOLDOWN_MS;
  let lastAt = 0;

  const onPress = async () => {
    const now = Date.now();
    
    // Check global cooldown
    if (now - lastAt < COOLDOWN) {
      fastify.log.debug('Button press ignored - global cooldown active');
      return;
    }
    lastAt = now;

    // Select template based on probabilities and per-template cooldowns
    const selectedTemplate = templateSelector.selectTemplate();
    
    if (!selectedTemplate) {
      fastify.log.warn('No eligible template available - all templates on cooldown');
      return;
    }

    fastify.log.info(
      { 
        templateName: selectedTemplate.name, 
        probability: selectedTemplate.probability,
        cooldown: selectedTemplate.cooldownSeconds 
      },
      'Template selected'
    );

    // Prepare request body with template data
    const requestBody: { template_name: string; data: Record<string, unknown> } = {
      template_name: selectedTemplate.name,
      data: { ...selectedTemplate.data },
    };

    try {
      // If template requires a voucher, fetch it
      if (selectedTemplate.voucherCategory && voucherHelper) {
        try {
          const voucherCode = await voucherHelper.getVoucherCode(selectedTemplate.voucherCategory);
          
          if (!voucherCode) {
            // No voucher available - use fallback template
            requestBody.template_name = NO_LUCK_TEMPLATE.name;
            requestBody.data = { ...NO_LUCK_TEMPLATE.data };
            
            fastify.log.info(
              { category: selectedTemplate.voucherCategory },
              'No voucher available - using fallback template'
            );
          } else {
            // Add voucher code to data
            requestBody.data.code = voucherCode;
            
            fastify.log.info(
              { 
                voucherCode, 
                category: selectedTemplate.voucherCategory, 
                templateName: selectedTemplate.name 
              },
              'Voucher code fetched successfully'
            );
          }
        } catch (innerErr) {
          fastify.log.error(
            { err: innerErr, category: selectedTemplate.voucherCategory },
            'VoucherHelper error - sending template without voucher'
          );
        }
      } else if (selectedTemplate.voucherCategory && !voucherHelper) {
        fastify.log.warn(
          { templateName: selectedTemplate.name },
          'Template requires voucher but VoucherHelper not available'
        );
      }

      // Send webhook request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          fastify.log.error(
            { status: res.status, text, requestBody },
            'Webhook POST failed'
          );
        } else {
          fastify.log.info({ requestBody }, 'Webhook POST successful');
        }
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw fetchErr;
      }
    } catch (err) {
      fastify.log.error({ err }, 'Webhook POST error');
    }
  };

  bus.on('button.press', onPress);

  fastify.addHook('onClose', (_i, done) => {
    bus.off('button.press', onPress);
    done();
  });
});
