# relata-api

Cloudflare Worker proxy for Relata's radio streams. Fixes iOS Safari/WebKit
treating cross-origin radio streams as CORS-tainted by making every stream
same-origin (see `docs/superpowers/specs/2026-06-28-cors-proxy-and-infra-design.md`
in the design-context repo for the full design).

## Routes

- `GET /stations` — station registry as JSON, with proxy stream URLs.
- `GET /stream/:id` — proxies the real upstream stream for a known station id.

## Local development

```bash
npm install
npm run dev    # wrangler dev, local-only, no Cloudflare auth needed
npm test       # vitest, runs inside the real workerd runtime
```
