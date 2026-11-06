import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const api = 'http://localhost:3000';

export default defineConfig({
  root,
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: fileURLToPath(new URL('../dist/web', import.meta.url)),
    emptyOutDir: true,
    // Keep every asset a separate file: the server's CSP allows same-origin
    // resources only and no inline script, style or data: fonts.
    assetsInlineLimit: 0,
  },
  server: {
    // `npm run dev:ui` with `npm start` running: the UI proxies API calls.
    proxy: Object.fromEntries(['/analyze', '/examples', '/rules', '/health'].map((p) => [p, api])),
  },
});
