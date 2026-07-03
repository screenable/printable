// src/plugins/dispense.plugin.ts
//
// Der neue, komplett lokale Knopfdruck-Ablauf (ersetzt webhook.plugin):
//
//   Knopf → Template lokal wählen (Gewichte/Cooldowns/Limits aus Cache)
//         → Reward: static = Code aus Template / unique = Code aus lokalem Pool
//           (Pool leer / Limit erreicht → Trost-Fallback)
//         → Template lokal füllen ({{code}}, {{price}}, {{date}} …)
//         → lokalen Druckauftrag in die Queue legen
//
// Kein Internet nötig. Supabase wird nur noch zum Nachladen von Config/Codes und
// zum Hochladen der Historie benutzt (siehe sync-service).
import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { fillTemplate, type FillData } from '../helpers/template-filler';
import { jobStore, selector, templateRegistry, voucherStore, configService } from '../app-context';
import type { RuntimeTemplate } from '../types/dispense.types';

export default fp(async fastify => {
  // Prüft, ob ein Template gerade ausgegeben werden darf (Bestand + Tageslimit).
  const isAvailable = (t: RuntimeTemplate): boolean => {
    if (t.dailyLimit && t.dailyLimit > 0 && voucherStore.todayCount(t.name) >= t.dailyLimit) {
      return false;
    }
    if (t.rewardType === 'unique') {
      const category = t.voucherCategory;
      if (!category) return false;
      if (voucherStore.remaining(category) <= 0) return false;
    }
    return true;
  };

  let lastAt = 0;

  const onPress = async () => {
    const now = Date.now();
    const cooldown = configService.get().dispense.cooldownMs;
    if (now - lastAt < cooldown) {
      fastify.log.debug('Button press ignored - global cooldown active');
      return;
    }
    lastAt = now;

    // 1) Lokale, gewichtete Auswahl mit Bestand/Tageslimit als Filter.
    let template = selector.selectTemplate({
      available: t => isAvailable(t as RuntimeTemplate),
    }) as RuntimeTemplate | null;

    // Kein Template verfügbar (alles auf Cooldown / leer) → Trost-Fallback.
    if (!template) {
      template = templateRegistry.fallback() ?? null;
      if (!template) {
        fastify.log.warn('No template available and no fallback configured');
        return;
      }
    }

    // 2) Code besorgen – rein lokal.
    let code: string | undefined;
    if (template.rewardType === 'unique' && template.voucherCategory) {
      const claimed = voucherStore.claimNext(template.voucherCategory);
      if (!claimed) {
        // Pool zwischen Auswahl und Claim leer geworden → Trost-Fallback.
        const fb = templateRegistry.fallback();
        if (fb) {
          fastify.log.info({ category: template.voucherCategory }, 'Pool empty - using fallback');
          template = fb;
        }
      } else {
        code = claimed;
      }
    } else if (template.rewardType === 'static') {
      code = template.staticCode;
    }

    // 3) Tageszähler hochzählen (Tempolimit).
    voucherStore.incrementToday(template.name);

    // 4) Layout holen + lokal füllen.
    const layout = templateRegistry.layoutFor(template.name);
    if (!layout) {
      fastify.log.error({ template: template.name }, 'No layout for selected template');
      return;
    }

    const data: FillData = {
      code,
      ...(template.data as Record<string, string | number>),
    };

    try {
      const filled = fillTemplate(layout, data);
      const job = jobStore.enqueue({ templateName: template.name, filledTemplate: filled, code });
      fastify.log.info(
        { jobId: job.id, template: template.name, hasCode: Boolean(code) },
        'Print job enqueued locally',
      );
    } catch (err) {
      fastify.log.error({ err, template: template.name }, 'Failed to fill/enqueue template');
    }
  };

  bus.on('button.press', onPress);

  fastify.addHook('onClose', (_i, done) => {
    bus.off('button.press', onPress);
    done();
  });

  fastify.log.info({ templates: templateRegistry.all().length }, 'Dispense plugin initialized (offline-first)');
});
