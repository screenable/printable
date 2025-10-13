import fp from 'fastify-plugin';
import { bus } from '../event-bus';
import { CONFIG } from '../config';
import { ws281x, StripType, type ValidGPIO, colorwheel } from 'piixel';

type LedState = 'ready' | 'working' | 'done' | 'error';
type IntervalId = ReturnType<typeof setInterval>;
type TimeoutId = ReturnType<typeof setTimeout>;
const ORDER = 'GRBW';
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rgb = (r: number, g: number, b: number) =>
  ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

function initWs281x(): { pixels: Uint32Array; length: number } | null {
  const count = CONFIG.NEOPIXEL_COUNT;
  if (!count || count <= 0) return null;

  const pixels = new Uint32Array(count);

  ws281x.configure({
    gpio: CONFIG.NEOPIXEL_GPIO as ValidGPIO, // z. B. 18 (PWM0)
    leds: count,
    resetOnExit:true,
    type: StripType.WS2812_STRIP, // WS2812/WS2811 meist GRB
  });

  ws281x.render(pixels); // alles aus
  return { pixels, length: count };
}

type Order4 = 'RGBW' | 'GRBW' | 'GBRW' | 'BGRW' | 'BRGW' | 'RBGW';

// biome-ignore lint/style/useDefaultParameterLast: <explanation>
function packRGBW(r: number, g: number, b: number, w = 0, order: Order4): number {
  // biome-ignore lint/style/useSingleVarDeclarator: <explanation>
  const R = r & 0xff,
    G = g & 0xff,
    B = b & 0xff,
    W = w & 0xff;
  // 32-bit Wert: [byte3][byte2][byte1][byte0]
  switch (order) {
    case 'RGBW':
      return (R << 24) | (G << 16) | (B << 8) | W;
    case 'GRBW':
      return (G << 24) | (R << 16) | (B << 8) | W;
    case 'GBRW':
      return (G << 24) | (B << 16) | (R << 8) | W;
    case 'BGRW':
      return (B << 24) | (G << 16) | (R << 8) | W;
    case 'BRGW':
      return (B << 24) | (R << 16) | (G << 8) | W;
    case 'RBGW':
      return (R << 24) | (B << 16) | (G << 8) | W;
  }
}

function makeBreathing(intervalMs: number, cb: (v01: number) => void): IntervalId {
  const dt = 20;
  let t = 0;
  return setInterval(() => {
    t = (t + dt) % intervalMs;
    const phase = (t / intervalMs) * 2 * Math.PI;
    cb((Math.sin(phase) + 1) / 2);
  }, dt);
}

export default fp(async fastify => {
  const ring = initWs281x();

  let state: LedState = 'ready';
  let progress = 0; // 0..1
let offset = 0
let swapFlag = false
  const intervals: IntervalId[] = [];
  const timeouts: TimeoutId[] = [];
  const clearTimers = () => {
    for (const id of intervals.splice(0)) clearInterval(id);
    for (const id of timeouts.splice(0)) clearTimeout(id);
  };

  // ——— helpers ———
  const ringFillAll = (c: number) => {
    
    if (!ring) return;
    const pixels = new Uint32Array(ring.length)
    pixels.fill(c);
    ws281x.render({pixels,brightness:0.6});
  };

  const ringBreathingAll = (color: [number, number, number], periodMs = 4000) => {
    if (!ring) return;
    const pixels = new Uint32Array(ring.length)
     ws281x.render(pixels);
     clearTimers()
    const [r0, g0, b0] = color;
    intervals.push(
      makeBreathing(periodMs, v01 => {
        const r = Math.round(r0 * v01);
        const g = Math.round(g0 * v01);
        const b = Math.round(b0 * v01);
        ringFillAll(rgb(r, g, b));
      }),
    );
  };

  const ringSpinnerWithProgress = () => {
    if (!ring) return;
    let idx = 0;
    clearTimers()
    intervals.push(
      setInterval(() => {
        const n = ring.length;
        const pCount = Math.round(clamp01(progress) * n);

        // Fortschrittsbogen (grün)
        for (let i = 0; i < n; i++) {
          ring.pixels[i] = i < pCount ? rgb(0, 76, 150) : 0x000000;
        }
        // Spinner-Kopf (amber)
        ring.pixels[idx % n] = rgb(255, 205, 0);
        idx = (idx + 1) % n;

        ws281x.render(ring.pixels);
      }, 40),
    );
  };

  const ringSuccessSweep = async () => {
    if (!ring) return;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      ring.pixels[i] = rgb(255, 205, 0);
      ws281x.render(ring.pixels);
      await sleep(15);
    }
    await sleep(CONFIG.LED_DONE_HOLD_MS);
  };

const flow = () =>{
  if(!ring) return
  const pixels = new Uint32Array(ring.length)
  offset++
  for (let i = 0; i < ring.length ; i++) {
        pixels[i] = colorwheel((i * ring.length + offset) % 255)
        
      }
      ws281x.render({pixels,brightness:0.3});
}


const swap = async() => {
  if(!ring) return
  const pixels = new Uint32Array(ring.length)
  ws281x.render(pixels);
  if(swapFlag) swapFlag =!swapFlag
  for (let i = 0; i < ring.length ; i++) {
        if(swapFlag){
          if(i%2){
            pixels[i] = rgb(255, 205, 0);
          }else{
             pixels[i] = rgb(0, 0, 0);
          }
        }else{
           if(i%2){
             pixels[i] = rgb(0, 0, 0);
          }else{
             pixels[i] = rgb(255, 205, 0);
          }
        }
          
      ws281x.render(pixels);
       await sleep(45);
        }
        
        
      
      
}

  function idle() {

    intervals.push(
    setInterval(() => {
     ringFillAll(rgb(255, 205, 0));
    }, 700)
  )

    /* const n = 16;
    if (!ring) return;
    let offset = 0
    const show = (c: number) => {
      offset++
      const pixels = new Uint32Array(ring.length)
      for (let i = 0; i < ring.length ; i++) {
        pixels[i] = colorwheel((i * ring.length + offset) % 255)
        
      }
      ws281x.render({pixels,brightness:0.8});
    };

    setTimeout(() => {
          
            show(0);
        
        }, 5000);
 */
   
  }

  const ringErrorBlink = () => {
    if (!ring) return;
    intervals.push(
      setInterval(() => {
        const lit = (Date.now() >> 8) & 1;
        ringFillAll(lit ? rgb(220, 0, 40) : 0);
      }, 150),
    );
  };

  // ——— State-Maschine ———
  const applyState = (next: LedState) => {
    state = next;
    clearTimers();

    switch (state) {
      case 'ready': {
        // dezentes Blau-Atmen
        //ringBreathingAll([255, 205, 0], 4200);
        (async () => {
          await idle();
        })();
        //testOrder();
        break;
      }
      case 'working': {
        // Spinner + (optional) Progress
        ringSpinnerWithProgress();
        break;
      }
      case 'done': {
        (async () => {
          await ringSuccessSweep();
          applyState('ready');
        })();
        break;
      }
      case 'error': {
        ringErrorBlink();
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

  fastify.addHook('onClose', (_i, done) => {
    clearTimers();
    try {
      if (ring) ws281x.render(new Uint32Array(ring.length)); // alle LEDs aus
      (ws281x as unknown as { reset?: () => void }).reset?.();
    } catch {}
    done();
  });
});