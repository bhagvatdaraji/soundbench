import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import pkg from './package.json' with { type: 'json' };

// `npm run dev:phone` serves over HTTPS on the LAN so an iPhone can use the mic.
export default defineConfig(({ mode }) => ({
  // Relative base so the build works on GitHub Pages (/soundbench/) or any other host.
  base: './',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  worker: { format: 'es' },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
}));
