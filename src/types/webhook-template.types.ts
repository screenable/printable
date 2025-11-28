// src/types/webhook-template.types.ts

/**
 * Represents a webhook template with its associated data and configuration
 */
export interface WebhookTemplate {
  /** Unique identifier for the template */
  name: string;
  
  /** Probability weight (e.g., 70 = 70% chance relative to total weights) */
  probability: number;
  
  /** Cooldown period in seconds (0 = no cooldown) */
  cooldownSeconds: number;
  
  /** Data to send with the webhook */
  data: Record<string, unknown>;
  
  /** Optional category for voucher lookup */
  voucherCategory?: string;
}

/**
 * Tracks the last time a template was used
 */
export interface TemplateUsageTracker {
  [templateName: string]: number; // timestamp in milliseconds
}

/**
 * Result of template selection
 */
export interface TemplateSelectionResult {
  template: WebhookTemplate;
  voucherCode?: string | null;
}
