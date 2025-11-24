import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { CONFIG } from '../config';
import axios from 'axios';

/**
 * LED Plugin using WLED JSON API
 * 
 * This plugin controls LED strips via WLED (https://kno.wled.ge/)
 * Configure WLED_IP environment variable to point to your WLED device
 * 
 * Common WLED Effect IDs (fx):
 * - 0: Solid
 * - 1: Blink
 * - 2: Breathe
 * - 9: Rainbow
 * - 28: Chase
 * - 51: Fire 2012
 * - Full list: https://kno.wled.ge/features/effects/
 * 
 * Colors (col): RGB arrays e.g. [[255, 0, 0]] for red
 * Brightness (bri): 0-255
 * Speed (sx): 0-255
 * Intensity (ix): 0-255
 */

type LedState = 'ready' | 'working' | 'done' | 'error';
type IntervalId = ReturnType<typeof setInterval>;
type TimeoutId = ReturnType<typeof setTimeout>;

interface WLEDState {
  on: boolean;
  bri?: number; // brightness 0-255
  seg?: Array<{
    id: number;
    col?: number[][]; // colors
    fx?: number; // effect id
    sx?: number; // effect speed
    ix?: number; // effect intensity
  }>;
}

// WLED helper functions
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export default fp(async fastify => {
  const wledUrl = CONFIG.WLED_IP ? `http://${CONFIG.WLED_IP}` : null;
  
  if (!wledUrl) {
    fastify.log.warn('WLED_IP not configured, LED plugin will be disabled');
  }

  let state: LedState = 'ready';
  let progress = 0; // 0..1
  const intervals: IntervalId[] = [];
  const timeouts: TimeoutId[] = [];
  const clearTimers = () => {
    for (const id of intervals.splice(0)) clearInterval(id);
    for (const id of timeouts.splice(0)) clearTimeout(id);
  };

  // ——— WLED API helpers ———
  const sendWLEDCommand = async (stateData: WLEDState) => {
    if (!wledUrl) return;
    try {
      await axios.post(`${wledUrl}/json/state`, stateData, {
        timeout: 2000,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      fastify.log.error(`Failed to send WLED command: ${error}`);
    }
  };

  // ——— LED State Effects ———
  const setReadyState = async () => {
    // Amber breathing effect for ready state
    await sendWLEDCommand({
      on: true,
      bri: 128,
      seg: [{
        id: 0,
        col: [[255, 205, 0]], // Amber
        fx: 2, // Breath effect
        sx: 128, // Medium speed
        ix: 128, // Medium intensity
      }],
    });
  };

  const setWorkingState = async () => {
    // Rainbow chase effect for working state
    await sendWLEDCommand({
      on: true,
      bri: 153,
      seg: [{
        id: 0,
        col: [[0, 76, 150]], // Blue base color
        fx: 28, // Chase effect
        sx: 180, // Faster speed
        ix: 200, // Higher intensity
      }],
    });
  };

  const setDoneState = async () => {
    // Amber sweep/wipe effect for done state
    await sendWLEDCommand({
      on: true,
      bri: 200,
      seg: [{
        id: 0,
        col: [[255, 205, 0]], // Amber
        fx: 1, // Blink/Strobe effect (will be used briefly)
        sx: 255, // Fast speed
        ix: 255, // Full intensity
      }],
    });
  };

  const setErrorState = async () => {
    // Red blink effect for error state
    await sendWLEDCommand({
      on: true,
      bri: 200,
      seg: [{
        id: 0,
        col: [[220, 0, 40]], // Red
        fx: 1, // Blink effect
        sx: 200, // Medium-fast speed
        ix: 255, // Full intensity
      }],
    });
  };

  const turnOff = async () => {
    await sendWLEDCommand({
      on: false,
    });
  };

  // ——— State-Maschine ———
  const applyState = (next: LedState) => {
    state = next;
    clearTimers();

    switch (state) {
      case 'ready': {
        (async () => {
          await setReadyState();
        })();
        break;
      }
      case 'working': {
        (async () => {
          await setWorkingState();
        })();
        break;
      }
      case 'done': {
        (async () => {
          try {
            await setDoneState();
            await sleep(CONFIG.LED_DONE_HOLD_MS);
            applyState('ready');
          } catch (error) {
            fastify.log.error(`Error in done state: ${error}`);
          }
        })();
        break;
      }
      case 'error': {
        (async () => {
          await setErrorState();
        })();
        timeouts.push(setTimeout(() => applyState('ready'), CONFIG.LED_ERROR_HOLD_MS));
        break;
      }
    }
  };

  // ——— Events & Fallback ———
  bus.on('button.press', () => {
    progress = 0;
    applyState('working');

    // Fallback: falls kein print.done kommt, nach X ms auf done gehen
    timeouts.push(
      setTimeout(() => {
        if (state === 'working') applyState('done');
      }, CONFIG.LED_WORKING_FALLBACK_MS),
    );
  });

  // Idempotent, falls du zusätzlich print.start emitierst:
  bus.on('print.start', () => {
    if (state !== 'working') {
      progress = 0;
      applyState('working');
    }
  });

  bus.on('print.progress', (payload: { ratio?: number }) => {
    if (typeof payload?.ratio === 'number') progress = clamp01(payload.ratio);
  });

  bus.on('print.done', () => applyState('done'));
  bus.on('print.error', () => applyState('error'));

  // Initial
  applyState('ready');

  fastify.addHook('onClose', async (_i) => {
    clearTimers();
    try {
      await turnOff();
    } catch (error) {
      fastify.log.error(`Error turning off LEDs: ${error}`);
    }
  });
});
