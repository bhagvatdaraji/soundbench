import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:phone` serves over HTTPS on the LAN so an iPhone can use the mic.
export default defineConfig(({ mode }) => ({
  // Relative base so the build works on GitHub Pages (/soundbench/) or any other host.
  base: './',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  worker: { format: 'es' },
}));
