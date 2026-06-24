# Frontend Evolution — Design

## Context

Relatores v1 is a single 853-line HTML file ([relatores.html](../../../relatores.html)). This design covers the frontend rearchitecture needed before the next round of features (proxy integration, PWA, analytics, donations) lands. It is one of five independent sub-projects identified for the overall app (the others — backend/proxy, analytics, donations, community delay presets — are out of scope here and will get their own specs).

Goal: restructure the frontend for maintainability as UI surface grows, while solving two concrete problems in the current build: unreliable background audio on iOS, and a mobile layout bug in the delay fine-tune controls.

## Framework & build tooling

**Svelte + Vite.**

The core of this app is timing-sensitive, imperative Web Audio API code (`AudioContext`, `DelayNode`, `MediaElementSource`). React's render cycle actively fights this — every re-render risks recreating or losing track of audio nodes unless `useRef`/`useEffect` are managed defensively. Svelte's fine-grained reactivity (no virtual DOM diffing) doesn't have this problem, components can hold direct references to Web Audio nodes safely, and it ships a much smaller bundle, which matters on cellular connections during a live match. Vite gives fast dev/build and integrates cleanly with `vite-plugin-pwa` for the service worker.

This was chosen over plain Vanilla JS + Vite (more manual DOM-sync boilerplate as the UI grows — station health indicators, analytics views, donation widget) and React + Vite (biggest ecosystem, but fights the audio code and ships a heavier bundle).

### Proposed module structure

```
src/
  lib/
    audioEngine.js     # AudioContext/DelayNode/MediaElementSource graph,
                        # navigator.audioSession + MediaSession registration,
                        # play/pause/setDelay/setVolume
    stations.js         # station registry data (name, freq, stream URL, fallback URL, geo)
    persistence.js      # localStorage read/write: per-station delay, last station
    stores.js           # Svelte stores: currentStation, delaySeconds, isPlaying, volume
                        # — single source of truth all controls read/write through
  components/
    StationGrid.svelte
    StationCard.svelte
    DelayPanel.svelte   # composes Slider + Presets + FineTune + EditableNumber
    Waveform.svelte     # canvas visualizer, subscribes to an AnalyserNode
    InstallBanner.svelte
  App.svelte
public/
  manifest.json
  icons/
```

Each module has one job: `audioEngine.js` owns the Web Audio graph and is the only place that touches `AudioContext`; `stores.js` is the single source of truth for playback state; UI components are consumers that read/write stores and never touch audio nodes directly.

## Background audio

Mobile background playback (screen locked, app switched) is **critical** to the use case — a match runs 90+ minutes and users will lock their phones or check other apps.

The current graph (`<audio>` → `createMediaElementSource` → `DelayNode` → destination, [relatores.html:668-672](../../../relatores.html#L668-L672)) is exactly the pattern most likely to get suspended by iOS Safari when backgrounded, unless the page opts in to background audio.

Approach — extend, don't rearchitect:
- Set `navigator.audioSession.type = "play"` (Safari 16.4+ / iOS 16.4+) as soon as playback starts, telling iOS this is a real audio-playback page so the `AudioContext` won't be suspended in the background.
- Register the Media Session API (`navigator.mediaSession.metadata`, play/pause/stop action handlers) so the lock screen shows station name and playback controls.
- Fallback for older browsers without `audioSession` support: listen for `visibilitychange`/focus and call `audioCtx.resume()` if the context's `state` is `"suspended"`. If resume doesn't restore playback within a short timeout, surface a "tap to resume" affordance rather than failing silently.

No change to the existing `AudioContext`/`DelayNode` signal path is required.

## Delay controls (mobile-first)

Single source of truth: a `delaySeconds` store. Four controls all read from and write to it, staying in sync with each other:

1. **Slider** — continuous, 0–60s range, 0.1s step. Handles coarse-to-medium dragging.
2. **Presets** — quick-jump buttons (5/10/15/20/30/45s). Highlighted active only on exact match; cleared otherwise.
3. **Fine-tune** — a single ±0.1s button pair, for the precision a touch drag can't reliably reach (mobile slider track is ~300px for a 60s range — about 0.2s/pixel, and real touch precision is roughly ±3-5px). The previous ±5s/±1s/±0.1s three-tier button row is dropped entirely: presets and the slider already cover those ranges, and the row's "label + 6 buttons + 3 step labels" layout (~470px wide, no `flex-wrap`, [relatores.html:381-388](../../../relatores.html#L381-L388)) overflows on phones narrower than that. The 2-button version fits on one line at any phone width.
4. **Editable number** — the delay readout becomes a real `<input type="number">`, styled with no visible border/background until focused, so it looks identical to a plain text readout until tapped. Lets users type an exact value directly (useful for the future "community delay presets by country" feature — paste in a known-good value). Clamped to 0–60, snapped to 0.1 step on commit.

Setting the value through any one of the four updates all the others (slider position, preset highlight, number readout) through the shared store.

## Persistence

`localStorage`, keyed per-station: remember the last-used delay value for each station individually (different stations/streams have different inherent latency), plus the last-selected station overall. Falls back to 0s (matching current v1 default) for a station with no saved value yet.

## PWA scope

- **Installability**: web app manifest for "Add to Home Screen" on supporting platforms. iOS Safari has no `beforeinstallprompt` event and no native install banner — the only path is the manual Share → "Add to Home Screen" flow, which most users won't discover on their own. A custom dismissible banner detects iOS Safari + not-installed and walks the user through those steps; on Android/desktop, the native install prompt is used instead.
- **Service worker**: app-shell caching only (HTML/CSS/JS/icons/fonts), via `vite-plugin-pwa`. This makes the app open instantly and lets the station list render with no network. Live audio streams are always network-only — they're live, so they can't be cached, and the service worker must not intercept or buffer stream requests.

## Out of scope

Backend/proxy, analytics, donations, and the community-delay-presets stretch feature are separate sub-projects with their own specs. Mobile polish for the header/hero/station-grid sections was reviewed and found adequate as-is (`.hero-title` already uses `clamp()` for fluid sizing; the 2-column station grid wrapping frequency text to 2 lines is a normal, working pattern) — no changes needed there.
