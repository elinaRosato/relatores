<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import StationGrid from './components/StationGrid.svelte';
  import DelayPanel from './components/DelayPanel.svelte';
  import Waveform from './components/Waveform.svelte';
  import { currentStation, isPlaying, isLoading, volume, delaySeconds, setDelay } from './lib/stores.js';
  import { fetchStations } from './lib/stations.js';
  import { getLastStationId, setLastStationId, getStationDelay, setStationDelay } from './lib/persistence.js';
  import * as audioEngine from './lib/audioEngine.js';

  let stations = $state([]);

  onMount(async () => {
    stations = await fetchStations();
    const lastId = getLastStationId();
    const restored = stations.find((s) => s.id === lastId);
    if (restored) {
      currentStation.set(restored);
      setDelay(getStationDelay(restored.id));
    }
  });

  $effect(() => {
    const value = $delaySeconds;
    audioEngine.setDelaySeconds(value);
    if ($currentStation) setStationDelay($currentStation.id, value);
  });

  $effect(() => {
    audioEngine.setGain($volume);
  });

  let playRequestId = 0;

  // delayNode doesn't emit audible output until delaySeconds have elapsed
  // since the source started, so the spinner stays up through that window
  // too -- otherwise the button would say "playing" while still silent.
  // Polls (rather than scheduling one exact timeout) so a mid-wait change
  // to delaySeconds shortens or extends the remaining wait automatically.
  function waitForDelayBuffer() {
    const startTime = Date.now();
    return new Promise((resolve) => {
      function tick() {
        if (Date.now() - startTime >= get(delaySeconds) * 1000) {
          resolve();
        } else {
          setTimeout(tick, 100);
        }
      }
      tick();
    });
  }

  async function startPlayback(station) {
    const requestId = ++playRequestId;
    isPlaying.set(false);
    isLoading.set(true);
    try {
      await audioEngine.play(station);
      if (requestId !== playRequestId) return;
      await waitForDelayBuffer();
      if (requestId !== playRequestId) return;
      isPlaying.set(true);
    } catch (err) {
      if (requestId === playRequestId) console.warn('Stream error:', err);
    } finally {
      if (requestId === playRequestId) isLoading.set(false);
    }
  }

  function handleSelect(station) {
    currentStation.set(station);
    setLastStationId(station.id);
    setDelay(getStationDelay(station.id));
    if (get(isPlaying) || get(isLoading)) {
      startPlayback(station);
    }
  }

  async function togglePlay() {
    const station = get(currentStation);
    if (!station) return;
    if (get(isPlaying)) {
      audioEngine.pause();
      isPlaying.set(false);
      return;
    }
    await startPlayback(station);
  }
</script>

<header>
  <div class="logo">RE<span>LATORES</span></div>
  <div class="live-badge">
    <div class="live-dot"></div>
    Stream en vivo
  </div>
</header>

<main>
  <div class="hero">
    <p class="hero-eyebrow">Para los argentinos en el mundo</p>
    <h1 class="hero-title">El partido<br />con <em>tu</em> voz</h1>
    <p class="hero-sub">
      Poné el partido en la tele en silencio, elegí una radio argentina y ajustá el delay hasta
      que el audio quede perfecto con la imagen. Nada más.
    </p>

    <p class="section-label">Elegí tu radio</p>
    <StationGrid {stations} currentStationId={$currentStation?.id ?? null} onSelect={handleSelect} />
  </div>

  <div class="player-panel">
    <div class="player-top">
      <div>
        <div class="now-playing-label">Escuchando</div>
        <div class="now-playing-name">
          {$currentStation ? $currentStation.name : '— Seleccioná una radio —'}
        </div>
      </div>
      <button
        class="play-btn"
        class:playing={$isPlaying}
        class:loading={$isLoading}
        onclick={togglePlay}
        disabled={!$currentStation || $isLoading}
        aria-label="Play / Pause"
        title="Play / Pause"
      >
        {#if $isLoading}
          <span class="spinner"></span>
        {:else}
          <svg viewBox="0 0 24 24">
            {#if $isPlaying}
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            {:else}
              <path d="M8 5v14l11-7z" />
            {/if}
          </svg>
        {/if}
      </button>
    </div>

    <Waveform />

    <DelayPanel />

    <div class="volume-row">
      <svg class="vol-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
        />
      </svg>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={$volume}
        oninput={(e) => volume.set(parseFloat(e.target.value))}
        aria-label="Volumen"
      />
      <svg class="vol-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM18.5 12c0-2.77-1.6-5.15-4-6.29v12.56c2.4-1.13 4-3.5 4-6.27z"
        />
      </svg>
    </div>
  </div>

  <div class="tip-box">
    <div class="tip-icon">📺</div>
    <div class="tip-text">
      <strong>Cómo usarlo:</strong> Silenciá el audio de tu tele o stream, abrí Relatores en el
      teléfono o la compu, elegí una radio y dale Play. Después mové el delay hasta que lo que
      escuchás coincida con lo que ves. Empezá desde 5s y ajustá de a poco. ¡La primera vez que
      pegás el gol con el relator es mágica!
    </div>
  </div>
</main>

<footer>
  Relatores — Hecho con amor para los argentinos en el mundo 🇦🇷<br />
  <span>Las radios son públicas. Si una no carga puede ser por restricciones de CORS del emisor.</span>
</footer>
