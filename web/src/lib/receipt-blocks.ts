// Block-Modell für den Bon-Editor.
//
// Der gespeicherte/gedruckte Bon ist eine flache Element-Liste, in der
// `align`, `size`, `bold` … *zustandsbehaftete* Umschalter sind (sie gelten für
// alles Folgende – wie ESC/POS-Modi). Das ist technisch und fehleranfällig zu
// bearbeiten.
//
// Der Editor arbeitet stattdessen mit **Blöcken**: Ein Text-Block trägt seine
// Formatierung (Ausrichtung, Größe, Fett/Kursiv/Unterstrichen) direkt an sich
// (WYSIWYG). `compile()` übersetzt Blöcke in die bestehende Element-Liste (das
// Datenmodell/der Pi bleiben unverändert), `decompile()` liest eine vorhandene
// Element-Liste zurück in Blöcke.
import type { ReceiptElement } from './types';
import { RECEIPT_MAX_WIDTH } from './receipt-image';

export type Align = 'left' | 'center' | 'right';
export type SizeKey = 'normal' | 'gross' | 'riesig';

/** Freundliche Größen -> ESC/POS width/height (Vielfaches der Grundgröße). */
export const SIZES: Record<SizeKey, { width: number; height: number }> = {
  normal: { width: 1, height: 1 },
  gross: { width: 2, height: 2 },
  riesig: { width: 3, height: 3 },
};

export const SIZE_LABEL: Record<SizeKey, string> = {
  normal: 'Normal',
  gross: 'Groß',
  riesig: 'Sehr groß',
};

export type TextBlock = {
  kind: 'text';
  text: string;
  align: Align;
  size: SizeKey;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};
export type SpaceBlock = { kind: 'space'; count: number };
export type RuleBlock = { kind: 'rule'; style: 'single' | 'double' | 'none' };
export type QrBlock = { kind: 'qrcode'; value: string; align: Align };
export type BarcodeBlock = { kind: 'barcode'; value: string; symbology: string; height: number; align: Align };
export type ImageBlock = { kind: 'image'; input: string; width: number; height: number; align: Align };
export type CutBlock = { kind: 'cut'; value: 'full' | 'partial' };

export type Block =
  | TextBlock
  | SpaceBlock
  | RuleBlock
  | QrBlock
  | BarcodeBlock
  | ImageBlock
  | CutBlock;

/** Ordnet konkrete width/height der nächstliegenden Größen-Stufe zu. */
export function sizeKeyFrom(width?: number | string, height?: number): SizeKey {
  const w = Number(width) || 1;
  const h = Number(height) || 1;
  const m = Math.max(w, h);
  if (m >= 3) return 'riesig';
  if (m >= 2) return 'gross';
  return 'normal';
}

/** Blöcke -> Element-Liste (das Format, das gespeichert und gedruckt wird). */
export function compile(blocks: Block[]): ReceiptElement[] {
  const els: ReceiptElement[] = [];
  // Aktueller Formatierungs-Zustand; Umschalter werden nur bei Änderung emittiert.
  let align: Align = 'left';
  let size: SizeKey = 'normal';
  let bold = false;
  let italic = false;
  let underline = false;

  const setAlign = (a: Align) => {
    if (a !== align) {
      align = a;
      els.push({ type: 'align', value: a });
    }
  };
  const setSize = (s: SizeKey) => {
    if (s !== size) {
      size = s;
      els.push({ type: 'size', width: SIZES[s].width, height: SIZES[s].height });
    }
  };
  const setBold = (b: boolean) => {
    if (b !== bold) {
      bold = b;
      els.push({ type: 'bold', value: b });
    }
  };
  const setItalic = (b: boolean) => {
    if (b !== italic) {
      italic = b;
      els.push({ type: 'italic', value: b });
    }
  };
  const setUnderline = (b: boolean) => {
    if (b !== underline) {
      underline = b;
      els.push({ type: 'underline', value: b });
    }
  };

  for (const b of blocks) {
    switch (b.kind) {
      case 'text':
        setAlign(b.align);
        setSize(b.size);
        setBold(b.bold);
        setItalic(b.italic);
        setUnderline(b.underline);
        // `line` druckt den Text und bricht die Zeile um -> ein Block = eine Zeile.
        els.push({ type: 'line', value: b.text });
        break;
      case 'space':
        els.push({ type: 'newline', count: Math.max(1, Math.round(b.count) || 1) });
        break;
      case 'rule':
        els.push({ type: 'rule', style: b.style });
        break;
      case 'qrcode':
        setAlign(b.align);
        els.push({ type: 'qrcode', value: b.value, options: { model: 2, size: 6, errorlevel: 'm' } });
        break;
      case 'barcode':
        setAlign(b.align);
        els.push({ type: 'barcode', value: b.value, symbology: b.symbology, height: b.height });
        break;
      case 'image':
        setAlign(b.align);
        els.push({ type: 'image', input: b.input, width: b.width, height: b.height });
        break;
      case 'cut':
        els.push({ type: 'cut', value: b.value });
        break;
    }
  }
  return els;
}

