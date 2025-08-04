import type { FastifyInstance } from 'fastify';
import type { JobStatus, PrintJob } from './types/types';
import escpos, { type Printer } from 'escpos';
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
            case 'align':
              printer.align(el.value);
              break;
            case 'text':
              if (el.size) printer.size(el.size[0], el.size[1]);
              printer.text(el.content);
              break;
            case 'qrcode':
              await qrimageAsync(printer, el.content);
              break;
            case 'cut':
              printer.cut(false);
              break;
            case 'image':
              escpos.Image.load(el.path, async image => {
                if (image instanceof escpos.Image) {
                  await printer.image(
                    image as escpos.Image,
                    (el.density as escpos.BITMAP_FORMAT_TYPE) || 'D24',
                  );
                }
              });
              break;
            case 'barcode':
              if (el.options) {
                printer.barcode(el.code, el.barcodeType, el.options);
              } else {
                printer.barcode(el.code, el.barcodeType);
              }
              break;

            case 'feed':
              printer.feed(el.lines || 1);
              break;
            default:
              console.warn('Unbekannter Element-Typ');
          }
        }

        printer.cut(false);
        printer.close();

        await mark(job.id, 'done');
        console.log('Job erfolgreich gedruckt:', job.id);
      } catch (error) {
        console.error('Druckfehler:', error);
        await mark(job.id, 'error', { error: String(error) });
      }
    });
  };

  function qrimageAsync(printer: Printer, content: string, options = { type: 'png', mode: '' }) {
    return new Promise<void>((resolve, reject) => {
      printer.qrimage(content, options, err => {
        if (err) return reject(err);
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
