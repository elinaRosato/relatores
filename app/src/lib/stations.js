// Stream URLs verified against radio-browser.info (https://www.radio-browser.info/)
// on 2026-06-24. Used only if the proxy is unreachable — bypasses the proxy
// entirely (direct upstream URLs), so it hits two iOS bugs the proxy fixes:
//   1. CORS taint: cross-origin responses without CORS headers are opaque
//      (body unreadable in WebCodecs / Web Audio).
//   2. Content-Type truncation: iOS Safari silently cuts off fetch() response
//      bodies when Content-Type is audio/mpeg — the proxy overrides this to
//      application/octet-stream, the direct servers don't.
// Accepted trade-off: on iOS the fallback streams will likely fail, but on
// desktop/Android they'll still work.
const LOGOS = {
  rnacional:   'radio_nacional.png',
  rivadavia:   'radio_rivadavia.jpeg',
  continental: 'radio_continental.png',
  la990:       'la_990.webp',
  mitre:       'radio_mitre.jpeg',
  la100:       'la_100.png',
};

function withLogos(stations) {
  return stations.map((s) => ({ ...s, logo: LOGOS[s.id] ?? null }));
}

const FALLBACK_STATIONS = [
  { id: 'rnacional', name: 'Radio Nacional', freq: 'AM 870 / FM 98.7 — Buenos Aires', stream: 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1' },
  { id: 'rivadavia', name: 'Radio Rivadavia', freq: 'AM 630 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA.mp3' },
  { id: 'continental', name: 'Radio Continental', freq: 'AM 590 — Buenos Aires', stream: 'https://frontend.radiohdvivo.com/continental/live' },
  { id: 'la990', name: 'La 990', freq: 'AM 990 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/AM990.mp3' },
  { id: 'mitre', name: 'Radio Mitre', freq: 'AM 790 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/AM790_56AAC.aac' },
  { id: 'la100', name: 'La 100', freq: 'FM 99.9 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3' },
];

export function getFallbackStreamUrl(id) {
  return FALLBACK_STATIONS.find((s) => s.id === id)?.stream;
}

export async function fetchStations() {
  try {
    // Relative, not absolute -- the proxy is only same-origin (and only
    // actually fixes the iOS taint bug) when reached as a path on
    // whatever domain is serving this page, via a Worker Route, not a
    // separate api.* subdomain. See the CORS proxy spec's Architecture
    // overview correction for why an absolute cross-origin URL was wrong.
    const response = await fetch('/stations');
    if (!response.ok) throw new Error(`Proxy responded with ${response.status}`);
    const stations = await response.json();
    return { stations: withLogos(stations), proxied: true };
  } catch (err) {
    console.warn('Falling back to built-in station list:', err);
    return { stations: withLogos(FALLBACK_STATIONS), proxied: false };
  }
}
