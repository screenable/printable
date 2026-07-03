import type { FastifyInstance } from 'fastify';
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import NetworkReceiptPrinter from '@point-of-sale/network-receipt-printer';
import { createCanvas, loadImage } from 'canvas';
import { bus } from './event-bus';
import { configService, jobStore } from './app-context';
import { type FilledTemplate, FilledTemplateSchema } from './types/template.validation';
import type { LocalJob } from './types/dispense.types';

const POLL_INTERVAL_MS = 200;

export async function startPrintWorker(server: FastifyInstance) {
  let printer: NetworkReceiptPrinter | null = null;

  const printerTarget = () => {
    const { host, port } = configService.get().printer;
    return { host, port };
  };

  async function canvasFromUrl(url: string) {
    const img = await loadImage(url);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);
    return canvas;
  }

  const renderAndPrint = async (job: LocalJob) => {
    const { host, port } = printerTarget();
    printer = new NetworkReceiptPrinter({ host, port });
    await printer.connect();

    const model = configService.get().printer.model;
    const bon_data = new ReceiptPrinterEncoder({
      printerModel: model as 'epson-tm-m30iii',
    });
    bon_data.initialize();

    jobStore.setStatus(job.id, 'printing');

    try {
      let template: FilledTemplate;
      try {
        template = FilledTemplateSchema.parse(job.filledTemplate);
      } catch (e) {
        console.error('Ungültige Template-Struktur:', e);
        throw e;
      }

      for (const el of template.elements) {
        switch (el.type) {
          case 'text':
            bon_data.text(el.value);
            break;
          case 'newline':
            bon_data.newline(el.count ?? 1);
            break;
          case 'line':
            bon_data.line(el.value);
            break;
          case 'underline':
            bon_data.underline(el.value ?? true);
            break;
          case 'italic':
            bon_data.italic(el.value ?? true);
            break;
          case 'bold':
            bon_data.bold(el.value ?? true);
            break;
          case 'invert':
            bon_data.invert(el.value ?? true);
            break;
          case 'width':
            bon_data.width(el.width);
            break;
          case 'height':
            bon_data.height(el.height);
            break;
          case 'size':
            bon_data.size(el.width, el.height);
            break;
          case 'font':
            bon_data.font(el.value);
            break;
          case 'align':
            bon_data.align(el.value);
            break;
          case 'table':
            bon_data.table(el.columns, el.data);
            break;
          case 'rule':
            bon_data.rule({ style: el.style, width: el.width });
            break;
          case 'box':
            bon_data.box(el.options, el.value);
            break;
          case 'barcode':
            bon_data.barcode(el.value, el.symbology, el.height);
            break;
          case 'qrcode':
            bon_data.qrcode(el.value, {
              model: el.options?.model,
              size: el.options?.size,
              errorlevel: el.options?.errorlevel,
            });
            break;
          case 'pdf417':
            bon_data.pdf417(el.value, el.options ?? {});
            break;
          case 'image': {
            try {
              const canvas = await canvasFromUrl(el.input);
              bon_data.image(canvas, el.width, el.height, 'atkinson', el.threshold);
            } catch (err) {
              console.error('Fehler beim Laden/Drucken des Bildes:', err);
            }
            break;
          }
          case 'pulse':
            bon_data.pulse(el.device ?? '0', el.on, el.off);
            break;
          case 'cut':
            bon_data.cut(el.value ?? 'full');
            break;
          default:
            console.warn('Unsupported element type:', (el as { type: string }).type);
        }
      }

      try {
        bus.emit('print.start');
        const commands = bon_data.encode();
        await printer.print(commands);
        jobStore.setStatus(job.id, 'done');
        bus.emit('print.done');
        await printer.disconnect();
      } catch (err) {
        bus.emit('print.error');
        console.error('Fehler beim Drucken über NetworkReceiptPrinter:', err);
        jobStore.setStatus(job.id, 'error', String(err));
      }
    } catch (error) {
      bus.emit('print.error');
      console.error('Fehler beim Rendern des Templates:', error);
      jobStore.setStatus(job.id, 'error', String(error));
    }
  };

  async function loop() {
    while (true) {
      try {
        const job = jobStore.nextPending();
        if (job) {
          server.log.info({ jobId: job.id }, 'Processing local print job');
          await renderAndPrint(job);
        }
      } catch (e) {
        console.error('Fehler im Print-Loop:', e);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  loop();
  server.log.info(printerTarget(), 'Print worker started (local queue)');
}
