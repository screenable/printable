// src/helpers/template-selector.test.ts
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { TemplateSelector } from './template-selector';
import type { WebhookTemplate } from '../types/webhook-template.types';

describe('TemplateSelector', () => {
  let templates: WebhookTemplate[];
  let selector: TemplateSelector;

  beforeEach(() => {
    templates = [
      {
        name: 'template-a',
        probability: 70,
        cooldownSeconds: 0,
        data: { value: 'a' },
      },
      {
        name: 'template-b',
        probability: 30,
        cooldownSeconds: 0,
        data: { value: 'b' },
      },
      {
        name: 'template-c',
        probability: 10,
        cooldownSeconds: 2, // 2 seconds cooldown
        data: { value: 'c' },
      },
    ];
    selector = new TemplateSelector(templates);
  });

  it('should select a template based on probability', () => {
    const selected = selector.selectTemplate();
    assert.ok(selected !== null, 'Should select a template');
    assert.ok(
      templates.some(t => t.name === selected.name),
      'Selected template should be from the template list'
    );
  });

  it('should respect probability distribution over multiple selections', () => {
    const counts = new Map<string, number>();
    const iterations = 1000;

    // Run multiple selections to test distribution
    for (let i = 0; i < iterations; i++) {
      selector.resetCooldown(); // Reset for fair testing
      const selected = selector.selectTemplate();
      if (selected) {
        counts.set(selected.name, (counts.get(selected.name) || 0) + 1);
      }
    }

    // template-a should be selected more often than template-b
    const countA = counts.get('template-a') || 0;
    const countB = counts.get('template-b') || 0;
    assert.ok(countA > countB, 'Template A (70%) should be selected more often than B (30%)');
  });

  it('should enforce cooldown period', async () => {
    const templateWithCooldown = templates.find(t => t.name === 'template-c');
    assert.ok(templateWithCooldown !== undefined);

    // Create selector with only the cooldown template
    const cooldownSelector = new TemplateSelector([templateWithCooldown]);

    // First selection should succeed
    const first = cooldownSelector.selectTemplate();
    assert.ok(first !== null, 'First selection should succeed');
    assert.equal(first.name, 'template-c');

    // Immediate second selection should fail due to cooldown
    const second = cooldownSelector.selectTemplate();
    assert.equal(second, null, 'Second immediate selection should fail due to cooldown');

    // Wait for cooldown to expire
    await new Promise(resolve => setTimeout(resolve, 2100)); // 2.1 seconds

    // Third selection should succeed after cooldown
    const third = cooldownSelector.selectTemplate();
    assert.ok(third !== null, 'Selection should succeed after cooldown expires');
    assert.equal(third.name, 'template-c');
  });

  it('should filter out templates on cooldown and select from remaining', async () => {
    // Force selection of template-c
    const cooldownTemplate = templates.find(t => t.name === 'template-c');
    assert.ok(cooldownTemplate !== undefined);
    const selectorSingle = new TemplateSelector([cooldownTemplate]);
    selectorSingle.selectTemplate(); // Use template-c

    // Now use full selector - template-c should be filtered out
    const selected = selector.selectTemplate();
    assert.ok(selected !== null);
    assert.notEqual(selected.name, 'template-c', 'Should not select template on cooldown');
  });

  it('should return null when no templates are eligible', () => {
    const cooldownOnlyTemplates: WebhookTemplate[] = [
      {
        name: 'template-x',
        probability: 50,
        cooldownSeconds: 10,
        data: {},
      },
    ];
    const cooldownSelector = new TemplateSelector(cooldownOnlyTemplates);

    // First selection succeeds
    const first = cooldownSelector.selectTemplate();
    assert.ok(first !== null);

    // Second selection should return null (on cooldown)
    const second = cooldownSelector.selectTemplate();
    assert.equal(second, null, 'Should return null when all templates are on cooldown');
  });

  it('should reset cooldown for specific template', () => {
    const cooldownTemplate = templates.find(t => t.name === 'template-c');
    assert.ok(cooldownTemplate !== undefined);
    const selectorSingle = new TemplateSelector([cooldownTemplate]);

    // Use the template
    selectorSingle.selectTemplate();

    // Should be on cooldown
    let selected = selectorSingle.selectTemplate();
    assert.equal(selected, null, 'Should be on cooldown');

    // Reset cooldown
    selectorSingle.resetCooldown('template-c');

    // Should be available again
    selected = selectorSingle.selectTemplate();
    assert.ok(selected !== null, 'Should be available after cooldown reset');
  });

  it('should calculate remaining cooldown time', async () => {
    const cooldownTemplate = templates.find(t => t.name === 'template-c');
    assert.ok(cooldownTemplate !== undefined);
    const selectorSingle = new TemplateSelector([cooldownTemplate]);

    // Initially no cooldown
    let remaining = selectorSingle.getRemainingCooldown('template-c');
    assert.equal(remaining, 0, 'Should have no cooldown initially');

    // Use the template
    selectorSingle.selectTemplate();

    // Should have remaining cooldown
    remaining = selectorSingle.getRemainingCooldown('template-c');
    assert.ok(remaining > 0, 'Should have remaining cooldown after use');
    assert.ok(remaining <= 2, 'Remaining cooldown should be at most 2 seconds');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Should have less remaining cooldown
    const remainingAfterWait = selectorSingle.getRemainingCooldown('template-c');
    assert.ok(remainingAfterWait < remaining, 'Remaining cooldown should decrease over time');
  });
});
