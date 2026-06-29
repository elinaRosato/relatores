import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, it, expect, vi } from 'vitest';
import worker from './index.js';

afterEach(() => vi.restoreAllMocks());

async function run(request) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, {}, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe('unknown routes', () => {
  it('returns 404 for an unrecognized path', async () => {
    const request = new Request('https://api.re-lata.com/whatever');
    const response = await run(request);
    expect(response.status).toBe(404);
  });
});

describe('GET /stations', () => {
  it('returns the station registry with proxy stream URLs', async () => {
    const request = new Request('https://api.re-lata.com/stations');
    const response = await run(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.length).toBe(7);
    const nacional = body.find((s) => s.id === 'rnacional');
    expect(nacional.stream).toBe('https://api.re-lata.com/stream/rnacional');
    expect(nacional.name).toBe('Radio Nacional');
    expect(nacional.upstream).toBeUndefined();
  });

  it('builds the stream URL relative to the request origin, not a hardcoded domain', async () => {
    const request = new Request('https://my-feature-branch-relata-api.example.workers.dev/stations');
    const response = await run(request);
    const body = await response.json();
    const nacional = body.find((s) => s.id === 'rnacional');
    expect(nacional.stream).toBe('https://my-feature-branch-relata-api.example.workers.dev/stream/rnacional');
  });
});

describe('GET /stream/:id', () => {
  it('streams a known station through from upstream', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const upstreamRequest = new Request(input, init);
      const url = new URL(upstreamRequest.url);
      if (url.href === 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1') {
        return new Response('audio-bytes', { headers: { 'Content-Type': 'audio/mpeg' } });
      }
      throw new Error(`No mock found for ${url.href}`);
    });

    const request = new Request('https://api.re-lata.com/stream/rnacional');
    const response = await run(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg');
    const bytes = new TextDecoder().decode(await response.arrayBuffer());
    expect(bytes).toBe('audio-bytes');
  });

  it('returns 404 for an unknown id', async () => {
    const request = new Request('https://api.re-lata.com/stream/doesnotexist');
    const response = await run(request);
    expect(response.status).toBe(404);
  });

  it('returns a clean 502 with CORS headers when the upstream fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const request = new Request('https://api.re-lata.com/stream/rnacional', {
      headers: { Origin: 'https://re-lata.com' },
    });
    const response = await run(request);

    expect(response.status).toBe(502);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://re-lata.com');
  });
});

describe('CORS', () => {
  it('reflects an allowed Origin on /stations', async () => {
    const request = new Request('https://api.re-lata.com/stations', {
      headers: { Origin: 'https://re-lata.com' },
    });
    const response = await run(request);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://re-lata.com');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('reflects an allowed Pages preview Origin', async () => {
    const request = new Request('https://api.re-lata.com/stations', {
      headers: { Origin: 'https://feat-x.relata.pages.dev' },
    });
    const response = await run(request);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://feat-x.relata.pages.dev');
  });

  it('omits the header for a disallowed Origin', async () => {
    const request = new Request('https://api.re-lata.com/stations', {
      headers: { Origin: 'https://evil.example.com' },
    });
    const response = await run(request);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});

describe('OPTIONS preflight', () => {
  it('answers a preflight from an allowed origin', async () => {
    const request = new Request('https://api.re-lata.com/stream/rnacional', {
      method: 'OPTIONS',
      headers: { Origin: 'https://re-lata.com', 'Access-Control-Request-Method': 'GET' },
    });
    const response = await run(request);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://re-lata.com');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Range');
  });

  it('omits CORS headers on a preflight from a disallowed origin', async () => {
    const request = new Request('https://api.re-lata.com/stream/rnacional', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    const response = await run(request);
    expect(response.status).toBe(204);
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });
});

describe('Range passthrough', () => {
  it('forwards a Range request upstream and passes through the partial-content response', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const upstreamRequest = new Request(input, init);
      const url = new URL(upstreamRequest.url);
      if (
        url.href === 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1' &&
        upstreamRequest.headers.get('Range') === 'bytes=0-99'
      ) {
        return new Response('partial-bytes', {
          status: 206,
          headers: { 'Content-Range': 'bytes 0-99/500', 'Accept-Ranges': 'bytes' },
        });
      }
      throw new Error(`No mock found for ${url.href}`);
    });

    const request = new Request('https://api.re-lata.com/stream/rnacional', {
      headers: { Range: 'bytes=0-99' },
    });
    const response = await run(request);

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 0-99/500');
    expect(response.headers.get('Access-Control-Expose-Headers')).toContain('Content-Range');
  });
});
