import type { Database } from './database.types';

export type PrintJob = Database['public']['Tables']['print_jobs']['Row'];
export type Template = Database['public']['Tables']['templates']['Row'];
export type JobStatus = Database['public']['Enums']['job_status'];

// minimal: nur die Typen, die du brauchst
export type AlignElement = { type: 'align'; value: 'CT' | 'LT' | 'RT' };
export type TextElement = {
  type: 'text';
  content: string;
  size?: [1 | 2, 1 | 2];
  align?: 'CT' | 'LT' | 'RT';
  font?: 'A' | 'B';
  bold?: boolean;
};
export type ImageElement = {
  type: 'image';
  path: string;
  density?: string; // z.B. 's8', 'd8', ...
  align?: 'CT' | 'LT' | 'RT';
};
export type BarcodeOptions = {
  width?: number;
  height?: number;
  includeParity?: boolean;
  position?: 'OFF' | 'ABV' | 'BLW' | 'BTH';
  font?: 'A' | 'B';
};
export type BarcodeElement = {
  type: 'barcode';
  code: string;
  barcodeType: 'UPC-A' | 'UPC-E' | 'EAN13' | 'EAN8' | 'CODE39' | 'ITF' | 'NW7';
  options?: BarcodeOptions;
};

export type StyleElement = { type: 'style'; style: 'NORMAL' | 'B' | 'U' | 'I' };
export type CharSpacing = { type: 'char_spacing'; value: number };
export type FontElement = { type: 'font'; value: 'A' | 'B' };
export type LineSpacing = { type: 'line_spacing'; value: number };
export type ControlElement = { type: 'control'; value: 'LF' | 'FF' | 'CR' | 'HT' | 'VT' };
export type DrawLine = { type: 'draw_line' };
export type FeedElement = { type: 'feed'; lines?: number };
export type QRCodeElement = { type: 'qrcode'; content: string };
export type CutElement = { type: 'cut'; part?: boolean };
export type TemplateElement =
  | AlignElement
  | TextElement
  | QRCodeElement
  | CutElement
  | ImageElement
  | BarcodeElement
  | FeedElement
  | FontElement
  | StyleElement
  | CharSpacing
  | LineSpacing
  | ControlElement
  | DrawLine;
