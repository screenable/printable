// src/helpers/template-filler.ts
//
// Ersetzt Platzhalter der Form {{schlüssel}} in einem Bon-Layout durch echte
// Werte. Läuft komplett lokal auf dem Pi – der bisher externe WEBHOOK_URL-Dienst
// (der das „Füllen" übernahm) wird damit überflüssig und der Ablauf offline-fähig.
import { FilledTemplateSchema, type FilledTemplate } from '../types/template.validation';

export type FillData = Record<string, string | number | undefined | null>;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

function substitute(value: string, data: FillData): string {
  return value.replace(PLACEHOLDER, (_match, key: string) => {
    const v = data[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Rekursiv alle String-Felder eines Objekts/Arrays ersetzen. */
function deepFill<T>(node: T, data: FillData): T {
  if (typeof node === 'string') {
    return substitute(node, data) as unknown as T;
  }
  if (Array.isArray(node)) {
    return node.map(item => deepFill(item, data)) as unknown as T;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = deepFill(v, data);
    }
    return out as T;
  }
  return node;
}

/**
 * Füllt ein Bon-Layout mit Daten und validiert das Ergebnis gegen das
 * FilledTemplate-Schema (dasselbe, das der print-worker erwartet).
 */
export function fillTemplate(layout: FilledTemplate, data: FillData): FilledTemplate {
  const enriched: FillData = {
    date: new Date().toLocaleDateString('de-DE'),
    time: new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
    ...data,
  };
  const filled = deepFill(layout, enriched);
  return FilledTemplateSchema.parse(filled);
}
