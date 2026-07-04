import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // Relative Pfade, damit die App auch in Unterverzeichnissen (Netlify/Vercel/
  // Supabase Storage / GitHub Pages) ohne weitere Konfiguration läuft.
  base: './',
});
