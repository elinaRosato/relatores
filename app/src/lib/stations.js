const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://api.re-lata.com';

// Stream URLs verified against radio-browser.info (https://www.radio-browser.info/)
// on 2026-06-24. Used only if the proxy is unreachable — bypasses the proxy
// entirely (direct upstream URLs), so it still hits the iOS CORS-taint bug
// the proxy exists to fix. Accepted trade-off: some stations beats none.
const FALLBACK_STATIONS = [
  { id: 'rnacional', name: 'Radio Nacional', freq: 'AM 870 / FM 98.7 — Buenos Aires', stream: 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1' },
  { id: 'rivadavia', name: 'Radio Rivadavia', freq: 'AM 630 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA.mp3' },
  { id: 'continental', name: 'Radio Continental', freq: 'AM 590 — Buenos Aires', stream: 'https://frontend.radiohdvivo.com/continental/live' },
  { id: 'la990', name: 'La 990', freq: 'AM 990 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/AM990.mp3' },
  { id: 'mitre', name: 'Radio Mitre', freq: 'AM 790 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/AM790_56AAC.aac' },
  { id: 'la100', name: 'La 100', freq: 'FM 99.9 — Buenos Aires', stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3' },
  { id: 'sport890', name: 'Sport 890', freq: 'AM 890 — Montevideo (UY)', stream: 'https://alba-uy-sport890-sport890.stream.mediatiquestream.com/index.m3u8' },
];

export async function fetchStations() {
  try {
    const response = await fetch(`${API_BASE}/stations`);
    if (!response.ok) throw new Error(`Proxy responded with ${response.status}`);
    return await response.json();
  } catch (err) {
    console.warn('Falling back to built-in station list:', err);
    return FALLBACK_STATIONS;
  }
}
