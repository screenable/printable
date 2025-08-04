import { EventEmitter2 } from 'eventemitter2';
export const bus = new EventEmitter2({ wildcard: true });