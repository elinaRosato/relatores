const PRODUCTION_ORIGIN = 'https://re-lata.com';

// Matches both Cloudflare Pages preview URL forms for the `relata` project:
// per-commit (https://<hash>.relata.pages.dev) and per-branch
// (https://<branch-slug>.relata.pages.dev). Scoped to our own project name,
// so it can't be satisfied by a third party's pages.dev deployment.
const PAGES_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.relata\.pages\.dev$/;

export function resolveCorsOrigin(origin) {
  if (!origin) return null;
  if (origin === PRODUCTION_ORIGIN) return origin;
  if (PAGES_PREVIEW_ORIGIN.test(origin)) return origin;
  return null;
}
