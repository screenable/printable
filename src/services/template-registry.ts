// src/services/template-registry.ts
//
// Hält die aktuell aktiven Laufzeit-Templates (Auswahl-Parameter + Bon-Layout)
// und wird beim Boot mit den Defaults geseedet, später vom sync-service aus
// Supabase aktualisiert. Persistiert die zuletzt bekannten Templates lokal,
// damit die Box nach einem Neustart auch offline dieselbe Konfiguration hat.
import { join } from 'node:path';
import { CONFIG } from '../config';
import { DEFAULT_TEMPLATES } from '../config/default-templates';
import { JsonStore } from '../lib/json-store';
import type { RuntimeTemplate } from '../types/dispense.types';
import type { FilledTemplate } from '../types/template.validation';

export class TemplateRegistry {
  private store: JsonStore<{ templates: RuntimeTemplate[] }>;
  private templates: RuntimeTemplate[];

  constructor(dataDir: string = CONFIG.DATA_DIR) {
    this.store = new JsonStore(join(dataDir, 'templates.json'), { templates: DEFAULT_TEMPLATES });
    const cached = this.store.get().templates;
    this.templates = cached.length > 0 ? cached : DEFAULT_TEMPLATES;
  }

  /** Alle aktiven Templates (auch als WebhookTemplate[] für den Selector nutzbar). */
  all(): RuntimeTemplate[] {
    return this.templates;
  }

  /** Ersetzt die Templates (nach Sync) und persistiert sie. */
  replace(templates: RuntimeTemplate[]): void {
    if (templates.length === 0) return; // nie leeren – Offline-Fallback behalten
    this.templates = templates;
    this.store.set({ templates });
  }

  /** Bon-Layout (mit Platzhaltern) zu einem Template-Namen. */
  layoutFor(name: string): FilledTemplate | undefined {
    return this.templates.find(t => t.name === name)?.layout;
  }

  /** Das als Fallback markierte Template (Trost), falls vorhanden. */
  fallback(): RuntimeTemplate | undefined {
    return this.templates.find(t => t.isFallback) ?? this.templates.find(t => t.rewardType === 'none');
  }
}
