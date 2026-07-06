// src/services/job-store.ts
//
// Lokale, offline-fähige Druck-Queue. Ersetzt das direkte Pollen der
// Supabase-Tabelle `print_jobs` im heißen Pfad: Der Knopfdruck erzeugt einen
// lokalen Job, der print-worker verarbeitet ihn, und der sync-service lädt die
// Historie später nach Supabase hoch.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { CONFIG } from '../config';
import { JsonStore } from '../lib/json-store';
import type { FilledTemplate } from '../types/template.validation';
import type { LocalJob, LocalJobStatus } from '../types/dispense.types';

export class JobStore {
  private store: JsonStore<{ items: LocalJob[] }>;

  constructor(dataDir: string = CONFIG.DATA_DIR) {
    this.store = new JsonStore(join(dataDir, 'jobs.json'), { items: [] });
  }

  /** Legt einen neuen Druckauftrag an und gibt ihn zurück. */
  enqueue(input: { templateName: string; filledTemplate: FilledTemplate; code?: string }): LocalJob {
    const job: LocalJob = {
      id: randomUUID(),
      templateName: input.templateName,
      filledTemplate: input.filledTemplate,
      status: 'pending',
      createdAt: new Date().toISOString(),
      code: input.code,
      synced: false,
    };
    this.store.update(state => {
      state.items.push(job);
      return null;
    });
    return job;
  }

  /** Ältester wartender Job (FIFO) oder null. */
  nextPending(): LocalJob | null {
    return this.store.get().items.find(j => j.status === 'pending') ?? null;
  }

  /** Setzt den Status (und optional Fehlertext) eines Jobs. */
  setStatus(id: string, status: LocalJobStatus, error?: string): void {
    this.store.update(state => {
      const job = state.items.find(j => j.id === id);
      if (job) {
        job.status = status;
        if (error !== undefined) job.error = error;
      }
      return null;
    });
  }

  /** Abgeschlossene/fehlerhafte, noch nicht hochgeladene Jobs (Outbox). */
  unsynced(): LocalJob[] {
    return this.store
      .get()
      .items.filter(j => (j.status === 'done' || j.status === 'error') && !j.synced);
  }

  /**
   * Markiert Jobs als synchronisiert und entfernt fertige, hochgeladene Jobs,
   * damit die Datei nicht unbegrenzt wächst.
   */
  markSyncedAndPrune(ids: string[]): void {
    const set = new Set(ids);
    this.store.update(state => {
      for (const j of state.items) if (set.has(j.id)) j.synced = true;
      state.items = state.items.filter(j => !(j.status === 'done' && j.synced));
      return null;
    });
  }
}
