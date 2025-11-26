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
    name: 'edeka-voucher-peanut',
    probability: 70,
    cooldownSeconds: 0,
    data: {
      price: 'Peanut & Choco',
    },
    voucherCategory: '6001',
  },
  {
    name: 'edeka-voucher-tortellini',
    probability: 40,
    cooldownSeconds: 0,
    data: {
      price: 'Tortellini',
    },
    voucherCategory: '6002',
  },
  {
    name: 'edeka-voucher-chips',
    probability: 10,
    cooldownSeconds: 90, // Only available if last press was more than 90 seconds ago
    data: {
      price: 'Gitter Chips',
    },
    voucherCategory: '6004',
  },
];

/**
 * Fallback template when no voucher is available
 */
export const NO_LUCK_TEMPLATE = {
  name: 'no-luck',
  data: {},
};
