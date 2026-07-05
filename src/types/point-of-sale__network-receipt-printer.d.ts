declare module '@point-of-sale/network-receipt-printer' {
  export interface NetworkReceiptPrinterOptions {
    host?: string;
    port?: number;
    timeout?: number;
  }

  // Statt Payload-Typen: direkt Funktionssignaturen
  export type NetworkPrinterEventMap = {
    connected: (info: { type: 'network' }) => void;
    timeout: () => void;
    error: (e: Error) => void;
    disconnected: () => void;
    data: (d: Uint8Array) => void;
  };

  export default class NetworkReceiptPrinter {
    constructor(options?: NetworkReceiptPrinterOptions);

    connect(): Promise<void>;
    listen(): Promise<true>;
    disconnect(): Promise<void>;
    print(command: Uint8Array /* | Buffer */): Promise<void>;

    addEventListener<K extends keyof NetworkPrinterEventMap>(
      name: K,
      fn: NetworkPrinterEventMap[K],
    ): void;
  }
}
