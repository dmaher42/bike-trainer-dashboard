import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Use a relative base path for production builds so assets load correctly
  // whether the site is hosted from the repository subdirectory on GitHub
  // Pages or from the root of a custom domain. Without this change the
  // generated HTML referenced assets like "/bike-trainer-dashboard/assets/...",
  // which resulted in 404 responses when the site was served from a different
  // base path (e.g. a custom domain).
  base: command === 'build' ? './' : '/',
  build: {
    outDir: 'docs',
    emptyOutDir: true,
  },
}));
