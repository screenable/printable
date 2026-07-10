export type RewardType = 'none' | 'static' | 'unique';

export interface DeviceConfig {
  printer?: { host?: string; port?: number; model?: string };
  gpio?: { buttonPin?: number; debounceMs?: number; buzzerLedPin?: number };
  neopixel?: { count?: number; gpio?: number; brightness?: number };
  led?: { doneHoldMs?: number; errorHoldMs?: number; workingFallbackMs?: number; wledIp?: string };
  dispense?: { cooldownMs?: number; redeemBaseUrl?: string };
}

export interface DeviceRow {
  id: string;
  name: string | null;
  location: string | null;
  config: DeviceConfig;
  desired_version: string | null;
  app_version: string | null;
  last_seen: string | null;
  voucher_stock: Record<string, number> | null;
  dispensed: Record<string, number> | null;
}

export interface TemplateRow {
  id: number;
  name: string;
  template: ReceiptTemplate;
}

export type VoucherStatus = 'available' | 'reserved' | 'claimed';

export interface VoucherPoolRow {
  id: number;
  code: string;
  category: string;
  status: VoucherStatus;
  device_id: string | null;
  reserved_at: string | null;
  claimed_at: string | null;
}

export interface DeviceTemplateRow {
  id?: number;
  device_id: string;
  template_id: number;
  template_name?: string;
  enabled: boolean;
  probability: number;
  cooldown_sec: number;
  data: Record<string, unknown>;
  reward_type: RewardType;
  voucher_category: string | null;
  static_code: string | null;
  daily_limit: number | null;
  total_limit: number | null;
  is_fallback: boolean;
  _delete?: boolean;
  // Transiente UI-Felder (nicht in der DB)
  template_layout?: ReceiptTemplate;
  _newCodes?: string;
  _codesMsg?: string;
}

export interface PrintJobRow {
  id: string;
  data: { code?: string; template?: string; device_id?: string; [k: string]: unknown } | null;
  filled_template: ReceiptTemplate | null;
  status: string;
  created_at: string | null;
}

export interface DispenseStatRow {
  template: string;
  status: string;
  count: number | string;
}

export interface DeviceEventRow {
  id: number;
  ts: string;
  level: string;
  type: string;
  message: string | null;
  data: Record<string, unknown> | null;
}

// ── Bon-Layout ────────────────────────────────────────────────────────────
export interface ReceiptElement {
  type: string;
  value?: string | boolean;
  count?: number;
  width?: number | string;
  height?: number;
  style?: string;
  input?: string;
  symbology?: string;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReceiptTemplate {
  encoding?: string;
  elements: ReceiptElement[];
}
