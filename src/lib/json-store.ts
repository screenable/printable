// src/lib/json-store.ts
//
// Minimaler, abhängigkeitsfreier Persistenz-Layer für den Offline-Betrieb.
// Ein JsonStore hält genau eine JSON-Datei (Dokument) und schreibt sie atomar
// (temp-Datei + rename), sodass ein Stromausfall keine halb geschriebene Datei
// hinterlässt. Für die kleinen Datenmengen dieses Systems (einige Dutzend
// Gutscheine, eine kurze Job-Queue) ist das völlig ausreichend.
//
// Upgrade-Pfad: Bei sehr hohem Durchsatz kann dieser Store 1:1 gegen SQLite
// (better-sqlite3 / node:sqlite) getauscht werden – die aufrufenden Services
// kennen nur das Interface, nicht die Implementierung.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class JsonStore<T> {
  private cache: T;

  constructor(
    private readonly filePath: string,
    private readonly defaultValue: T,
  ) {
    mkdirSync(dirname(filePath), { recursive: true });
    if (existsSync(filePath)) {
      try {
        this.cache = JSON.parse(readFileSync(filePath, 'utf-8')) as T;
      } catch {
        // Beschädigte Datei -> mit Default neu starten (Daten sind nicht
        // geschäftskritisch, Gutscheine werden ohnehin online re-synchronisiert).
        this.cache = structuredClone(defaultValue);
        this.flush();
      }
    } else {
      this.cache = structuredClone(defaultValue);
      this.flush();
    }
  }

  /** Aktueller Zustand (Referenz – nicht direkt mutieren, `update` nutzen). */
  get(): T {
    return this.cache;
  }

  /** Ersetzt den Zustand vollständig und persistiert atomar. */
  set(value: T): void {
    this.cache = value;
    this.flush();
  }

  /** Transaktions-artiges Update: Reducer bekommt den aktuellen Zustand. */
  update<R>(fn: (state: T) => R): R {
    const result = fn(this.cache);
    this.flush();
    return result;
  }

  private flush(): void {
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.cache, null, 2));
    renameSync(tmp, this.filePath);
  }
}
