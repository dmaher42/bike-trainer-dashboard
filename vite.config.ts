import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/bike-trainer-dashboard/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
});
