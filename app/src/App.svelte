<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import StationGrid from './components/StationGrid.svelte';
  import DelayPanel from './components/DelayPanel.svelte';
  import Waveform from './components/Waveform.svelte';
  import { currentStation, isPlaying, isLoading, volume, delaySeconds, setDelay } from './lib/stores.js';
  import { fetchStations, getFallbackStreamUrl } from './lib/stations.js';
  import { isIOS, supportsWebCodecsAudio } from './lib/platform.js';
  import { getLastStationId, setLastStationId, getStationDelay, setStationDelay } from './lib/persistence.js';
  import * as audioEngine from './lib/audioEngine.js';

  const base = import.meta.env.BASE_URL;

  let stations = $state([]);
  let delayUnavailable = $state(false);
  let playbackError = $state(null);

  onMount(async () => {
    const result = await fetchStations();
    stations = result.stations;
    delayUnavailable = isIOS() && !supportsWebCodecsAudio();
    const lastId = getLastStationId();
    const restored = stations.find((s) => s.id === lastId);
    if (restored) {
      currentStation.set(restored);
      setDelay(getStationDelay(restored.id));
    }
  });

  let playRequestId = 0;
  let streamStartedAt = 0;

  // delayNode doesn't emit audible output until delaySeconds have elapsed
  // since the stream started, so the spinner stays up through that window
  // too -- otherwise the button would say "playing" while still silent.
  // Polls (rather than scheduling one exact timeout) so a mid-wait change
  // to delaySeconds shortens or extends the remaining wait automatically.
  function waitForDelayBuffer() {
    return new Promise((resolve) => {
      function tick() {
        if (Date.now() - streamStartedAt >= get(delaySeconds) * 1000) {
          resolve();
        } else {
          setTimeout(tick, 100);
        }
      }
      tick();
    });
  }

  async function attemptPlay(station, requestId, onFatalError) {
    await audioEngine.play(station, onFatalError);
    if (requestId !== playRequestId) return;
    streamStartedAt = Date.now();
    await waitForDelayBuffer();
    if (requestId !== playRequestId) return;
    isPlaying.set(true);
  }

  async function startPlayback(station) {
    const requestId = ++playRequestId;
    isPlaying.set(false);
    isLoading.set(true);
    playbackError = null;

    function onFatalError(err) {
      if (requestId !== playRequestId) return;
      console.warn('Fatal stream error:', err);
      audioEngine.pause();
      isPlaying.set(false);
      playbackError = `${station.name} no está disponible en este momento. Probá de nuevo más tarde o elegí otra radio.`;
    }

    try {
      await attemptPlay(station, requestId, onFatalError);
    } catch (err) {
      if (requestId !== playRequestId) return;
      console.warn('Stream error:', err);
      const fallbackUrl = getFallbackStreamUrl(station.id);
      if (fallbackUrl && fallbackUrl !== station.stream) {
        try {
          await attemptPlay({ ...station, stream: fallbackUrl }, requestId, onFatalError);
          return;
        } catch (fallbackErr) {
          if (requestId !== playRequestId) return;
          console.warn('Fallback stream also failed:', fallbackErr);
        }
      }
      if (requestId === playRequestId) {
        playbackError = `${station.name} no está disponible en este momento. Probá de nuevo más tarde o elegí otra radio.`;
      }
    } finally {
      if (requestId === playRequestId) isLoading.set(false);
    }
  }

  // Raising the delay past how long the stream has actually been running
  // asks the delayNode for history it hasn't buffered yet, so output goes
  // silent until enough real time passes. Drop back into the loading state
  // for that gap instead of leaving the button stuck on "playing" while
  // it's mute -- the stream itself keeps running, only the UI waits.
  async function rebufferForDelayIncrease() {
    const requestId = ++playRequestId;
    isPlaying.set(false);
    isLoading.set(true);
    await waitForDelayBuffer();
    if (requestId !== playRequestId) return;
    isPlaying.set(true);
    isLoading.set(false);
  }

  $effect(() => {
    const value = $delaySeconds;
    audioEngine.setDelaySeconds(value);
    if ($currentStation) setStationDelay($currentStation.id, value);
    if (!audioEngine.isIOSEngine() && get(isPlaying) && Date.now() - streamStartedAt < value * 1000) {
      rebufferForDelayIncrease();
    }
  });

  $effect(() => {
    audioEngine.setGain($volume);
  });

  function handleSelect(station) {
    currentStation.set(station);
    setLastStationId(station.id);
    setDelay(getStationDelay(station.id));
    playbackError = null;
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
    // Must run before any await — iOS Safari only grants AudioContext
    // activation if resume() is initiated in the synchronous user-gesture stack.
    audioEngine.warmContext();
    await startPlayback(station);
  }