/** Element-Liste -> Blöcke (für den Editor). Kehrwert von compile(). */
export function decompile(elements: ReceiptElement[]): Block[] {
  const blocks: Block[] = [];
  let align: Align = 'left';
  let size: SizeKey = 'normal';
  let bold = false;
  let italic = false;
  let underline = false;
  // `text` bricht die Zeile NICHT selbst um; das folgende `newline` ist der
  // Umbruch dieser Zeile. `line` bricht selbst um. Damit ein späteres compile()
  // keine zusätzliche Leerzeile erzeugt, wird dieser eine Umbruch „verrechnet".
  let awaitingBreak = false;

  for (const el of elements) {
    switch (el.type) {
      case 'align':
        align = (el.value as Align) || 'left';
        break;
      case 'size':
        size = sizeKeyFrom(el.width, el.height);
        break;
      case 'width':
        size = sizeKeyFrom(el.width, SIZES[size].height);
        break;
      case 'height':
        size = sizeKeyFrom(SIZES[size].width, el.height);
        break;
      case 'bold':
        bold = el.value !== false;
        break;
      case 'italic':
        italic = el.value !== false;
        break;
      case 'underline':
        underline = el.value !== false;
        break;
      case 'font':
        break; // im Editor nicht abgebildet
      case 'text':
        blocks.push({ kind: 'text', text: String(el.value ?? ''), align, size, bold, italic, underline });
        awaitingBreak = true;
        break;
      case 'line':
        blocks.push({ kind: 'text', text: String(el.value ?? ''), align, size, bold, italic, underline });
        awaitingBreak = false;
        break;
      case 'newline': {
        let n = Number(el.count ?? 1);
        if (awaitingBreak) {
          n -= 1;
          awaitingBreak = false;
        }
        if (n > 0) blocks.push({ kind: 'space', count: n });
        break;
      }
      case 'rule':
        blocks.push({ kind: 'rule', style: (el.style as RuleBlock['style']) || 'single' });
        awaitingBreak = false;
        break;
      case 'qrcode':
        blocks.push({ kind: 'qrcode', value: String(el.value ?? ''), align });
        awaitingBreak = false;
        break;
      case 'barcode':
        blocks.push({
          kind: 'barcode',
          value: String(el.value ?? ''),
          symbology: String(el.symbology || 'ean13'),
          height: Number(el.height) || 60,
          align,
        });
        awaitingBreak = false;
        break;
      case 'image':
        blocks.push({
          kind: 'image',
          input: typeof el.input === 'string' ? el.input : '',
          width: Number(el.width) || RECEIPT_MAX_WIDTH,
          height: Number(el.height) || 0,
          align,
        });
        awaitingBreak = false;
        break;
      case 'cut':
        blocks.push({ kind: 'cut', value: (el.value as CutBlock['value']) || 'full' });
        awaitingBreak = false;
        break;
      default:
        break;
    }
  }
  return blocks;
}
