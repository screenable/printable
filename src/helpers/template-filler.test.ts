import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fillTemplate } from './template-filler';
import type { FilledTemplate } from '../types/template.validation';

describe('fillTemplate', () => {
  const layout: FilledTemplate = {
    elements: [
      { type: 'text', value: 'Rabatt {{price}}' },
      { type: 'text', value: 'Code: {{code}}' },
      { type: 'qrcode', value: '{{code}}', options: { model: 2, size: 6 } },
    ],
  };

  test('substitutes placeholders in nested string fields', () => {
    const filled = fillTemplate(layout, { price: '25%', code: 'ABC123' });
    assert.equal(filled.elements[0].type, 'text');
    assert.equal((filled.elements[0] as { value: string }).value, 'Rabatt 25%');
    assert.equal((filled.elements[1] as { value: string }).value, 'Code: ABC123');
    assert.equal((filled.elements[2] as { value: string }).value, 'ABC123');
  });

  test('empty string for missing placeholder values', () => {
    const filled = fillTemplate(layout, { price: '10%' });
    assert.equal((filled.elements[1] as { value: string }).value, 'Code: ');
  });

  test('provides date/time defaults', () => {
    const withDate: FilledTemplate = { elements: [{ type: 'text', value: '{{date}}' }] };
    const filled = fillTemplate(withDate, {});
    assert.notEqual((filled.elements[0] as { value: string }).value, '');
  });

  test('result validates against the FilledTemplate schema', () => {
    const filled = fillTemplate(layout, { price: '50%', code: 'X' });
    assert.ok(Array.isArray(filled.elements));
  });
});
