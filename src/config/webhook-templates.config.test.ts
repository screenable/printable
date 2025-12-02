// src/config/webhook-templates.config.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WEBHOOK_TEMPLATES, NO_LUCK_TEMPLATE } from './webhook-templates.config';
import { TemplateSelector } from '../helpers/template-selector';

describe('WEBHOOK_TEMPLATES Configuration', () => {
  it('should have exactly 2 templates with correct probabilities', () => {
    assert.equal(WEBHOOK_TEMPLATES.length, 2, 'Should have 2 templates');
    
    const directTemplate = WEBHOOK_TEMPLATES.find(t => !t.voucherCategory);
    const fallbackTriggerTemplate = WEBHOOK_TEMPLATES.find(t => t.voucherCategory);
    
    assert.ok(directTemplate, 'Should have a direct template without voucherCategory');
    assert.ok(fallbackTriggerTemplate, 'Should have a fallback trigger template with voucherCategory');
    
    assert.equal(directTemplate.probability, 22, 'Direct template should have 22% probability');
    assert.equal(fallbackTriggerTemplate.probability, 78, 'Fallback trigger should have 78% probability');
  });

  it('should select templates according to 22%/78% probability distribution', () => {
    const selector = new TemplateSelector(WEBHOOK_TEMPLATES);
    const counts = new Map<string, number>();
    const iterations = 10000;

    // Run multiple selections to test distribution
    // Note: Templates have cooldownSeconds: 0, so no cooldown management needed
    for (let i = 0; i < iterations; i++) {
      const selected = selector.selectTemplate();
      if (selected) {
        counts.set(selected.name, (counts.get(selected.name) || 0) + 1);
      }
    }

    // Calculate percentages
    const directCount = counts.get('edeka-frische-10') || 0;
    const fallbackTriggerCount = counts.get('edeka-fallback-trigger') || 0;
    
    const directPercentage = (directCount / iterations) * 100;
    const fallbackTriggerPercentage = (fallbackTriggerCount / iterations) * 100;

    // Allow 5% margin of error due to randomness
    assert.ok(
      Math.abs(directPercentage - 22) < 5,
      `Direct template should be selected ~22% of the time (got ${directPercentage.toFixed(2)}%)`
    );
    assert.ok(
      Math.abs(fallbackTriggerPercentage - 78) < 5,
      `Fallback trigger should be selected ~78% of the time (got ${fallbackTriggerPercentage.toFixed(2)}%)`
    );
  });

  it('should have NO_LUCK_TEMPLATE configured correctly', () => {
    assert.equal(NO_LUCK_TEMPLATE.name, 'trost-wurst', 'Fallback template should be trost-wurst');
    assert.ok(NO_LUCK_TEMPLATE.data, 'Fallback template should have data object');
  });

  it('direct template should not have voucherCategory', () => {
    const directTemplate = WEBHOOK_TEMPLATES.find(t => t.name === 'edeka-frische-10');
    assert.ok(directTemplate, 'Direct template should exist');
    assert.equal(directTemplate.voucherCategory, undefined, 'Direct template should not have voucherCategory');
  });

  it('fallback trigger template should have voucherCategory', () => {
    const fallbackTrigger = WEBHOOK_TEMPLATES.find(t => t.name === 'edeka-fallback-trigger');
    assert.ok(fallbackTrigger, 'Fallback trigger template should exist');
    assert.ok(fallbackTrigger.voucherCategory, 'Fallback trigger should have voucherCategory');
  });
});
