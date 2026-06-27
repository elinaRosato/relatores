// Stream URLs verified against radio-browser.info (https://www.radio-browser.info/)
// on 2026-06-24. StreamTheWorld/CDN mount IDs rotate periodically — the
// `uuid` field is the stable radio-browser.info stationuuid, kept so a
// future refresh job can re-resolve a current URL without re-searching.
const BUILT_IN_STATIONS = [
  {
    id: 'rnacional',
    name: 'Radio Nacional',
    freq: 'AM 870 / FM 98.7 — Buenos Aires',
    stream: 'https://sa.mp3.icecast.magma.edge-access.net/sc_rad1',
    uuid: '3934d9f0-7694-4896-bf11-fb19395c7c49',
  },
  {
    id: 'rivadavia',
    name: 'Radio Rivadavia',
    freq: 'AM 630 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA.mp3',
    uuid: 'e085b71b-aa0f-43f1-b24a-2bead9a8238c',
  },
  {
    id: 'continental',
    name: 'Radio Continental',
    freq: 'AM 590 — Buenos Aires',
    stream: 'https://frontend.radiohdvivo.com/continental/live',
    uuid: 'cd7ab04a-64eb-42b8-b5fb-f3e23e0de103',
  },
  {
    id: 'la990',
    name: 'La 990',
    freq: 'AM 990 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/AM990.mp3',
    uuid: '78b8f13c-623f-48d0-b7df-9c8e7ecacca1',
  },
  {
    id: 'mitre',
    name: 'Radio Mitre',
    freq: 'AM 790 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/AM790_56AAC.aac',
    uuid: 'f006d4dc-9771-4109-bf35-eb09291320da',
  },
  {
    id: 'la100',
    name: 'La 100',
    freq: 'FM 99.9 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/FM999_56.mp3',
    uuid: '7b03996e-6ea0-4db5-8168-ddd1463faec2',
  },
  {
    id: 'sport890',
    name: 'Sport 890',
    freq: 'AM 890 — Montevideo (UY)',
    stream: 'https://alba-uy-sport890-sport890.stream.mediatiquestream.com/index.m3u8',
    uuid: '747c7cb7-e1d6-4447-ad7f-5fd8de9157a3',
  },
];

// TEMP DEBUG -- remove once the iOS investigation is done. Isolates whether
// silence reaching the analyser is specific to cross-origin live streams
// (this file is same-origin and finite) or a problem in our own graph code
// regardless of source. Visit with ?debugtone=1 to show it in the grid.
const DEBUG_TONE_STATION = {
  id: 'debugtone',
  name: 'Test Tone (debug)',
  freq: '440Hz same-origin file',
  stream: '/test-tone.mp3',
  uuid: 'debug-tone',
};

export async function fetchStations() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugtone')) {
    return [DEBUG_TONE_STATION, ...BUILT_IN_STATIONS];
  }
  return BUILT_IN_STATIONS;
}
