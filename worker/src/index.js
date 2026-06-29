import { STATIONS } from './stations.js';
import { resolveCorsOrigin } from './cors.js';

function withCors(headers, request) {
  const origin = resolveCorsOrigin(request.headers.get('Origin'));
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function handleStations(request) {
  const body = STATIONS.map(({ id, name, freq }) => ({
    id,
    name,
    freq,
    stream: new URL(`/stream/${id}`, request.url).toString(),
  }));
  const headers = withCors(new Headers({ 'Content-Type': 'application/json' }), request);
  return new Response(JSON.stringify(body), { headers });
}

async function handleStream(station, request) {
  const upstreamHeaders = new Headers();
  const range = request.headers.get('Range');
  if (range) upstreamHeaders.set('Range', range);

  let upstreamResponse;
  try {
    upstreamResponse = await fetch(station.upstream, { headers: upstreamHeaders });
  } catch (err) {
    console.warn(`Upstream fetch failed for ${station.id}:`, err);
    return new Response('Upstream unavailable', { status: 502, headers: withCors(new Headers(), request) });
  }

  const headers = withCors(new Headers(), request);
  headers.set('Content-Type', upstreamResponse.headers.get('Content-Type') ?? 'application/octet-stream');
  for (const name of ['Accept-Ranges', 'Content-Range', 'Content-Length']) {
    const value = upstreamResponse.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  return new Response(upstreamResponse.body, { status: upstreamResponse.status, headers });
}

function handleOptions(request) {
  const headers = withCors(new Headers(), request);
  if (headers.has('Access-Control-Allow-Origin')) {
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    const url = new URL(request.url);

    if (url.pathname === '/stations') {
      return handleStations(request);
    }

    const streamMatch = url.pathname.match(/^\/stream\/([^/]+)$/);
    if (streamMatch) {
      const station = STATIONS.find((s) => s.id === streamMatch[1]);
      if (!station) return new Response('Not found', { status: 404, headers: withCors(new Headers(), request) });
      return handleStream(station, request);
    }

    return new Response('Not found', { status: 404, headers: withCors(new Headers(), request) });
  },
};
