import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ command }) => ({
  // GitHub Pages serves this as a project site at /relatores/, not at the
  // domain root, so built asset URLs need the repo name as a base path.
  // Dev server stays at root so `npm run dev` URLs are unaffected.
  base: command === 'build' ? '/relatores/' : '/',
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
}));
