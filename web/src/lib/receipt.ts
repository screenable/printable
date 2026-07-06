// Bon-Vorschau (80mm Thermodruck-Simulation).
// Layout-treu (Font A, 42 Zeichen), nicht byte-genau der ESC/POS-Encoder – der
// Pi rendert dieselbe Element-Liste mit dem echten Encoder.
import type { ReceiptElement } from './types';

const CHARS_PER_LINE = 42;

interface Line {
  kind: 'text' | 'gap' | 'rule' | 'cut' | 'qr' | 'barcode' | 'image';
  text?: string;
  align?: string;
  sizeW?: number;
  sizeH?: number;
  bold?: boolean;
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
      case 'qrcode': lines.push({ kind: 'qr', text: fill(String(e.value ?? '')) }); break;
      case 'barcode': lines.push({ kind: 'barcode', text: fill(String(e.value ?? '')) }); break;
      case 'image': lines.push({ kind: 'image' }); break;
      case 'cut': lines.push({ kind: 'cut' }); break;
      default: break;
    }
  }

  const heights = lines.map(l => {
    if (l.kind === 'qr') return 120;
    if (l.kind === 'barcode') return 60;
    if (l.kind === 'image') return 90;
    if (l.kind === 'gap' || l.kind === 'rule' || l.kind === 'cut') return lineH;
    return lineH * (l.sizeH || 1);
  });
  const totalH = heights.reduce((a, b) => a + b, 0) + padX * 2;

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  canvas.style.width = width + 'px';
  canvas.style.height = totalH + 'px';
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
    if (l.kind === 'qr' || l.kind === 'barcode' || l.kind === 'image') {
      const w = l.kind === 'qr' ? 96 : l.kind === 'barcode' ? 200 : 160;
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
