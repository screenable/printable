// src/services/image-cache.ts
//
// Offline-Cache für Bon-Bilder. Bild-Elemente referenzieren nur eine URL
// (`{ type: 'image', input: 'https://…' }`). Ohne Cache würde der print-worker
// das Bild bei JEDEM Druck frisch laden – ist die Box offline, fällt das Bild
// dann still aus dem Bon. Dieser Cache legt heruntergeladene Bilder atomar auf
// die Platte (DATA_DIR/image-cache/<sha256(url)>) und macht sie so dauerhaft
// offline verfügbar.
//
// Zusammenspiel:
//   - sync-service ruft `warm(urls)` beim Template-Sync auf -> Cache wird
//     aufgefrischt, solange die Box online ist.
//   - print-worker ruft `getBuffer(url)` zur Druckzeit auf -> liefert die
//     lokale Kopie (offline-fest); fehlt sie, wird einmalig nachgeladen.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG } from '../config';

const FETCH_TIMEOUT_MS = 8000;

/** Nur echte http(s)-URLs werden gecacht; data:-URIs u. Ä. gehen unverändert durch. */
function isCacheableUrl(input: unknown): input is string {
  return typeof input === 'string' && /^https?:\/\//i.test(input);
}

/**
 * `loadImage` (node-canvas) akzeptiert URL-Strings, data:-URIs, Dateipfade und
 * Buffer. `getBuffer` liefert daher eine Vereinigung: für gecachte http-Bilder
 * einen Buffer, für alles andere die unveränderte Eingabe.
 */
export type ImageSource = Buffer | string;

export class ImageCache {
  private readonly dir: string;
  private ensured = false;

  constructor(dataDir: string = CONFIG.DATA_DIR) {
    this.dir = join(dataDir, 'image-cache');
  }

  /**
   * Legt das Cache-Verzeichnis bei Bedarf an – bewusst NICHT im Konstruktor.
   * `imageCache` wird beim Modul-Import (app-context) erzeugt, also lange bevor
   * `main()` überhaupt läuft. Ein synchroner `mkdirSync`-Wurf im Konstruktor
   * würde dort den GESAMTEN Boot abbrechen – die Box druckt dann gar nichts
   * mehr. Deshalb lazy: erst kurz vor dem ersten Schreiben.
   */
  private ensureDir(): void {
    if (this.ensured) return;
    mkdirSync(this.dir, { recursive: true });
    this.ensured = true;
  }

  private pathFor(url: string): string {
    return join(this.dir, createHash('sha256').update(url).digest('hex'));
  }

  private has(url: string): boolean {
    return existsSync(this.pathFor(url));
  }

  private read(url: string): Buffer {
    return readFileSync(this.pathFor(url));
  }

  private write(url: string, data: Buffer): void {
    this.ensureDir();
    const target = this.pathFor(url);
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, data);
    renameSync(tmp, target);
  }

  private async fetch(url: string): Promise<Buffer> {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Liefert die Bildquelle – bevorzugt aus dem lokalen Cache (offline-fest).
   * Fehlt die Kopie, wird sie einmalig geladen und persistiert. Schlägt der
   * Download fehl, aber eine (evtl. veraltete) Kopie liegt vor, wird diese
   * zurückgegeben. Erst wenn beides fehlt, wirft die Methode.
   *
   * Nicht-cachebare Eingaben (data:-URI, Dateipfad o. Ä.) werden UNVERÄNDERT
   * als String durchgereicht – `loadImage` versteht sie direkt. Sie dürfen
   * NICHT durch `Buffer.from()` laufen: das würde z. B. eine data:-URI in die
   * ASCII-Bytes des URI-Strings verwandeln statt das Bild zu dekodieren, und
   * das Bild verschwände still aus dem Bon.
   */
  async getBuffer(input: unknown): Promise<ImageSource> {
    if (!isCacheableUrl(input)) {
      if (typeof input === 'string') return input;
      throw new Error('Unbekannte Bild-Eingabe (kein URL-String)');
    }
    if (this.has(input)) return this.read(input);
    try {
      const data = await this.fetch(input);
      this.write(input, data);
      return data;
    } catch (err) {
      if (this.has(input)) return this.read(input); // Race: parallel gefüllt.
      throw err;
    }
  }

  /**
   * Lädt die angegebenen URLs neu und aktualisiert den Cache (best-effort).
   * Wird beim Template-Sync aufgerufen, damit der Cache online frisch bleibt
   * und alle referenzierten Bilder vor dem nächsten Offline-Druck vorliegen.
   * Fehler pro URL werden verschluckt – der Sync darf daran nicht scheitern.
   */
  async warm(inputs: Iterable<unknown>): Promise<void> {
    const urls = new Set<string>();
    for (const i of inputs) if (isCacheableUrl(i)) urls.add(i);
    await Promise.all(
      [...urls].map(async url => {
        try {
          this.write(url, await this.fetch(url));
        } catch {
          /* offline / 404 -> vorhandene Kopie (falls da) bleibt gültig */
        }
      }),
    );
  }
}
