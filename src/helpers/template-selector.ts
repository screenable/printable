// src/helpers/template-selector.ts
import type { WebhookTemplate, TemplateUsageTracker } from '../types/webhook-template.types';

/**
 * Handles template selection with probability-based weighting and cooldown management
 */
export class TemplateSelector {
  private usageTracker: TemplateUsageTracker = {};

  constructor(private templates: WebhookTemplate[]) {}

  /** Ersetzt die Template-Liste (z.B. nach einem Sync aus Supabase). */
  setTemplates(templates: WebhookTemplate[]): void {
    this.templates = templates;
  }

  /** Aktuelle Template-Liste. */
  getTemplates(): WebhookTemplate[] {
    return this.templates;
  }

  /**
   * Selects a template based on weighted probabilities and constraints.
   *
   * Eligibility filter (KONZEPT.md 5.3):
   *  1. not on cooldown
   *  2. (optional) `available(template)` returns true — used to enforce
   *     local stock (Bestandslimit) and daily limits (Tempolimit)
   *
   * When a tier drops out, its weight vanishes and the remaining weights are
   * renormalised automatically, so the probabilities self-adjust.
   *
   * @param opts.available Optional predicate to gate a template on live state
   *   (e.g. remaining voucher stock > 0, daily limit not reached).
   * @returns Selected template or null if no eligible templates
   */
  selectTemplate(opts?: { available?: (template: WebhookTemplate) => boolean }): WebhookTemplate | null {
    const now = Date.now();

    const notOnCooldown = (template: WebhookTemplate): boolean => {
      if (template.cooldownSeconds === 0) return true;
      const lastUsed = this.usageTracker[template.name];
      if (!lastUsed) return true;
      return now - lastUsed >= template.cooldownSeconds * 1000;
    };

    // Filter templates that are not on cooldown and pass the availability gate.
    const eligibleTemplates = this.templates.filter(template => {
      if (!notOnCooldown(template)) return false;
      if (opts?.available && !opts.available(template)) return false;
      return true;
    });

    if (eligibleTemplates.length === 0) {
      return null; // No eligible templates
    }

    // Calculate total weight of eligible templates
    const totalWeight = eligibleTemplates.reduce(
      (sum, template) => sum + template.probability,
      0
    );

    if (totalWeight === 0) {
      return null; // No valid weights
    }

    // Generate random number between 0 and totalWeight
    let random = Math.random() * totalWeight;

    // Select template based on weighted probability
    for (const template of eligibleTemplates) {
      random -= template.probability;
      if (random <= 0) {
        // Mark template as used
        this.usageTracker[template.name] = now;
        return template;
      }
    }

    // Fallback to last eligible template (shouldn't normally reach here)
    const selected = eligibleTemplates[eligibleTemplates.length - 1];
    this.usageTracker[selected.name] = now;
    return selected;
  }

  /**
   * Resets usage tracker for a specific template or all templates
   * @param templateName Optional template name to reset
   */
  resetCooldown(templateName?: string): void {
    if (templateName) {
      delete this.usageTracker[templateName];
    } else {
      this.usageTracker = {};
    }
  }

  /**
   * Gets the remaining cooldown time for a template in seconds
   * @param templateName Template name
   * @returns Remaining cooldown in seconds, 0 if not on cooldown
   */
  getRemainingCooldown(templateName: string): number {
    const template = this.templates.find(t => t.name === templateName);
    if (!template || template.cooldownSeconds === 0) {
      return 0;
    }

    const lastUsed = this.usageTracker[templateName];
    if (!lastUsed) {
      return 0;
    }

    const now = Date.now();
    const cooldownMs = template.cooldownSeconds * 1000;
    const timeSinceLastUse = now - lastUsed;
    const remainingMs = cooldownMs - timeSinceLastUse;

    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  }
}
