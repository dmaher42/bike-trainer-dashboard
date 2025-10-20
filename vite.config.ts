import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName = 'bike-trainer-dashboard';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${repoName}/` : '/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
}));
