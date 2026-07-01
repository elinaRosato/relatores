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
    const customStations = JSON.parse(localStorage.getItem('custom-radios') ?? '[]');
    if (customStations.length) stations = [...stations, ...customStations];
    delayUnavailable = isIOS() && !supportsWebCodecsAudio();
    const lastId = getLastStationId();
    const restored = stations.find((s) => s.id === lastId);
    if (restored) {
      currentStation.set(restored);
      setDelay(getStationDelay(restored.id));
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        const station = get(currentStation);
        if (station && !get(isPlaying) && !get(isLoading)) startPlayback(station);
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioEngine.pause();
        isPlaying.set(false);
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        audioEngine.pause();
        isPlaying.set(false);
      });
    }
  });

  function makeRoundedArtwork(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.roundRect(0, 0, size, size, size * 0.15);
        ctx.clip();
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
  }

  $effect(() => {
    if (!('mediaSession' in navigator)) return;
    const station = $currentStation;
    const playing = $isPlaying;
    if (!station) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      return;
    }
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const rawSrc = new URL(base + (station.logo ?? 'relata_logo.png'), location.href).href;
    makeRoundedArtwork(rawSrc).then((artworkSrc) => {
      if (get(currentStation)?.id !== station.id) return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: station.freq,
        album: 'Relata',
        artwork: [{ src: artworkSrc, sizes: '256x256', type: 'image/png' }],
      });
    });
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
    if ($currentStation) setStationDelay($currentStation.id, value);

    if (audioEngine.isIOSEngine()) {
      if (get(isPlaying)) {
        let restartRequestId;
        audioEngine.setDelaySeconds(value, {
          onBegin: () => {
            restartRequestId = ++playRequestId;
            isPlaying.set(false);
            isLoading.set(true);
          },
          onComplete: () => {
            if (restartRequestId !== playRequestId) return;
            streamStartedAt = Date.now();
            waitForDelayBuffer().then(() => {
              if (restartRequestId !== playRequestId) return;
              isLoading.set(false);
              isPlaying.set(true);
            });
          },
          onError: (err) => {
            if (restartRequestId == null || restartRequestId !== playRequestId) return;
            console.warn('Fatal stream error:', err);
            audioEngine.pause();
            isPlaying.set(false);
            isLoading.set(false);
            playbackError = `${get(currentStation)?.name ?? 'La radio'} no está disponible en este momento. Probá de nuevo más tarde o elegí otra radio.`;
          },
        });
      } else {
        audioEngine.setDelaySeconds(value);
      }
    } else {
      audioEngine.setDelaySeconds(value);
      if (get(isPlaying) && Date.now() - streamStartedAt < value * 1000) {
        rebufferForDelayIncrease();
      }
    }
  });

  $effect(() => {
    audioEngine.setGain($volume);
  });

  let customUrl = $state('');

  function addCustomRadio() {
    const url = customUrl.trim();
    if (!url) return;
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const name = hostname.charAt(0).toUpperCase() + hostname.slice(1);
      const id = `custom-${Date.now()}`;
      const station = { id, name, freq: 'Radio personalizada', stream: url };
      stations = [...stations, station];
      const saved = JSON.parse(localStorage.getItem('custom-radios') ?? '[]');
      localStorage.setItem('custom-radios', JSON.stringify([...saved, station]));
      customUrl = '';
    } catch {
      // invalid URL
    }
  }

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
    <p class="section-label">Elegí tu radio</p>
    <div class="stations-layout">
      <div class="stations-col-left">
        <StationGrid {stations} currentStationId={$currentStation?.id ?? null} onSelect={handleSelect} />
      </div>
      <div class="stations-col-right">
        <div class="custom-radio-box">
          <p class="custom-radio-title">Agregá tu propia radio</p>
          <p class="custom-radio-desc">Pegá el URL del stream de tu radio favorita</p>
          <p class="custom-radio-soon">🚧 Esta función está en desarrollo y estará disponible pronto.</p>
          <input
            class="custom-radio-input"
            type="url"
            placeholder="https://..."
            bind:value={customUrl}
            disabled
          />
          <button class="custom-radio-btn" disabled>Agregá tu radio</button>
        </div>
      </div>
    </div>
  </div>

  <div class="player-panel" class:live={$isPlaying}>

    <!-- 1 · Radio info -->
    <div class="player-section player-info-section">
      <p class="player-section-label">Escuchando</p>
      <div class="player-radio-card" class:empty={!$currentStation}>
        {#if $currentStation}
          {#if $currentStation.logo}
            <img class="player-radio-logo" src="{base}{$currentStation.logo}" alt={$currentStation.name} />
          {:else}
            <div class="player-radio-no-logo">
              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
              </svg>
            </div>
          {/if}
          <div class="player-radio-info">
            <div class="player-radio-name">{$currentStation.name}</div>
            <div class="player-radio-freq">{$currentStation.freq}</div>
          </div>
          {#if $isPlaying}
            <span class="live-tag">En vivo</span>
          {/if}
        {:else}
          <div class="player-radio-empty">
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
            </svg>
            <span>Seleccioná una radio arriba</span>
          </div>
        {/if}
      </div>
      {#if playbackError}
        <p class="playback-error-notice">{playbackError}</p>
      {/if}
    </div>

    <!-- 2 · Player -->
    <div class="player-section player-audio-section" class:disabled={!$currentStation}>
      <p class="player-section-label">Reproductor</p>
      <Waveform />
      <div class="player-controls">
        <button
          class="adj-btn"
          onclick={() => setDelay(Math.max(0, $delaySeconds - 1))}
          disabled={!$currentStation || $delaySeconds < 1}
          aria-label="Restar 1 segundo"
        >
          <svg viewBox="0 0 64.385 64.385" fill="currentColor" aria-hidden="true">
            <polygon points="64.385,7.967 32.291,32.343 32.291,7.365 0,31.891 32.291,56.417 32.291,32.644 64.385,57.02"/>
          </svg>
          <span class="adj-label">1s</span>
        </button>
        <button
          class="play-btn"
          class:playing={$isPlaying}
          class:loading={$isLoading}
          onclick={togglePlay}
          disabled={!$currentStation || $isLoading}
          aria-label="Play / Pause"
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
        <button
          class="adj-btn"
          onclick={() => setDelay($delaySeconds + 1)}
          disabled={!$currentStation}
          aria-label="Sumar 1 segundo"
        >
          <span class="adj-label">1s</span>
          <svg viewBox="0 0 64.385 64.385" fill="currentColor" aria-hidden="true" style="transform: scaleX(-1)">
            <polygon points="64.385,7.967 32.291,32.343 32.291,7.365 0,31.891 32.291,56.417 32.291,32.644 64.385,57.02"/>
          </svg>
        </button>
      </div>
      <div class="volume-row">
        <svg class="vol-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
        <input
          type="range" min="0" max="1" step="0.01"
          value={$volume}
          style="--track-fill: {($volume * 100).toFixed(1)}%"
          oninput={(e) => volume.set(parseFloat(e.target.value))}
          aria-label="Volumen"
        />
        <svg class="vol-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM18.5 12c0-2.77-1.6-5.15-4-6.29v12.56c2.4-1.13 4-3.5 4-6.27z" />
        </svg>
      </div>
    </div>

    <!-- 3 · Delay -->
    <div class="player-section player-delay-section" class:disabled={!$currentStation || delayUnavailable}>
      <p class="player-section-label">Delay</p>
      {#if delayUnavailable}
        <p class="delay-unavailable-notice">
          El delay no está disponible en iPhone/iPad. Probá desde una computadora o Android.
        </p>
      {/if}
      <DelayPanel disabled={!$currentStation || delayUnavailable} />
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
