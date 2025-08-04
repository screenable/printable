// src/config.ts
import dotenv from 'dotenv';
dotenv.config();

const { SUPABASE_URL, SUPABASE_KEY, GPIO_PIN , DEBOUNCE_MS } = process.env;

if (!SUPABASE_URL) {
  throw new Error('Env-Var SUPABASE_URL is required but was not provided');
}
if (!SUPABASE_KEY) {
  throw new Error('Env-Var SUPABASE_KEY is required but was not provided');
}

export const CONFIG = {
  SUPABASE_URL:SUPABASE_URL,                           // jetzt safe, nie undefined
  SUPABASE_KEY:SUPABASE_KEY,
  GPIO_PIN: Number(GPIO_PIN ?? '17'),     // Default 17, falls undefined
  DEBOUNCE_MS:  Number(DEBOUNCE_MS ?? '10')
};