</script>

<div class="page-atmosphere" aria-hidden="true"></div>

<header>
  <div class="logo">
    <img class="logo-icon" src="{base}relata_logo.png" alt="" />
    RE<span>LATA</span>
  </div>
  <div class="live-badge">
    <div class="live-dot"></div>
    Stream en vivo
  </div>
</header>

<main>
  <div class="hero">
    <div class="hero-inner">
      <div class="hero-text">
        <span class="hero-badge">🇦🇷 Para los argentinos en el mundo</span>
        <h1 class="hero-title">El partido<br />con <em>tu</em> voz</h1>
        <p class="hero-sub">
          Poné el partido en la tele en silencio, elegí una radio argentina y ajustá el delay hasta
          que el audio quede perfecto con la imagen. Nada más.
        </p>

        <div class="hero-cta">
          <a class="btn-primary" href="#stations-section">Elegí tu radio</a>
          <a class="btn-secondary" href="#howto">Cómo funciona</a>
        </div>
      </div>

      <img class="hero-image" src="{base}hero_image.png" alt="La app Relata mostrando una radio en vivo con el delay ajustado, con un hincha argentino festejando de fondo" />
    </div>
  </div>

  <div class="stations-section" id="stations-section">
    <div class="stations-inner">
      <p class="section-label">Elegí tu radio</p>
      <StationGrid {stations} currentStationId={$currentStation?.id ?? null} onSelect={handleSelect} />
    </div>
  </div>

  <div class="player-panel" class:live={$isPlaying}>
    <div class="player-top">
      <div>
        <div class="now-playing-label">Escuchando</div>
        <div class="now-playing-name">
          {$currentStation ? $currentStation.name : '— Seleccioná una radio —'}
          {#if $isPlaying}
            <span class="live-pill"><span class="live-pill-dot"></span>En vivo</span>
          {/if}
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

    {#if playbackError}
      <p class="playback-error-notice">{playbackError}</p>
    {/if}

    <Waveform />

    {#if delayUnavailable}
      <p class="delay-unavailable-notice">
        El delay no está disponible en iPhone/iPad por el momento. Probá desde una computadora o un dispositivo Android.
      </p>
    {/if}

    <DelayPanel disabled={delayUnavailable} />

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

  <div class="howto" id="howto">
    <p class="howto-title">Cómo usarlo</p>
    <ol class="howto-steps">
      <li><span class="howto-num">1</span>Silenciá el audio de tu tele o stream.</li>
      <li><span class="howto-num">2</span>Elegí tu radio argentina arriba.</li>
      <li><span class="howto-num">3</span>Dale Play.</li>
      <li><span class="howto-num">4</span>Ajustá el delay hasta que coincida con la imagen.</li>
    </ol>
    <p class="howto-footnote">Empezá desde 5s y afiná de a poco — la primera vez que pegás el gol con el relator es mágica.</p>
  </div>

  <div class="support-box">
    <div class="support-glow" aria-hidden="true"></div>
    <div class="support-icon">☕</div>
    <div class="support-copy">
      <p class="support-title">¿Te sirvió para el Mundial?</p>
      <p class="support-text">Invitame un café — mantiene Relata online y sin publicidad.</p>
    </div>
    <a href="https://www.buymeacoffee.com/elinarosato" target="_blank" rel="noopener noreferrer">
      <img
        class="support-btn-img"
        src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
        alt="Buy Me A Coffee"
      />
    </a>
  </div>
</main>

<footer>
  Relata — Hecho con amor para los argentinos en el mundo 🇦🇷<br />
  <span>Las radios son públicas. Si una no carga puede ser por restricciones de CORS del emisor.</span>
</footer>
