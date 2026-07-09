import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImageCache } from './image-cache';

function freshCache(): ImageCache {
  return new ImageCache(mkdtempSync(join(tmpdir(), 'imgcache-')));
}

const realFetch = globalThis.fetch;

/** Ersetzt global.fetch durch einen Stub, der einen Zähler mitführt. */
function stubFetch(impl: (url: string) => { ok: boolean; status?: number; body?: Buffer }) {
  let calls = 0;
  globalThis.fetch = (async (input: string) => {
    calls++;
    const r = impl(String(input));
    if (!r.ok) return { ok: false, status: r.status ?? 500 } as Response;
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        r.body!.buffer.slice(r.body!.byteOffset, r.body!.byteOffset + r.body!.byteLength),
    } as Response;
  }) as typeof fetch;
  return () => calls;
}

describe('ImageCache', () => {
  let cache: ImageCache;
  beforeEach(() => {
    cache = freshCache();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test('getBuffer lädt und cached; zweiter Aufruf trifft die Platte (kein Fetch)', async () => {
    const png = Buffer.from('fake-png-bytes');
    const calls = stubFetch(() => ({ ok: true, body: png }));

    const first = await cache.getBuffer('https://example.com/a.png');
    assert.deepEqual(first, png);
    assert.equal(calls(), 1);

    const second = await cache.getBuffer('https://example.com/a.png');
    assert.deepEqual(second, png);
    assert.equal(calls(), 1); // aus dem Cache, kein weiterer Fetch
  });

  test('getBuffer liefert die zwischengespeicherte Kopie, wenn der Download offline scheitert', async () => {
    const png = Buffer.from('cached');
    stubFetch(() => ({ ok: true, body: png }));
    await cache.getBuffer('https://example.com/b.png'); // warmlaufen

    // Jetzt "offline": jeder Fetch wirft.
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const offline = await cache.getBuffer('https://example.com/b.png');
    assert.deepEqual(offline, png);
  });

  test('getBuffer wirft, wenn weder Cache noch Netzwerk verfügbar sind', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    await assert.rejects(() => cache.getBuffer('https://example.com/missing.png'));
  });

  test('getBuffer reicht data:-/Nicht-URL-Eingaben ohne Netzwerk durch', async () => {
    const calls = stubFetch(() => ({ ok: true, body: Buffer.from('x') }));
    const buf = await cache.getBuffer('data:image/png;base64,AAAA');
    assert.ok(buf.length > 0);
    assert.equal(calls(), 0);
  });

  test('warm frischt den Cache auf und dedupliziert URLs', async () => {
    let served = Buffer.from('v1');
    const calls = stubFetch(() => ({ ok: true, body: served }));

    await cache.warm(['https://example.com/c.png', 'https://example.com/c.png', 'skip-me']);
    assert.equal(calls(), 1); // dedupliziert, Nicht-URL ignoriert

    served = Buffer.from('v2-updated');
    await cache.warm(['https://example.com/c.png']);

    // getBuffer liefert nun die aufgefrischte Version aus dem Cache.
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    const buf = await cache.getBuffer('https://example.com/c.png');
    assert.deepEqual(buf, Buffer.from('v2-updated'));
  });

  test('warm scheitert nicht, wenn einzelne Downloads fehlschlagen', async () => {
    stubFetch(() => ({ ok: false, status: 404 }));
    await assert.doesNotReject(() => cache.warm(['https://example.com/nope.png']));
  });
});
