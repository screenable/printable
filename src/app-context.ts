// src/app-context.ts
//
// Zentrale Singletons der Box-Runtime. Bündelt die Offline-Stores und Services,
// damit Plugins, print-worker und sync-service dieselben Instanzen teilen.
import { TemplateSelector } from './helpers/template-selector';
import { configService } from './services/config-service';
import { JobStore } from './services/job-store';
import { TemplateRegistry } from './services/template-registry';
import { VoucherStore } from './services/voucher-store';

export const voucherStore = new VoucherStore();
export const jobStore = new JobStore();
export const templateRegistry = new TemplateRegistry();
export const selector = new TemplateSelector(templateRegistry.all());

export { configService };

export const appContext = {
  voucherStore,
  jobStore,
  templateRegistry,
  selector,
  configService,
};
export type AppContext = typeof appContext;
