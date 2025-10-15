import { z } from 'zod';

/* ----------------- Einzelbefehle ----------------- */

// 1. text(value: string)
export const TextSchema = z.object({
  type: z.literal('text'),
  value: z.string(),
});

// 2. newline(count?: number)
export const NewlineSchema = z.object({
  type: z.literal('newline'),
  count: z.number().int().min(1).optional(),
});

// 3. line(value: string)
export const LineSchema = z.object({
  type: z.literal('line'),
  value: z.string(),
});

// 4. underline(value?: boolean | number)
export const UnderlineSchema = z.object({
  type: z.literal('underline'),
  value: z.boolean().or(z.number().int()).optional(),
});

// 5. italic(value?: boolean)
export const ItalicSchema = z.object({
  type: z.literal('italic'),
  value: z.boolean().optional(),
});

// 6. bold(value?: boolean)
export const BoldSchema = z.object({
  type: z.literal('bold'),
  value: z.boolean().optional(),
});

// 7. invert(value?: boolean)
export const InvertSchema = z.object({
  type: z.literal('invert'),
  value: z.boolean().optional(),
});

// 8. width(width: number)
export const WidthSchema = z.object({
  type: z.literal('width'),
  width: z.number(),
});

// 9. height(height: number)
export const HeightSchema = z.object({
  type: z.literal('height'),
  height: z.number(),
});

// 10. size(width: number | string, height?: number)
export const SizeSchema = z.object({
  type: z.literal('size'),
  width: z.union([z.number(), z.string()]),
  height: z.number().optional(),
});

// 11. font(value: 'A' | 'B')
export const FontSchema = z.object({
  type: z.literal('font'),
  value: z.enum(['A', 'B']),
});

// 12. align(value: 'left' | 'center' | 'right')
export const AlignSchema = z.object({
  type: z.literal('align'),
  value: z.enum(['left', 'center', 'right']),
});

/* ----------------- Komplexe Befehle ----------------- */

// 13. table(columns, data)
const TableColumnSchema = z.object({
  width: z.number().optional(),
  marginLeft: z.number().optional(),
  marginRight: z.number().optional(),
  align: z.enum(['left', 'right']).optional(),
  verticalAlign: z.enum(['top', 'bottom']).optional(),
});
export const TableSchema = z.object({
  type: z.literal('table'),
  columns: z.array(TableColumnSchema),
  data: z.array(z.array(z.union([z.string(), z.any()]))),
});

// 14. rule(options?)
export const RuleSchema = z.object({
  type: z.literal('rule'),
  style: z.enum(['none', 'single', 'double']).optional(),
  width: z.number().optional(),
});

// 15. box(options, value)
export const BoxOptionsSchema = z.object({
  style: z.enum(['none', 'single', 'double']).optional(),
  width: z.number().optional(),
  marginLeft: z.number().optional(),
  marginRight: z.number().optional(),
  paddingLeft: z.number().optional(),
  paddingRight: z.number().optional(),
  align: z.enum(['left', 'right']),
});
export const BoxSchema = z.object({
  type: z.literal('box'),
  options: BoxOptionsSchema,
  value: z.union([z.string(), z.any()]),
});

// 16. barcode(value, symbology, height?)
export const BarcodeSchema = z.object({
  type: z.literal('barcode'),
  value: z.string(),
  symbology: z.enum(['upca', 'upce', 'ean13', 'ean8', 'coda39', 'itf', 'codabar']),
  height: z.union([z.number(), z.record(z.any(), z.any())]).optional(),
});

// 17. qrcode(value, options)
export const QRCodeSchema = z.object({
  type: z.literal('qrcode'),
  value: z.string(),
  options: z.object({
    model: z.union([z.literal(1), z.literal(2)]).optional(),
    size: z
      .union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
        z.literal(6),
        z.literal(7),
        z.literal(8),
      ])
      .optional(),
    errorlevel: z.enum(['l', 'm', 'q', 'h']).optional(),
  }),
});

// 18. pdf417(value, options?)
export const PDF417Schema = z.object({
  type: z.literal('pdf417'),
  value: z.string(),
  options: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      columns: z.number().optional(),
      rows: z.number().optional(),
      errorlevel: z
        .union([
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
          z.literal(5),
          z.literal(6),
          z.literal(7),
          z.literal(8),
        ])
        .optional(),
      truncated: z.boolean().optional(),
    })
    .optional(),
});

// 19. image(input, width, height, algorithm?, threshold?)
export const ImageSchema = z.object({
  type: z.literal('image'),
  input: z.any(),
  width: z.number(),
  height: z.number(),
  algorithm: z.string().optional(),
  threshold: z.number().optional(),
});

// 20. pulse(device?, on?, off?)
export const PulseSchema = z.object({
  type: z.literal('pulse'),
  device: z.enum(['0', '1']).optional(),
  on: z.number().optional(),
  off: z.number().optional(),
});

// 21. cut(value?)
export const CutSchema = z.object({
  type: z.literal('cut'),
  value: z.enum(['full', 'partial']).optional(),
});

/* ----------------- Union & Gesamt-Schema ----------------- */

export const TemplateElementSchema = z.discriminatedUnion('type', [
  TextSchema,
  NewlineSchema,
  LineSchema,
  UnderlineSchema,
  ItalicSchema,
  BoldSchema,
  InvertSchema,
  WidthSchema,
  HeightSchema,
  SizeSchema,
  FontSchema,
  AlignSchema,
  TableSchema,
  RuleSchema,
  BoxSchema,
  BarcodeSchema,
  QRCodeSchema,
  PDF417Schema,
  ImageSchema,
  PulseSchema,
  CutSchema,
]);

export const FilledTemplateSchema = z.object({
  encoding: z.string().optional(),
  elements: z.array(TemplateElementSchema),
});

/* ----------------- Typen-Exports ----------------- */

export type TemplateElement = z.infer<typeof TemplateElementSchema>;
export type FilledTemplate = z.infer<typeof FilledTemplateSchema>;
