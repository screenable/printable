// Bon-Vorschau (80mm Thermodruck-Simulation).
// Layout-treu (Font A, 48 Zeichen), nicht byte-genau der ESC/POS-Encoder – der
// Pi rendert dieselbe Element-Liste mit dem echten Encoder.
import type { ReceiptElement } from './types';
import { RECEIPT_MAX_WIDTH } from './receipt-image';

// 80-mm-Papier, TM-m30III Font A (12x24 Dots): 576 / 12 = 48 Zeichen pro Zeile.
// Muss der `columns`-Angabe des echten Encoders (epson-tm-m30iii) entsprechen,
// damit die Vorschau genauso umbricht wie der Druck.
const CHARS_PER_LINE = 48;

interface Line {
  kind: 'text' | 'gap' | 'rule' | 'cut' | 'qr' | 'barcode' | 'image';
  text?: string;
  align?: string;
  sizeW?: number;
  sizeH?: number;
  bold?: boolean;
  src?: string;
  imgW?: number;
  imgH?: number;
  qrSize?: number;
}

// Geladene Bilder je URL zwischenspeichern, damit die Vorschau beim erneuten
// Zeichnen sofort rendert. 'loading'/'error' steuern Platzhalter.
const imageCache = new Map<string, HTMLImageElement | 'loading' | 'error'>();

function getImage(src: string, onReady: () => void): HTMLImageElement | 'loading' | 'error' {
  const cached = imageCache.get(src);
  if (cached) return cached;
  imageCache.set(src, 'loading');
  const img = new Image();
  // Kein crossOrigin: die Vorschau zeichnet nur (liest keine Pixel), so laden
  // auch Bildserver ohne CORS-Header statt fälschlich als „nicht ladbar“.
  img.onload = () => {
    imageCache.set(src, img);
    onReady();
  };
  img.onerror = () => {
    imageCache.set(src, 'error');
    onReady();
  };
  img.src = src;
  return 'loading';
}

function loadPreviewImage(src: string): Promise<void> {
  if (!src) return Promise.resolve();
  const cached = imageCache.get(src);
  if (cached instanceof HTMLImageElement || cached === 'error' || cached === 'loading') {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    imageCache.set(src, 'loading');
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve();
    };
    img.onerror = () => {
      imageCache.set(src, 'error');
      resolve();
    };
    img.src = src;
  });
}

/**
 * Lädt alle referenzierten Bild-URLs vor, damit die synchrone `renderReceipt`
 * sie sofort zeichnen kann. Vor jedem Zeichnen aus der View aufrufen.
 */
export async function preloadImages(elements: ReceiptElement[]): Promise<void> {
  const urls = elements
    .filter(e => e.type === 'image' && typeof e.input === 'string' && e.input)
    .map(e => e.input as string);
  await Promise.all(urls.map(loadPreviewImage));
}

