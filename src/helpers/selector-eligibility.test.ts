import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { TemplateSelector } from './template-selector';
import type { WebhookTemplate } from '../types/webhook-template.types';

const templates: WebhookTemplate[] = [
  { name: 'expensive', probability: 100, cooldownSeconds: 0, data: {} },
  { name: 'trost', probability: 1, cooldownSeconds: 0, data: {}, isFallback: true },
];

describe('TemplateSelector – availability gate', () => {
  test('excludes a template when available() returns false', () => {
    const selector = new TemplateSelector(templates);
    // "expensive" has 100x the weight but is gated out -> only "trost" remains.
    for (let i = 0; i < 50; i++) {
      const picked = selector.selectTemplate({ available: t => t.name !== 'expensive' });
      assert.equal(picked?.name, 'trost');
    }
  });

  test('returns null when everything is gated out', () => {
    const selector = new TemplateSelector(templates);
    const picked = selector.selectTemplate({ available: () => false });
    assert.equal(picked, null);
  });

  test('without a gate it can still pick the weighted template', () => {
    const selector = new TemplateSelector(templates);
    const picked = selector.selectTemplate();
    assert.ok(picked?.name === 'expensive' || picked?.name === 'trost');
  });

  test('setTemplates replaces the active list', () => {
    const selector = new TemplateSelector([]);
    assert.equal(selector.selectTemplate(), null);
    selector.setTemplates(templates);
    assert.ok(selector.selectTemplate() !== null);
  });
});
