// web/app.js — gemeinsame Logik für Generator / Config-Editor / Bon-Editor.
// Reines ES-Modul, kein Build-Schritt. Supabase-Zugang wird im Browser
// (localStorage) hinterlegt, damit die statische Seite überall gehostet werden
// kann (Netlify/Vercel/Supabase Storage).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LS_URL = 'printable.supabaseUrl';
const LS_KEY = 'printable.supabaseKey';

export function getSettings() {
  return {
    url: localStorage.getItem(LS_URL) || '',
    key: localStorage.getItem(LS_KEY) || '',
  };
}

export function saveSettings(url, key) {
  localStorage.setItem(LS_URL, url.trim());
  localStorage.setItem(LS_KEY, key.trim());
}

let _client = null;
export function client() {
  const { url, key } = getSettings();
  if (!url || !key) return null;
  if (!_client) _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export function requireClient() {
  const c = client();
  if (!c) {
    alert('Bitte zuerst Supabase-URL und Key unter „Verbindung" eintragen.');
    location.href = 'index.html';
    throw new Error('no supabase settings');
  }
  return c;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function param(name) {
  return new URLSearchParams(location.search).get(name);
}

// ─────────────────────────────────── Bon-Vorschau (80mm Thermodruck) ────────
// Simuliert das Druckbild aus der Element-Liste. Nicht byte-genau der
// ESC/POS-Encoder, aber layout-treu (42 Zeichen Font A) – ausreichend, um das
// Layout im Editor zu beurteilen.
const CHARS_PER_LINE = 42;

export function renderReceipt(canvas, elements, sample = {}) {
  const ctx = canvas.getContext('2d');
  const scale = 2; // Retina
  const charW = 12;
  const lineH = 26;
  const padX = 16;
  const width = CHARS_PER_LINE * charW + padX * 2;

  // Zustand
  let align = 'left';
  let sizeW = 1;
  let sizeH = 1;
  let bold = false;

  const data = { code: 'ABCD-1234', price: '25%', date: '03.07.2026', time: '14:20', ...sample };
  const fill = s => String(s).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (data[k] ?? ''));

  // Erst Höhe berechnen (zwei Durchläufe)
  const lines = [];
  const pushText = value => {
    const text = fill(value);
    lines.push({ kind: 'text', text, align, sizeW, sizeH, bold });
  };

  for (const e of elements) {
    switch (e.type) {
      case 'align': align = e.value; break;
      case 'size': sizeW = Number(e.width) || 1; sizeH = e.height ?? 1; break;
      case 'width': sizeW = e.width; break;
      case 'height': sizeH = e.height; break;
      case 'bold': bold = e.value !== false; break;
      case 'text': pushText(e.value); break;
      case 'line': lines.push({ kind: 'text', text: fill(e.value), align, sizeW, sizeH, bold }); break;
      case 'newline': for (let i = 0; i < (e.count ?? 1); i++) lines.push({ kind: 'gap' }); break;
      case 'rule': lines.push({ kind: 'rule' }); break;
      case 'qrcode': lines.push({ kind: 'qr', text: fill(e.value) }); break;
      case 'barcode': lines.push({ kind: 'barcode', text: fill(e.value) }); break;
      case 'image': lines.push({ kind: 'image' }); break;
      case 'cut': lines.push({ kind: 'cut' }); break;
      default: break;
    }
  }

  let y = padX;
  const heights = lines.map(l => {
    if (l.kind === 'qr') return 120;
    if (l.kind === 'barcode') return 60;
    if (l.kind === 'image') return 90;
    if (l.kind === 'gap') return lineH;
    if (l.kind === 'rule' || l.kind === 'cut') return lineH;
    return lineH * (l.sizeH || 1);
  });
  const totalH = heights.reduce((a, b) => a + b, 0) + padX * 2;

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  canvas.style.width = width + 'px';
  canvas.style.height = totalH + 'px';
  ctx.scale(scale, scale);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, totalH);
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'top';

  lines.forEach((l, i) => {
    const h = heights[i];
    if (l.kind === 'gap') { y += h; return; }
    if (l.kind === 'rule') {
      ctx.strokeStyle = '#111'; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(padX, y + h / 2); ctx.lineTo(width - padX, y + h / 2); ctx.stroke();
      ctx.setLineDash([]); y += h; return;
    }
    if (l.kind === 'cut') {
      ctx.strokeStyle = '#bbb'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, y + h / 2); ctx.lineTo(width, y + h / 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#999'; ctx.font = '12px system-ui'; ctx.fillText('✂ ' + '– '.repeat(4), padX, y + 2);
      ctx.fillStyle = '#111'; y += h; return;
    }
    if (l.kind === 'qr' || l.kind === 'barcode' || l.kind === 'image') {
      const w = l.kind === 'qr' ? 96 : l.kind === 'barcode' ? 200 : 160;
      const bh = h - 12;
      const x = (width - w) / 2;
      ctx.fillStyle = '#000'; ctx.fillRect(x, y + 6, w, bh);
      ctx.fillStyle = '#fff'; ctx.font = '10px system-ui';
      ctx.fillText(l.kind.toUpperCase() + (l.text ? ' ' + l.text : ''), x + 6, y + 10);
      ctx.fillStyle = '#111'; y += h; return;
    }
    // text
    const fontPx = 16 * (l.sizeH || 1);
    ctx.font = `${l.bold ? '700' : '400'} ${fontPx}px ui-monospace, monospace`;
    const glyphW = charW * (l.sizeW || 1);
    const textW = l.text.length * glyphW;
    let x = padX;
    if (l.align === 'center') x = (width - textW) / 2;
    else if (l.align === 'right') x = width - padX - textW;
    // grobes „monospace"-Rendering, damit Breite/Zentrierung stimmen
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(l.sizeW || 1, 1);
    ctx.fillText(l.text, 0, 0);
    ctx.restore();
    y += h;
  });
}
