import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ command }) => ({
  // Production is still served by GitHub Pages as a project site at
  // /relatores/, not at the domain root -- Cloudflare Pages (which serves
  // from its own root, where this wouldn't be needed) isn't live yet. Put
  // this back once that infra cutover actually happens, not before --
  // removing it early is what broke the live site's asset paths.
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
