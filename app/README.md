# Relatores

Argentine radio commentary, synced to whatever screen you're watching the match on.

Relatores plays an Argentine radio stream (*relato*) through a delay you control, so the commentary lines up with a video feed that's running behind the live audio — typical when watching on a delayed TV/cable/streaming broadcast abroad. Mute the video, press play here, nudge the delay slider until the words match the picture.

## Stack

- [Svelte 5](https://svelte.dev/) + [Vite](https://vitejs.dev/)
- Web Audio API (`DelayNode`) for the adjustable audio delay
- Vitest + `@testing-library/svelte` for tests
- No backend yet — stations are streamed to directly from the browser, so a station only  works here if its stream URL sends permissive CORS headers

## Getting started

```bash
npm install
npm run dev      # starts the Vite dev server
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite (Vitest) |

`npm test` sets `NODE_OPTIONS=--no-experimental-webstorage` — Node's experimental
`localStorage` global otherwise shadows jsdom's in tests. If you invoke `vitest` directly instead of via `npm test`, set that env var yourself.

## Project structure

```
src/
  lib/
    audioEngine.js   # AudioContext/DelayNode graph: play, pause, delay, gain, analyser
    stations.js       # Station registry (name, frequency, stream URL)
    stores.js         # Svelte stores: current station, play/loading state, delay, volume
    persistence.js    # localStorage: last station, per-station delay
  components/
    StationGrid.svelte / StationCard.svelte   # Station picker
    DelayPanel.svelte                          # Delay slider, presets, fine-tune
    Waveform.svelte                             # Live waveform visualizer
  App.svelte          # Top-level layout and playback orchestration
```

## Testing

Each `lib` module and component has a co-located `*.test.js`. Run everything with:

```bash
npm test
```
