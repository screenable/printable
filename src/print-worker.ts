import type { FastifyInstance } from 'fastify';
import type { JobStatus, PrintJob } from './types/types';
import escpos, { type BITMAP_FORMAT_TYPE, type Printer } from 'escpos';
escpos.Network = require('escpos-network');
import { type FilledTemplate, FilledTemplateSchema } from './types/template.validation';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import NetworkReceiptPrinter from '@point-of-sale/network-receipt-printer';
import { createCanvas, loadImage } from 'canvas';
import { bus } from './event-bus';

const POLL_INTERVAL_MS = 200;
export async function startPrintWorker(server: FastifyInstance) {
  const supabase = server.supabase;
  let printer: NetworkReceiptPrinter | null = null;

  const mark = async (jobId: string, status: JobStatus, extra = {}) => {
    await supabase
      .from('print_jobs')
      .update({ status, ...extra })
      .eq('id', jobId);
  };

  const renderAndPrintNew = async (job: PrintJob) => {
    // ↪︎ 2) Network-Printer verbinden
    printer = new NetworkReceiptPrinter({
      host: '192.168.100.200',
      port: 9100,
    });
    await printer.connect();
    if (!job.filled_template) {
      server.log.info('Kein gefülltes Template, überspringe');
      return;
    }
    const bon_data = new ReceiptPrinterEncoder({
      printerModel: 'epson-tm-m30iii',
    });
    bon_data.initialize();

    await mark(job.id, 'printing');

    try {
      let rawTemplate = job.filled_template;
      if (typeof rawTemplate === 'string') {
        try {
          rawTemplate = JSON.parse(rawTemplate);
        } catch (e) {
          throw new Error('filled_template ist kein gültiges JSON');
        }
      }

      let template: FilledTemplate;
      try {
        template = FilledTemplateSchema.parse(rawTemplate);
      } catch (e) {
        console.error('Ungültige Template-Struktur:', e);
        throw e; // oder entsprechend Fehlerbehandlung
      }

      for (const el of template.elements) {
        switch (el.type) {
          case 'text':
            bon_data.text(el.value);
            //console.log('Text:', el.value);
            break;

          case 'newline':
            bon_data.newline(el.count ?? 1);
            //console.log('Newline x', el.count ?? 1);
            break;

          case 'line':
            bon_data.line(el.value);
            //console.log('Line:', el.value);
            break;

          case 'underline':
            bon_data.underline(el.value ?? true);
            //console.log('Underline:', el.value ?? true);
            break;

          case 'italic':
            bon_data.italic(el.value ?? true);
            //console.log('Italic:', el.value ?? true);
            break;

          case 'bold':
            bon_data.bold(el.value ?? true);
            //console.log('Bold:', el.value ?? true);
            break;

          case 'invert':
            bon_data.invert(el.value ?? true);
            //console.log('Invert:', el.value ?? true);
            break;

          case 'width':
            bon_data.width(el.width);
            //console.log('Width:', el.width);
            break;

          case 'height':
            bon_data.height(el.height);
            //console.log('Height:', el.height);
            break;

          case 'size':
            // width kann string (z.B. '2') oder number sein
            bon_data.size(el.width, el.height);
            //console.log('Size:', el.width, el.height);
            break;

          case 'font':
            bon_data.font(el.value);
            //console.log('Font:', el.value);
            break;

          case 'align':
            bon_data.align(el.value);
            //console.log('Align:', el.value);
            break;

          case 'table':
            bon_data.table(el.columns, el.data);
            //console.log('Table');
            break;

          case 'rule':
            bon_data.rule({ style: el.style, width: el.width });
            //console.log('Rule:', el.style, el.width);
            break;

          case 'box':
            bon_data.box(el.options, el.value);
            //console.log('Box');
            break;

          case 'barcode':
            bon_data.barcode(el.value, el.symbology, el.height);
            //console.log('Barcode:', el.value);
            break;

          case 'qrcode':
            bon_data.qrcode(el.value, {
              model: el.options?.model,
              size: el.options?.size,
              errorlevel: el.options?.errorlevel,
            });
            //console.log('QRCode:', el.value);
            break;

          case 'pdf417':
            bon_data.pdf417(el.value, el.options ?? {});
            //console.log('PDF417:', el.value);
            break;

          case 'image': {
            //console.log('Bild druck gestartet:', el.input);
            try {
              const canvas = await canvasFromUrl(el.input);
              bon_data.image(canvas, el.width, el.height, 'atkinson', el.threshold);
              //console.log('Canvas an Encoder übergeben');
            } catch (err) {
              console.error('Fehler beim Laden/Drucken des Bildes:', err);
            }
            break;
          }

          case 'pulse':
            bon_data.pulse(el.device ?? '0', el.on, el.off);
            console.log('Pulse:', el.device);
            break;

          case 'cut':
            bon_data.cut(el.value ?? 'full');
            //console.log('Cut:', el.value);
            break;

          default:
            console.warn('Unsupported element type:', (el as { type: string }).type);
        }
      }

      if (printer) {
        // nachdem Sie alle bon_data.*-Aufrufe gemacht haben:

        try {
          bus.emit('print.start');
          // 1) EINMAL encode() aufrufen und in `commands` speichern
          const commands = bon_data.encode();

          // 2) Logging zeigt jetzt korrekt die volle Länge
          //console.log('composing complete, sending', commands.length, 'bytes to printer');

          // 3) genau dieses Buffer einmalig an den Drucker schicken
          await printer.print(commands);

          await mark(job.id, 'done');
          bus.emit('print.done');
          //console.log('print job sent, printer disconnected');
          await printer.disconnect();
        } catch (err) {
          bus.emit('print.error');

          console.error('Fehler beim Drucken über NetworkReceiptPrinter:', err);
          await mark(job.id, 'error', { error: String(err) });
        }
      }
    } catch (error) {}
  };

  /* const renderAndPrint = async (job: PrintJob) => {
    if (!job.filled_template) {
      server.log.info('Kein gefülltes Template, überspringe');
      return;
    }
    // Epson TM-m30III via USB (ggf. anpassen, wenn Netzwerkdrucker)
    const device = new escpos.Network('192.168.1.219');
    const options = { encoding: '860' };
    const printer = new escpos.Printer(device, options);
    await mark(job.id, 'printing');

    device.open(async () => {
      try {
        let rawTemplate = job.filled_template;
        if (typeof rawTemplate === 'string') {
          try {
            rawTemplate = JSON.parse(rawTemplate);
          } catch (e) {
            throw new Error('filled_template ist kein gültiges JSON');
          }
        }

        let template: FilledTemplate;
        try {
          template = FilledTemplateSchema.parse(rawTemplate);
        } catch (e) {
          console.error('Ungültige Template-Struktur:', e);
          throw e; // oder entsprechend Fehlerbehandlung
        }
        for (const el of template.elements) {
          switch (el.type) {
            case 'style':
              printer.style(el.style);
              console.log('Style gesetzt:', el.style);
              break;
            case 'char_spacing':
              printer.spacing(el.value);
              console.log('Char Spacing gesetzt:', el.value);
              break;
            case 'line_spacing':
              printer.lineSpace(el.value);
              console.log('Line Spacing gesetzt:', el.value);
              break;
            case 'font':
              printer.font(el.value);
              console.log('Font gesetzt:', el.value);
              break;
            case 'control':
              printer.control(el.value);
              console.log('Control gesetzt:', el.value);
              break;
            case 'draw_line':
              printer.size(1, 1);
              printer.font('A');
              printer.style('NORMAL');
              printer.spacing(0);
              printer.lineSpace(0);
              printer.drawLine();
              console.log('Zeile gezeichnet');
              break;
            case 'align':
              printer.align(el.value);
              console.log('Alignement gesetzt:', el.value);
              break;
            case 'text':
              if (el.size) printer.size(el.size[0], el.size[1]);
              printer.text(el.content);
              console.log('Text gedruckt:', el.content);
              break;
            case 'qrcode':
              await qrimageAsync(printer, el.content);
              console.log('QR-Code gedruckt:', el.content);
              break;
            case 'cut':
              printer.cut(false);
              console.log('Drucker geschnitten');
              break;
            case 'image': {
              console.log('Bild druck gestartet:', el.path);
              const image = await loadImageAsync(el.path);
              printer.size(1, 1);
              printer.image(image, (el.density as BITMAP_FORMAT_TYPE) || 'D24');
              console.log('Bild in Queue gelegt:', el.path);
              break;
            }
            case 'barcode':
              console.log('Barcode gedruckt:', el.code);
              if (el.options) {
                printer.barcode(el.code, el.barcodeType, el.options);
              } else {
                printer.barcode(el.code, el.barcodeType);
              }
              break;

            case 'feed':
              console.log('Feed gedruckt:', el.lines);
              printer.feed(el.lines || 1);
              break;
            default:
              console.warn('Unbekannter Element-Typ');
          }
        }
        setTimeout(() => {
          printer.size(1, 1);
          printer.style('NORMAL');
          printer.align('LT');
          printer.spacing(0);
          printer.lineSpace(0);
          printer.cut(false);
          console.log('cut gedruckt');
          printer.close();
          console.log('Printer geschlossen');
        }, 200);

        await mark(job.id, 'done');
        console.log('Job erfolgreich gedruckt:', job.id);
      } catch (error) {
        console.error('Druckfehler:', error);
        await mark(job.id, 'error', { error: String(error) });
      }
    });
  }; */

  async function loadRemoteImageAsBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async function qrimageAsync(
    printer: Printer,
    content: string,
    options = { type: 'png', mode: '', size: 14 },
  ) {
    return new Promise<void>((resolve, reject) => {
      console.log('QR-Promise startet');
      printer.qrimage(content, options, err => {
        if (err) return reject(err);
        printer.feed(10);
        console.log('QR-Promise resolve');
        resolve();
      });
    });
  }

  const connectToPrinter = async () => {
    if (!printer) printer = new NetworkReceiptPrinter({ host: '192.168.100.200' });
    await printer.connect();
  };

  const fetchPendingJob = async () => {
    const { data, error } = await supabase
      .from('print_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows (depends on client version); ignore if no job
      // fallback: return null if row not found
      if (data === null) return null;
    }
    return data || null;
  };

  // Hilfsfunktion
  async function canvasFromUrl(url: string) {
    const img = await loadImage(url);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);
    return canvas;
  }

  async function loop() {
    while (true) {
      try {
        const job = await fetchPendingJob();
        if (job) {
          console.log('Gefundener Job:', job.id);
          await renderAndPrintNew(job);
        }
      } catch (e) {
        console.error('Fehler im Loop:', e);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  await connectToPrinter();
  loop();
}
