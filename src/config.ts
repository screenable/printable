// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

const {
  SUPABASE_URL,
  SUPABASE_KEY,
  GPIO_PIN,
  DEBOUNCE_MS,
  WEBHOOK_URL,
  WEBHOOK_COOLDOWN_MS,
  GPIO_BUZZER_LED_PIN,
  NEOPIXEL_COUNT,
  NEOPIXEL_GPIO,
  NEOPIXEL_BRIGHTNESS,
  LED_DONE_HOLD_MS,
  LED_ERROR_HOLD_MS,
  LED_WORKING_FALLBACK_MS,
} = process.env;

if (!WEBHOOK_URL) {
  throw new Error('Env-Var WEBHOOK_URL is required but was not provided');
}

if (!SUPABASE_URL) {
  throw new Error('Env-Var SUPABASE_URL is required but was not provided');
}
if (!SUPABASE_KEY) {
  throw new Error('Env-Var SUPABASE_KEY is required but was not provided');
}

export const CONFIG = {
  SUPABASE_URL: SUPABASE_URL, // jetzt safe, nie undefined
  SUPABASE_KEY: SUPABASE_KEY,
  GPIO_PIN: Number(GPIO_PIN ?? '17'), // Default 17, falls undefined
  DEBOUNCE_MS: Number(DEBOUNCE_MS ?? '10'),
  WEBHOOK_URL: WEBHOOK_URL,
  WEBHOOK_COOLDOWN_MS: Number(WEBHOOK_COOLDOWN_MS ?? 1000),
  GPIO_BUZZER_LED_PIN: GPIO_BUZZER_LED_PIN ? Number(GPIO_BUZZER_LED_PIN) : undefined,

  NEOPIXEL_COUNT: NEOPIXEL_COUNT ? Number(NEOPIXEL_COUNT) : 0,
  NEOPIXEL_GPIO: Number(NEOPIXEL_GPIO ?? '18'),
  NEOPIXEL_BRIGHTNESS: Number(NEOPIXEL_BRIGHTNESS ?? '80'),

  LED_DONE_HOLD_MS: Number(LED_DONE_HOLD_MS ?? '2200'),
  LED_ERROR_HOLD_MS: Number(LED_ERROR_HOLD_MS ?? '3000'),
  LED_WORKING_FALLBACK_MS: Number(LED_WORKING_FALLBACK_MS ?? '10000'), // 10s
};