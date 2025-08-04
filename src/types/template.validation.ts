import { z } from 'zod';

const AlignElementSchema = z.object({
  type: z.literal('align'),
  value: z.enum(['CT', 'LT', 'RT']),
});

export const ControlElementSchema = z.object({
  type: z.literal('control'),
  value: z.enum(['LF', 'FF', 'CR', 'HT', 'VT']),
});

export const DrawLineSchema = z.object({
  type: z.literal('draw_line'),
});

export const StyleElementSchema = z.object({
  type: z.literal('style'),
  style: z.enum(['NORMAL', 'B', 'U', 'I']),
});

export const CharSpacingSchema = z.object({
  type: z.literal('char_spacing'),
  value: z.number().int().min(0),
});

export const LineSpacingSchema = z.object({
  type: z.literal('line_spacing'),
  value: z.number().int().min(0),
});

export const FontElementSchema = z.object({
  type: z.literal('font'),
  value: z.enum(['A', 'B']),
});

export const TextElementSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
  size: z.optional(
    z.tuple([z.union([z.literal(1), z.literal(2)]), z.union([z.literal(1), z.literal(2)])]),
  ), // nur 1 oder 2 erlaubt
  align: z.optional(z.enum(['CT', 'LT', 'RT'])),
  font: z.optional(z.enum(['A', 'B'])),
  bold: z.optional(z.boolean()),
});

export const ImageElementSchema = z.object({
  type: z.literal('image'),
  path: z.string(),
  density: z.optional(z.string()), // z.B. 's8', 'd8'
  align: z.optional(z.enum(['CT', 'LT', 'RT'])),
});
export const BarcodeOptionsSchema = z.object({
  width: z.number().int().min(1).max(5).default(1),
  height: z.number().int().min(1).max(255).default(100),
  includeParity: z.boolean().default(true),
  position: z.enum(['OFF', 'ABV', 'BLW', 'BTH']).default('BLW'),
  font: z.enum(['A', 'B']).default('A'),
});
export const BarcodeElementSchema = z.object({
  type: z.literal('barcode'),
  code: z.string(),
  barcodeType: z.enum(['UPC_A', 'UPC_E', 'EAN13', 'EAN8', 'CODE39', 'ITF', 'NW7']),
  options: z.optional(BarcodeOptionsSchema),
});
export const QRCodeElementSchema = z.object({
  type: z.literal('qrcode'),
  content: z.string(),
  // kein size hier, wenn du Größe brauchst: QR als Bild vor-rendern und als image drucken
});

export const CutElementSchema = z.object({
  type: z.literal('cut'),
  mode: z.optional(z.enum(['full', 'partial'])),
});
export const FeedElementSchema = z.object({
  type: z.literal('feed'),
  lines: z.optional(z.number().int().min(1)), // Anzahl Zeilen vorwärts, Default später im Renderer z.B. 1
});

export const TemplateElementSchema = z.union([
  AlignElementSchema,
  TextElementSchema,
  ImageElementSchema,
  BarcodeElementSchema,
  QRCodeElementSchema,
  CutElementSchema,
  FeedElementSchema,
  FontElementSchema,
  StyleElementSchema,
  CharSpacingSchema,
  LineSpacingSchema,
  ControlElementSchema,
  DrawLineSchema,
]);

export const FilledTemplateSchema = z.object({
  elements: z.array(TemplateElementSchema),
});

export type AlignElement = z.infer<typeof AlignElementSchema>;
export type TextElement = z.infer<typeof TextElementSchema>;
export type ImageElement = z.infer<typeof ImageElementSchema>;
export type BarcodeElement = z.infer<typeof BarcodeElementSchema>;
export type QRCodeElement = z.infer<typeof QRCodeElementSchema>;
export type CutElement = z.infer<typeof CutElementSchema>;
export type TemplateElement = z.infer<typeof TemplateElementSchema>;
export type FilledTemplate = z.infer<typeof FilledTemplateSchema>;
export type BarcodeOptions = z.infer<typeof BarcodeOptionsSchema>;
export type FeedElement = z.infer<typeof FeedElementSchema>;
export type FontElement = z.infer<typeof FontElementSchema>;
export type StyleElement = z.infer<typeof StyleElementSchema>;
export type CharSpacing = z.infer<typeof CharSpacingSchema>;
export type LineSpacing = z.infer<typeof LineSpacingSchema>;
export type ControlElement = z.infer<typeof ControlElementSchema>;
export type DrawLine = z.infer<typeof DrawLineSchema>;
