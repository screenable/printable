import { describe, expect, it } from 'vitest';
import type { ReceiptElement } from './types';
import {
  type Block,
  compile,
  decompile,
  SIZES,
  sizeKeyFrom,
  type TextBlock,
} from './receipt-blocks';

const text = (over: Partial<TextBlock> = {}): TextBlock => ({
  kind: 'text',
  text: 'x',
  align: 'left',
  size: 'normal',
  bold: false,
  italic: false,
  underline: false,
  ...over,
});

describe('sizeKeyFrom', () => {
  it('ordnet width/height der nächsten Stufe zu', () => {
    expect(sizeKeyFrom(1, 1)).toBe('normal');
    expect(sizeKeyFrom(2, 2)).toBe('gross');
    expect(sizeKeyFrom(3, 3)).toBe('riesig');
    // krumme Größen -> größte Achse entscheidet
    expect(sizeKeyFrom(2, 1)).toBe('gross');
    expect(sizeKeyFrom(1, 4)).toBe('riesig');
    // Default bei fehlenden Werten
    expect(sizeKeyFrom(undefined, undefined)).toBe('normal');
  });
});

describe('compile', () => {
  it('emittiert Zustands-Umschalter nur bei Änderung', () => {
    const els = compile([
      text({ text: 'A', align: 'center', bold: true }),
      text({ text: 'B', align: 'center', bold: true }), // gleicher Zustand
      text({ text: 'C', align: 'left', bold: false }), // Zustand ändert sich
    ]);
    const types = els.map(e => e.type);
    // align+bold einmal am Anfang, dann erst bei C wieder zurückgesetzt
    expect(types.filter(t => t === 'align')).toHaveLength(2);
    expect(types.filter(t => t === 'bold')).toHaveLength(2);
    expect(types.filter(t => t === 'line')).toHaveLength(3);
  });

  it('bildet Text-Block als eine Zeile ab (line, kein Extra-Umbruch)', () => {
    const els = compile([text({ text: 'Hallo' })]);
    expect(els).toEqual([{ type: 'line', value: 'Hallo' }]);
  });

  it('setzt die richtige Größe', () => {
    const els = compile([text({ text: 'H', size: 'gross' })]);
    expect(els).toContainEqual({ type: 'size', width: SIZES.gross.width, height: SIZES.gross.height });
  });

  it('übernimmt Leerzeilen, Linie, QR, Barcode, Bild und Schnitt', () => {
    const blocks: Block[] = [
      { kind: 'space', count: 2 },
      { kind: 'rule', style: 'double' },
      { kind: 'qrcode', value: '{{redeem_url}}', align: 'center' },
      { kind: 'barcode', value: '{{code}}', symbology: 'ean13', height: 60, align: 'center' },
      { kind: 'image', input: 'https://x/y.png', width: 576, height: 320, align: 'center' },
      { kind: 'cut', value: 'full' },
    ];
    const els = compile(blocks);
    expect(els).toContainEqual({ type: 'newline', count: 2 });
    expect(els).toContainEqual({ type: 'rule', style: 'double' });
    expect(els).toContainEqual({
      type: 'qrcode',
      value: '{{redeem_url}}',
      options: { model: 2, size: 6, errorlevel: 'm' },
    });
    expect(els).toContainEqual({ type: 'barcode', value: '{{code}}', symbology: 'ean13', height: 60 });
    expect(els).toContainEqual({ type: 'image', input: 'https://x/y.png', width: 576, height: 320 });
    expect(els).toContainEqual({ type: 'cut', value: 'full' });
  });
});

describe('decompile', () => {
  it('liest zustandsbehaftete Formatierung an die Blöcke an', () => {
    const els: ReceiptElement[] = [
      { type: 'align', value: 'center' },
      { type: 'size', width: 2, height: 2 },
      { type: 'bold', value: true },
      { type: 'line', value: 'Titel' },
      { type: 'bold', value: false },
      { type: 'line', value: 'Untertitel' },
    ];
    const blocks = decompile(els) as TextBlock[];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: 'text', text: 'Titel', align: 'center', size: 'gross', bold: true });
    expect(blocks[1]).toMatchObject({ kind: 'text', text: 'Untertitel', align: 'center', size: 'gross', bold: false });
  });

  it('verrechnet den Zeilenumbruch nach einem text-Element (altes Format)', () => {
    // "text" bricht selbst nicht um -> das folgende newline(1) ist SEIN Umbruch.
    const els: ReceiptElement[] = [
      { type: 'text', value: 'A' },
      { type: 'newline', count: 1 },
      { type: 'text', value: 'B' },
      { type: 'newline', count: 2 }, // 1 Umbruch für B + 1 echte Leerzeile
    ];
    const blocks = decompile(els);
    expect(blocks.map(b => b.kind)).toEqual(['text', 'text', 'space']);
    expect(blocks[2]).toEqual({ kind: 'space', count: 1 });
  });

  it('behandelt line als selbst-umbrechend (newline danach = volle Leerzeilen)', () => {
    const els: ReceiptElement[] = [
      { type: 'line', value: 'A' },
      { type: 'newline', count: 2 },
    ];
    const blocks = decompile(els);
    expect(blocks).toEqual([
      { kind: 'text', text: 'A', align: 'left', size: 'normal', bold: false, italic: false, underline: false },
      { kind: 'space', count: 2 },
    ]);
  });
});

describe('round-trip', () => {
  it('compile ∘ decompile ist idempotent (kein Verrutschen beim Wiederspeichern)', () => {
    const legacy: ReceiptElement[] = [
      { type: 'align', value: 'center' },
      { type: 'size', width: 2, height: 2 },
      { type: 'bold', value: true },
      { type: 'text', value: 'EDEKA Frische' },
      { type: 'newline', count: 1 },
      { type: 'size', width: 1, height: 1 },
      { type: 'bold', value: false },
      { type: 'text', value: 'GUTSCHEIN' },
      { type: 'newline', count: 2 },
      { type: 'text', value: 'Code: {{code}}' },
      { type: 'newline', count: 1 },
      { type: 'qrcode', value: '{{redeem_url}}', options: { model: 2, size: 6, errorlevel: 'm' } },
      { type: 'newline', count: 1 },
      { type: 'cut', value: 'full' },
    ];
    const first = compile(decompile(legacy));
    const second = compile(decompile(first));
    // Nach der ersten Normalisierung bleibt das Ergebnis stabil.
    expect(second).toEqual(first);
  });

  it('erhält Formatierung eines frisch gebauten Templates über den Round-Trip', () => {
    const blocks: Block[] = [
      text({ text: 'EDEKA Frische', align: 'center', size: 'gross', bold: true }),
      text({ text: '{{price}} RABATT', align: 'center', size: 'gross', bold: true }),
      { kind: 'space', count: 1 },
      text({ text: 'Code: {{code}}', align: 'center' }),
      { kind: 'qrcode', value: '{{redeem_url}}', align: 'center' },
      { kind: 'cut', value: 'full' },
    ];
    expect(decompile(compile(blocks))).toEqual(blocks);
  });
});
