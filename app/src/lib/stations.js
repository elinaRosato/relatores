const BUILT_IN_STATIONS = [
  {
    id: 'rnacional',
    name: 'Radio Nacional',
    freq: 'AM 870 / FM 98.7 — Buenos Aires',
    stream: 'https://livestreaming.educ.ar/nacionales/nacfm.m3u8',
    fallback: 'https://stream.spainmedia.es/nacionales/nacfm',
  },
  {
    id: 'rivadavia',
    name: 'Radio Rivadavia',
    freq: 'AM 630 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RIVADAVIA_AM.mp3',
  },
  {
    id: 'continental',
    name: 'Radio Continental',
    freq: 'AM 590 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOCONTINENTAL_SC',
  },
  {
    id: 'la990',
    name: 'La 990',
    freq: 'AM 990 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LARADIO990.mp3',
  },
  {
    id: 'mitre',
    name: 'Radio Mitre',
    freq: 'AM 790 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/RADIOAM790.mp3',
  },
  {
    id: 'vorterix',
    name: 'Vorterix',
    freq: 'FM 92.1 — Buenos Aires',
    stream: 'https://edge.iono.fm/b/258',
  },
  {
    id: 'la100',
    name: 'La 100',
    freq: 'FM 99.9 — Buenos Aires',
    stream: 'https://playerservices.streamtheworld.com/api/livestream-redirect/LA100.mp3',
  },
  {
    id: 'sport890',
    name: 'Sport 890',
    freq: 'AM 890 — Montevideo (UY)',
    stream: 'https://stream.zeno.fm/fzqr4vqmdxzuv',
  },
];

export async function fetchStations() {
  return BUILT_IN_STATIONS;
}
