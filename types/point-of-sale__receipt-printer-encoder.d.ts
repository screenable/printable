declare module '@point-of-sale/receipt-printer-encoder' {
  type PrinterModel =
    | 'bixolon-srp350'
    | 'bixolon-srp350iii'
    | 'citizen-ct-s310ii'
    | 'epson-tm-p20ii'
    | 'epson-tm-t20iii'
    | 'epson-tm-t70'
    | 'epson-tm-t70ii'
    | 'epson-tm-m30iii'
    | 'epson-tm-t88ii'
    | 'epson-tm-t88iii'
    | 'epson-tm-t88iv'
    | 'epson-tm-t88v'
    | 'epson-tm-t88vi'
    | 'epson-tm-t88vii'
    | 'fujitsu-fp1000'
    | 'hp-a779'
    | 'metapace-t1'
    | 'mpt-ii'
    | 'pos-5890'
    | 'pos-8360'
    | 'star-mc-print2'
    | 'star-mpop'
    | 'star-sm-l200'
    | 'star-tsp100iii'
    | 'star-tsp100iv'
    | 'star-tsp650'
    | 'star-tsp650ii'
    | 'xprinter-xp-n160ii'
    | 'xprinter-xp-t80q'
    | 'youku-58t';

  type CodePageMapping =
    | 'cp437'
    | 'cp737'
    | 'cp850'
    | 'cp775'
    | 'cp852'
    | 'cp855'
    | 'cp857'
    | 'cp858'
    | 'cp860'
    | 'cp861'
    | 'cp862'
    | 'cp863'
    | 'cp864'
    | 'cp865'
    | 'cp866'
    | 'cp869'
    | 'cp936'
    | 'cp949'
    | 'cp950'
    | 'cp1252'
    | 'iso88596'
    | 'shiftjis'
    | 'windows1250'
    | 'windows1251'
    | 'windows1252'
    | 'windows1253'
    | 'windows1254'
    | 'windows1255'
    | 'windows1256'
    | 'windows1257'
    | 'windows1258';

  type CodePage = 'auto' | CodePageMapping;

  type Language = 'esc-pos' | 'star-prnt' | 'star-line';

  type ImageMode = 'column' | 'raster';

  type ImageAlgorithm = 'threshold' | 'bayer' | 'floydsteinberg' | 'atkinson';

  interface ReceiptPrinterOptions {
    columns?: number;
    /**
     * @deprecated Use `columns` instead
     */
    width?: number;
    language?: Language;
    imageMode?: ImageMode;
    feedBeforeCut?: number;
    newline?: string;
    codepageMapping?: CodePageMapping | Record<string, number>;
    codepageCandidates?: CodePageMapping[];
    debug?: boolean;
    embedded?: boolean;
    createCanvas?: (width: number, height: number) => HTMLCanvasElement;
    autoFlush?: boolean;
    printerModel?: PrinterModel;
  }

  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptPrinterOptions);

    initialize(): this;
    codepage(codepage: CodePage): this;
    text(value: string): this;
    newline(count?: number): this;
    line(value: string): this;
    underline(value?: boolean | number): this;
    italic(value?: boolean): this;
    bold(value?: boolean): this;
    invert(value?: boolean): this;
    width(width: number): this;
    height(height: number): this;
    size(width: number | string, height?: number): this;
    font(value: 'A' | 'B'): this;
    align(value: 'left' | 'center' | 'right'): this;

    table(
      columns: ReadonlyArray<{
        width?: number;
        marginLeft?: number;
        marginRight?: number;
        align?: 'left' | 'right';
        verticalAlign?: 'top' | 'bottom';
      }>,
      data: ReadonlyArray<
        ReadonlyArray<string | ((encoder: ReceiptPrinterEncoder) => ReceiptPrinterEncoder)>
      >,
    ): this;

    rule(options?: {
      style?: 'none' | 'single' | 'double';
      width?: number;
    }): this;

    box(
      options: {
        style?: 'none' | 'single' | 'double';
        width?: number;
        marginLeft?: number;
        marginRight?: number;
        paddingLeft?: number;
        paddingRight?: number;
        align: 'left' | 'right';
      },
      value: string | ((encoder: ReceiptPrinterEncoder) => void),
    ): this;

    barcode(
      value: string,
      symbology: 'upca' | 'upce' | 'ean13' | 'ean8' | 'coda39' | 'itf' | 'codabar',
      height?: number | object,
    ): this;

    qrcode(
      value: string,
      options: {
        model?: 1 | 2;
        size?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
        errorlevel?: 'l' | 'm' | 'q' | 'h';
      },
    ): this;

    pdf417(
      value: string,
      options?: {
        width?: number;
        height?: number;
        columns?: number;
        rows?: number;
        errorlevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
        truncated?: boolean;
      },
    ): this;

    image(
      input: HTMLCanvasElement | ImageData | object,
      width: number,
      height: number,
      algorithm?: ImageAlgorithm,
      threshold?: number,
    ): this;

    pulse(device?: '0' | '1', on?: number, off?: number): this;
    cut(value?: 'full' | 'partial'): this;
    raw(data: Uint8Array): this;
    encode(): Uint8Array;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    commands(): any[];

    static get printerModels(): { id: string; name: string }[];

    get columns(): number;
    get language(): string;
  }
}
