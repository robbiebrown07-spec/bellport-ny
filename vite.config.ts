import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    headers: {
      'Cache-Control': 'no-cache',
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    headers: {
      'Cache-Control': 'no-cache',
    },
  },
});
