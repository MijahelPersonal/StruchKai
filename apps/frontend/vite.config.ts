import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/v1': {
        target: process.env.STRUCHKAI_API_URL ?? 'http://127.0.0.1:3100',
        changeOrigin: false,
      },
    },
  },
});