export function renderReceipt(
  canvas: HTMLCanvasElement,
  elements: ReceiptElement[],
  sample: Record<string, string> = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scale = 2;
  const charW = 12;
  const lineH = 26;
  const padX = 16;
  const width = CHARS_PER_LINE * charW + padX * 2;

  let align = 'left';
  let sizeW = 1;
  let sizeH = 1;
  let bold = false;

  const data: Record<string, string> = {
    code: 'ABCD-1234',
    redeem_url: 'https://app.screenable.io/r/ABCD-1234',
    price: '25%',
    date: '03.07.2026',
    time: '14:20',
    ...sample,
  };
  const fill = (s: string) => String(s).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => data[k] ?? '');

  const lines: Line[] = [];
  for (const e of elements) {
    switch (e.type) {
      case 'align': align = String(e.value); break;
      case 'size': sizeW = Number(e.width) || 1; sizeH = Number(e.height) || 1; break;
      case 'width': sizeW = Number(e.width) || 1; break;
      case 'height': sizeH = Number(e.height) || 1; break;
      case 'bold': bold = e.value !== false; break;
      case 'text':
      case 'line':
        lines.push({ kind: 'text', text: fill(String(e.value ?? '')), align, sizeW, sizeH, bold });
        break;
      case 'newline':
        for (let i = 0; i < (e.count ?? 1); i++) lines.push({ kind: 'gap' });
        break;
      case 'rule': lines.push({ kind: 'rule' }); break;
      case 'qrcode': lines.push({ kind: 'qr', text: fill(String(e.value ?? '')), qrSize: Number((e.options as { size?: number } | undefined)?.size) || 6 }); break;
      case 'barcode': lines.push({ kind: 'barcode', text: fill(String(e.value ?? '')) }); break;
      case 'image':
        lines.push({
          kind: 'image',
          src: e.input ? fill(String(e.input)) : undefined,
          imgW: Number(e.width) || undefined,
          imgH: Number(e.height) || undefined,
        });
        break;
      case 'cut': lines.push({ kind: 'cut' }); break;
      default: break;
    }
  }

  const redraw = () => renderReceipt(canvas, elements, sample);
  const contentW = width - padX * 2;
  // Vorschau-Pixel pro Drucker-Dot: die volle Bonbreite (576 Dots) füllt die
  // Inhaltsbreite der Vorschau.
  const dotToPx = contentW / RECEIPT_MAX_WIDTH;
  const imageDisplaySize = (l: Line): { w: number; h: number } => {
    const img = l.src ? getImage(l.src, redraw) : 'error';
    // Maße aus dem Element (Drucker-Dots) in Vorschau-Pixel; nie breiter als Inhalt.
    const w = Math.min(contentW, (l.imgW || RECEIPT_MAX_WIDTH) * dotToPx);
    const aspect =
      img instanceof HTMLImageElement && img.naturalWidth
        ? img.naturalHeight / img.naturalWidth
        : l.imgW
          ? (l.imgH || 0) / l.imgW
          : 0.4;
    let h = w * aspect;
    if (!h) h = 90;
    return { w, h };
  };

  // QR-Vorschau als Quadrat, dessen Kantenlänge mit der eingestellten Größe
  // (1–8) wächst – gibt ein Gefühl fürs Druckbild (size 6 ≈ 120 px).
  const qrSide = (l: Line) => Math.min(8, Math.max(1, l.qrSize || 6)) * 16 + 24;

  const heights = lines.map(l => {
    if (l.kind === 'qr') return qrSide(l);
    if (l.kind === 'barcode') return 60;
    if (l.kind === 'image') return imageDisplaySize(l).h + 12;
    if (l.kind === 'gap' || l.kind === 'rule' || l.kind === 'cut') return lineH;
    return lineH * (l.sizeH || 1);
  });
  const totalH = heights.reduce((a, b) => a + b, 0) + padX * 2;

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  canvas.style.width = width + 'px';
  // Höhe proportional lassen: bei schmalem Panel begrenzt `max-w-full` die
  // Breite; mit fixer Pixel-Höhe würde die Vorschau sonst horizontal gestaucht.
  canvas.style.height = 'auto';
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, totalH);
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';

  let y = padX;
  lines.forEach((l, i) => {
    const h = heights[i];
    if (l.kind === 'gap') { y += h; return; }
    if (l.kind === 'rule') {
      ctx.strokeStyle = '#111';
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(padX, y + h / 2);
      ctx.lineTo(width - padX, y + h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      y += h;
      return;
    }
    if (l.kind === 'cut') {
      ctx.strokeStyle = '#bbb';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y + h / 2);
      ctx.lineTo(width, y + h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#999';
      ctx.font = '12px system-ui';
      ctx.fillText('✂', padX, y + 4);
      ctx.fillStyle = '#111';
      y += h;
      return;
    }
    if (l.kind === 'image') {
      const { w, h: ih } = imageDisplaySize(l);
      const x = (width - w) / 2;
      const img = l.src ? imageCache.get(l.src) : 'error';
      if (img instanceof HTMLImageElement) {
        ctx.drawImage(img, x, y + 6, w, ih);
      } else {
        // Platzhalter, solange das Bild lädt oder die URL nicht erreichbar ist.
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(x, y + 6, w, ih);
        ctx.strokeStyle = '#bbb';
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 0.5, y + 6.5, w - 1, ih - 1);
        ctx.setLineDash([]);
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px system-ui';
        ctx.fillText(img === 'error' ? 'Bild nicht ladbar' : 'Bild lädt …', x + 8, y + ih / 2);
        ctx.fillStyle = '#111';
      }
      y += h;
      return;
    }
    if (l.kind === 'qr' || l.kind === 'barcode') {
      // QR quadratisch (Kantenlänge = Zeilenhöhe), Barcode breit/flach.
      const w = l.kind === 'qr' ? h - 12 : 200;
      const bh = h - 12;
      const x = (width - w) / 2;
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y + 6, w, bh);
      ctx.fillStyle = '#fff';
      ctx.font = '10px system-ui';
      ctx.fillText(l.kind.toUpperCase() + (l.text ? ' ' + l.text : ''), x + 6, y + 10);
      ctx.fillStyle = '#111';
      y += h;
      return;
    }
    // text
    const fontPx = 16 * (l.sizeH || 1);
    ctx.font = `${l.bold ? '700' : '400'} ${fontPx}px ui-monospace, monospace`;
    const glyphW = charW * (l.sizeW || 1);
    const textW = (l.text?.length ?? 0) * glyphW;
    let x = padX;
    if (l.align === 'center') x = (width - textW) / 2;
    else if (l.align === 'right') x = width - padX - textW;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(l.sizeW || 1, 1);
    ctx.fillText(l.text ?? '', 0, 0);
    ctx.restore();
    y += h;
  });
}
