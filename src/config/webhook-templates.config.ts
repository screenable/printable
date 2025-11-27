// src/config/webhook-templates.config.ts
import type { WebhookTemplate } from '../types/webhook-template.types';

/**
 * Configuration for webhook templates
 *
 * Each template has:
 * - name: Template identifier
 * - probability: Weight for random selection (higher = more likely)
 * - cooldownSeconds: Minimum seconds between uses (0 = no cooldown)
 * - data: Template-specific data to send
 * - voucherCategory: (Optional) Category ID for voucher lookup
 */
export const WEBHOOK_TEMPLATES: WebhookTemplate[] = [
  {
    name: 'edeka-frisch-10',
    probability: 22,
    cooldownSeconds: 0,
    data: {
      price: '10%',
    },
  },
  {
    name: 'edeka-frisch-25',
    probability: 10,
    cooldownSeconds: 10,
    data: {
      price: '25%',
    },
  },
  {
    name: 'edeka-frisch-50',
    probability: 3,
    cooldownSeconds: 60,
    data: {
      price: '50%',
    },
  },
];

/**
 * Fallback template when no voucher is available
 */
export const NO_LUCK_TEMPLATE = {
  name: 'trost-wurst',
  data: {},
};
