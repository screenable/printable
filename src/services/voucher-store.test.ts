import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VoucherStore } from './voucher-store';

function freshStore(): VoucherStore {
  return new VoucherStore(mkdtempSync(join(tmpdir(), 'vouchers-')));
}

describe('VoucherStore – Bestand', () => {
  let store: VoucherStore;
  beforeEach(() => {
    store = freshStore();
  });

  test('loadBatch adds codes and dedupes by code', () => {
    assert.equal(store.loadBatch('cat', ['A', 'B', 'C']), 3);
    assert.equal(store.loadBatch('cat', ['C', 'D']), 1); // C already present
    assert.equal(store.remaining('cat'), 4);
  });

  test('claimNext pops an unclaimed code and reduces remaining', () => {
    store.loadBatch('cat', ['A', 'B']);
    const code = store.claimNext('cat');
    assert.ok(code === 'A' || code === 'B');
    assert.equal(store.remaining('cat'), 1);
  });

  test('claimNext returns null when the pool is empty', () => {
    assert.equal(store.claimNext('empty'), null);
  });

  test('remaining is per-category', () => {
    store.loadBatch('a', ['1', '2']);
    store.loadBatch('b', ['3']);
    assert.equal(store.remaining('a'), 2);
    assert.equal(store.remaining('b'), 1);
  });

  test('claimed codes appear in the outbox until marked synced', () => {
    store.loadBatch('cat', ['A']);
    const code = store.claimNext('cat')!;
    assert.equal(store.unsyncedClaims().length, 1);
    store.markSynced([code]);
    assert.equal(store.unsyncedClaims().length, 0);
  });
});

describe('VoucherStore – Tageslimit', () => {
  test('todayCount increments per template', () => {
    const store = freshStore();
    assert.equal(store.todayCount('t50'), 0);
    store.incrementToday('t50');
    store.incrementToday('t50');
    assert.equal(store.todayCount('t50'), 2);
    assert.equal(store.todayCount('t25'), 0);
  });
});
