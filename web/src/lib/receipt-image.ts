// Bild-Optimierung für den Bon-Druck.
//
// Der TM-m30III druckt mit 203 dpi (8 Dots/mm). Bei 80-mm-Papier sind das
// 72 mm bedruckbare Breite = 576 Dots. Breiter bringt nichts (wird abgeschnitten)
// und kostet nur Bandbreite. ESC/POS-Raster verlangt zudem Breite/Höhe als
// Vielfaches von 8.
//
// Diese Funktion verkleinert ein hochgeladenes Bild auf höchstens `maxWidth`
// (Default 576), rundet die Maße auf ×8, legt es auf weißen Grund (Thermopapier
// ist weiß, Transparenz -> weiß) und wandelt es in Graustufen. Das eigentliche
// 1-bit-Dithering macht der Pi zur Druckzeit (Atkinson), darum hier bewusst
// Graustufen statt fertig gedithert – sonst würde doppelt gedithert.
export const RECEIPT_MAX_WIDTH = 576;

export interface OptimizedImage {
  blob: Blob;
  width: number;
  height: number;
}

/** Auf das nächstkleinere Vielfache von 8 runden (min. 8). */
function floorTo8(n: number): number {
  return Math.max(8, Math.floor(n / 8) * 8);
}

function loadFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht gelesen werden'));
    };
    img.src = url;
  });
}

export async function optimizeForReceipt(
  file: File,
  maxWidth = RECEIPT_MAX_WIDTH,
): Promise<OptimizedImage> {
  const img = await loadFile(file);
  if (!img.width || !img.height) throw new Error('Bild hat keine gültigen Maße');

  // Nur verkleinern, nie hochskalieren.
  const targetW = floorTo8(Math.min(img.width, maxWidth));
  const targetH = floorTo8(Math.round((targetW / img.width) * img.height));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');

  // Weißer Grund, damit Transparenz nicht als Schwarz gedruckt wird.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // In Graustufen umwandeln (Luminanz nach Rec. 601).
  const data = ctx.getImageData(0, 0, targetW, targetH);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = px[i + 1] = px[i + 2] = lum;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new Error('PNG konnte nicht erzeugt werden');
  return { blob, width: targetW, height: targetH };
}
