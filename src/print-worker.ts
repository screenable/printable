import type { FastifyInstance } from 'fastify';
import type { JobStatus, PrintJob } from './types/types';
import escpos, { type BITMAP_FORMAT_TYPE, type Printer } from 'escpos';
escpos.Network = require('escpos-network');
import { type FilledTemplate, FilledTemplateSchema } from './types/template.validation';

const POLL_INTERVAL_MS = 3000;
export async function startPrintWorker(server: FastifyInstance) {
  const supabase = server.supabase;

  const mark = async (jobId: string, status: JobStatus, extra = {}) => {
    await supabase
      .from('print_jobs')
      .update({ status, ...extra })
      .eq('id', jobId);
  };

  const renderAndPrint = async (job: PrintJob) => {
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
  };

  // Helfer: escpos.Image.load in ein Promise wrappen
  function loadImageAsync(path: string): Promise<escpos.Image> {
    return new Promise((resolve, reject) => {
      escpos.Image.load(path, (image: escpos.Image | Error) => {
        if (!image) return reject(new Error('Bild konnte nicht geladen werden'));
        resolve(image as escpos.Image);
      });
    });
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

  async function loop() {
    while (true) {
      try {
        const job = await fetchPendingJob();
        if (job) {
          console.log('Gefundener Job:', job.id);
          await renderAndPrint(job);
        }
      } catch (e) {
        console.error('Fehler im Loop:', e);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  loop();
}
