import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  root: 'dev',
  publicDir: '../public',
  plugins: [react()],
  base: command === 'build' ? './' : '/',
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
}));
