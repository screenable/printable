import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { VoucherHelper } from './voucher-helper';

describe('VoucherHelper', () => {
  test('can be instantiated with baseURL and apiKey', () => {
    const helper = new VoucherHelper('https://api.example.com', 'test-key');
    assert.ok(helper);
  });

  test('getVoucherCode method exists and returns Promise', () => {
    const helper = new VoucherHelper('https://api.example.com', 'test-key');
    const result = helper.getVoucherCode('test-category');
    assert.ok(result instanceof Promise);
  });

  test('getVoucherCodes method exists and returns Promise', () => {
    const helper = new VoucherHelper('https://api.example.com', 'test-key');
    const result = helper.getVoucherCodes(['cat1', 'cat2']);
    assert.ok(result instanceof Promise);
  });
});
