import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // VITE_BASE lets the same build be served from a sub path (e.g. GitHub Pages: /PKfriend/)
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' },
  },
  build: { target: 'es2020', sourcemap: false },
});
