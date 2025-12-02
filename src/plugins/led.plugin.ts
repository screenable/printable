import fp from 'fastify-plugin';
import axios from 'axios';
import { bus } from '../event-bus';
import { CONFIG } from '../config';

type LedState = 'ready' | 'working' | 'done' | 'error';
type IntervalId = ReturnType<typeof setInterval>;
type TimeoutId = ReturnType<typeof setTimeout>;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// WLED JSON API client
class WLEDClient {
  private baseUrl: string;
  private enabled: boolean;

  constructor(ip?: string) {
    if (!ip) {
      this.enabled = false;
      this.baseUrl = '';
      return;
    }
    this.enabled = true;
    this.baseUrl = `http://${ip}/json`;
  }

  async setState(payload: object): Promise<void> {
    if (!this.enabled) return;
    try {
      await axios.post(`${this.baseUrl}/state`, payload, {
        timeout: 2000,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Silently fail - LED errors should not crash the application
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        // Connection refused - WLED device might be offline
        return;
      }
      console.error('WLED API error:', error);
    }
  }

  async turnOff(): Promise<void> {
    await this.setState({ on: false });
  }

  async setSolidColor(r: number, g: number, b: number, brightness = 128): Promise<void> {
    await this.setState({
      on: true,
      bri: brightness,
      seg: [{ col: [[r, g, b]] }],
    });
  }

  async setEffect(
    effectId: number,
    speed = 128,
    intensity = 128,
    colors: number[][] = [[255, 205, 0]],
  ): Promise<void> {
    await this.setState({
      on: true,
      seg: [
        {
          fx: effectId,
          sx: speed,
          ix: intensity,
          col: colors,
        },
      ],
    });
  }

  async setBreathing(r: number, g: number, b: number): Promise<void> {
    // Effect 2 is typically "Breathe" in WLED (may vary by version)
    await this.setEffect(2, 128, 200, [[r, g, b]]);
  }

  async setBlink(r: number, g: number, b: number, speed = 200): Promise<void> {
    // Effect 1 is typically "Blink" in WLED (may vary by version)
    await this.setEffect(1, speed, 255, [[r, g, b]]);
  }

  async setRainbow(speed = 128): Promise<void> {
    // Effect 9 is typically "Rainbow" in WLED (may vary by version)
    await this.setEffect(9, speed, 128);
  }

  async setChase(r: number, g: number, b: number, speed = 128): Promise<void> {
    // Effect 28 is typically "Chase" in WLED (may vary by version)
    await this.setEffect(28, speed, 128, [[r, g, b]]);
  }

  async setChase2(r: number, g: number, b: number, speed = 128): Promise<void> {
    // Effect 28 is typically "Chase" in WLED (may vary by version)
    await this.setEffect(37, speed, 120, [[r, g, b]]);
  }
}

export default fp(async fastify => {
  const wled = new WLEDClient(CONFIG.WLED_IP);

  let state: LedState = 'ready';
  let progress = 0; // 0..1 - stored for potential future progress visualization
  const intervals: IntervalId[] = [];
  const timeouts: TimeoutId[] = [];

  const clearTimers = () => {
    for (const id of intervals.splice(0)) clearInterval(id);
    for (const id of timeouts.splice(0)) clearTimeout(id);
  };

  // ——— State-Maschine ———
  const applyState = async (next: LedState) => {
    state = next;
    clearTimers();

    switch (state) {
      case 'ready': {
        // Breathing amber/blue effect
        await wled.setBreathing(255, 205, 0);
        break;
      }
      case 'working': {
        // Rainbow chase effect for working state
        await wled.setChase2(255, 205, 0, 180);
        break;
      }
      case 'done': {
        // Success: solid green, then back to ready
        await wled.setSolidColor(0, 255, 0, 200);
        timeouts.push(
          setTimeout(async () => {
            await applyState('ready');
          }, CONFIG.LED_DONE_HOLD_MS),
        );
        break;
      }
      case 'error': {
        // Error: blinking red
        await wled.setBlink(220, 0, 40, 100);
        timeouts.push(
          setTimeout(async () => {
            await applyState('ready');
          }, CONFIG.LED_ERROR_HOLD_MS),
        );
        break;
      }
    }
  };

  // ——— Events & Fallback ———
  bus.on('button.press', async () => {
    progress = 0;
    await applyState('working');

    // Fallback: falls kein print.done kommt, nach X ms auf error gehen
    timeouts.push(
      setTimeout(async () => {
        if (state === 'working') await applyState('error');
      }, CONFIG.LED_WORKING_FALLBACK_MS),
    );
  });

  // Idempotent, falls du zusätzlich print.start emitierst:
  bus.on('print.start', async () => {
    if (state !== 'working') {
      progress = 0;
      await applyState('working');
      
      // Fallback: falls kein print.done kommt, nach X ms auf error gehen
      timeouts.push(
        setTimeout(async () => {
          if (state === 'working') await applyState('error');
        }, CONFIG.LED_WORKING_FALLBACK_MS),
      );
    }
  });

  bus.on('print.progress', (payload: { ratio?: number }) => {
    if (typeof payload?.ratio === 'number') {
      progress = Math.max(0, Math.min(1, payload.ratio));
    }
  });

  bus.on('print.done', async () => await applyState('done'));
  bus.on('print.error', async () => await applyState('error'));

  // Initial
  await applyState('ready');

  fastify.addHook('onClose', async () => {
    clearTimers();
    try {
      await wled.turnOff();
    } catch {}
  });
});
