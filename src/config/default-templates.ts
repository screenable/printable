// src/config/default-templates.ts
//
// Eingebautes Default-Template-Set. Dient als Offline-Seed: Solange die Box noch
// nie `device_templates` aus Supabase geladen hat (erster Boot / kein Netz),
// funktioniert sie damit trotzdem. Sobald ein Sync erfolgt, überschreibt die
// Supabase-Konfiguration diese Werte.
import type { RuntimeTemplate } from '../types/dispense.types';
import type { FilledTemplate } from '../types/template.validation';

/**
 * Standard-Layout für einen Rabatt-Bon mit dynamischem Code (App-Gutschein):
 * der Code wird als Text gedruckt UND als QR mit der Einlöse-URL angehängt.
 * Die Einlöse-URL ist frei editierbar; `{{code}}` wird auch im QR-Wert ersetzt.
 */
function discountLayout(headline: string): FilledTemplate {
  return {
    elements: [
      { type: 'align', value: 'center' },
      { type: 'size', width: 2, height: 2 },
      { type: 'bold', value: true },
      { type: 'text', value: headline },
      { type: 'newline', count: 1 },
      { type: 'bold', value: false },
      { type: 'size', width: 1, height: 1 },
      { type: 'text', value: 'GUTSCHEIN' },
      { type: 'newline', count: 2 },
      { type: 'size', width: 2, height: 1 },
      { type: 'text', value: '{{price}} RABATT' },
      { type: 'newline', count: 2 },
      { type: 'size', width: 1, height: 1 },
      { type: 'text', value: 'Code: {{code}}' },
      { type: 'newline', count: 1 },
      // QR zeigt auf die Einlöse-URL der App (individueller, ablaufender Code).
      { type: 'qrcode', value: '{{redeem_url}}', options: { model: 2, size: 6, errorlevel: 'm' } },
      { type: 'newline', count: 1 },
      { type: 'text', value: 'In der App einlösen' },
      { type: 'newline', count: 2 },
      { type: 'text', value: '{{date}} {{time}}' },
      { type: 'newline', count: 3 },
      { type: 'cut', value: 'full' },
    ],
  };
}

/** Trost-Layout ohne Code. */
const trostLayout: FilledTemplate = {
  elements: [
    { type: 'align', value: 'center' },
    { type: 'size', width: 2, height: 2 },
    { type: 'bold', value: true },
    { type: 'text', value: 'Kein Gewinn' },
    { type: 'newline', count: 1 },
    { type: 'size', width: 1, height: 1 },
    { type: 'bold', value: false },
    { type: 'text', value: 'Heute leider kein Rabatt.' },
    { type: 'newline', count: 1 },
    { type: 'text', value: 'Probier es gleich nochmal!' },
    { type: 'newline', count: 2 },
    { type: 'text', value: '{{date}} {{time}}' },
    { type: 'newline', count: 3 },
    { type: 'cut', value: 'full' },
  ],
};

export const DEFAULT_TEMPLATES: RuntimeTemplate[] = [
  {
    name: 'edeka-frische-10',
    probability: 22,
    cooldownSeconds: 0,
    rewardType: 'unique',
    voucherCategory: 'edeka-frische-10',
    data: { price: '10%' },
    layout: discountLayout('EDEKA Frische'),
  },
  {
    name: 'edeka-frische-25',
    probability: 11,
    cooldownSeconds: 10,
    rewardType: 'unique',
    voucherCategory: 'edeka-frische-25',
    dailyLimit: 40,
    data: { price: '25%' },
    layout: discountLayout('EDEKA Frische'),
  },
  {
    name: 'edeka-frische-50',
    probability: 2,
    cooldownSeconds: 60,
    rewardType: 'unique',
    voucherCategory: 'edeka-frische-50',
    dailyLimit: 2,
    data: { price: '50%' },
    layout: discountLayout('EDEKA Frische'),
  },
  {
    name: 'trost-wurst',
    probability: 65,
    cooldownSeconds: 0,
    rewardType: 'none',
    isFallback: true,
    data: {},
    layout: trostLayout,
  },
];
