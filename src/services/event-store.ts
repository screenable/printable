// src/services/event-store.ts
//
// Lokaler, offline-fähiger Ereignis-Puffer. Die Box protokolliert wichtige
// Ereignisse (Start, Druckfehler, Drucker nicht erreichbar, Pool leer,
// Update …) lokal; der sync-service lädt sie nach Supabase (device_events)
// hoch, sobald online. So sind die Logs in der Web-Konsole lesbar.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { CONFIG } from '../config';
import { JsonStore } from '../lib/json-store';

export type EventLevel = 'info' | 'warn' | 'error';

export interface DeviceEvent {
  id: string;
  ts: string;
  level: EventLevel;
  type: string;
  message?: string;
  data?: Record<string, unknown>;
  synced: boolean;
}

const MAX_EVENTS = 2000; // Ringpuffer-Obergrenze gegen unbegrenztes Wachsen.

export class EventStore {
  private store: JsonStore<{ items: DeviceEvent[] }>;

  constructor(dataDir: string = CONFIG.DATA_DIR) {
    this.store = new JsonStore(join(dataDir, 'events.json'), { items: [] });
  }

  log(level: EventLevel, type: string, message?: string, data?: Record<string, unknown>): void {
    this.store.update(state => {
      state.items.push({
        id: randomUUID(),
        ts: new Date().toISOString(),
        level,
        type,
        message,
        data,
        synced: false,
      });
      // Ältestes verwerfen, wenn zu groß (bereits synchronisierte zuerst).
      if (state.items.length > MAX_EVENTS) {
        state.items.sort((a, b) => Number(a.synced) - Number(b.synced));
        state.items = state.items.slice(state.items.length - MAX_EVENTS);
      }
      return null;
    });
  }

  unsynced(): DeviceEvent[] {
    return this.store.get().items.filter(e => !e.synced);
  }

  markSyncedAndPrune(ids: string[]): void {
    const set = new Set(ids);
    this.store.update(state => {
      for (const e of state.items) if (set.has(e.id)) e.synced = true;
      // Synchronisierte, alte Ereignisse aufräumen (die letzten 200 behalten).
      const synced = state.items.filter(e => e.synced);
      if (synced.length > 200) {
        const drop = new Set(synced.slice(0, synced.length - 200).map(e => e.id));
        state.items = state.items.filter(e => !drop.has(e.id));
      }
      return null;
    });
  }
}
