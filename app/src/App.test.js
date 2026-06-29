import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import App from './App.svelte';
import { currentStation, isPlaying, isLoading, volume, delaySeconds, setDelay } from './lib/stores.js';
import { setLastStationId, setStationDelay, getLastStationId, getStationDelay } from './lib/persistence.js';

vi.mock('./lib/audioEngine.js', () => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  setDelaySeconds: vi.fn(),
  setGain: vi.fn(),
  getAnalyser: vi.fn(),
  getAudioElement: vi.fn(),
  isContextCreated: vi.fn(),
}));
import * as audioEngine from './lib/audioEngine.js';

vi.mock('./lib/stations.js', () => ({
  fetchStations: vi.fn(),
  getFallbackStreamUrl: vi.fn(),
}));
import { fetchStations, getFallbackStreamUrl } from './lib/stations.js';

vi.mock('./lib/platform.js', () => ({
  isIOS: vi.fn(),
}));
import { isIOS } from './lib/platform.js';

const TEST_STATIONS = [
  { id: 'rnacional', name: 'Radio Nacional', freq: 'AM 870 / FM 98.7 — Buenos Aires', stream: 'https://api.re-lata.com/stream/rnacional' },
  { id: 'rivadavia', name: 'Radio Rivadavia', freq: 'AM 630 — Buenos Aires', stream: 'https://api.re-lata.com/stream/rivadavia' },
  { id: 'continental', name: 'Radio Continental', freq: 'AM 590 — Buenos Aires', stream: 'https://api.re-lata.com/stream/continental' },
  { id: 'la990', name: 'La 990', freq: 'AM 990 — Buenos Aires', stream: 'https://api.re-lata.com/stream/la990' },
  { id: 'mitre', name: 'Radio Mitre', freq: 'AM 790 — Buenos Aires', stream: 'https://api.re-lata.com/stream/mitre' },
  { id: 'la100', name: 'La 100', freq: 'FM 99.9 — Buenos Aires', stream: 'https://api.re-lata.com/stream/la100' },
];

const TEST_FALLBACK_URLS = {
  rnacional: 'https://direct.example.com/rnacional',
  rivadavia: 'https://direct.example.com/rivadavia',
  continental: 'https://direct.example.com/continental',
  la990: 'https://direct.example.com/la990',
  mitre: 'https://direct.example.com/mitre',
  la100: 'https://direct.example.com/la100',
};

beforeEach(() => {
  localStorage.clear();
  currentStation.set(null);
  isPlaying.set(false);
  isLoading.set(false);
  volume.set(1);
  setDelay(0);
  audioEngine.play.mockClear();
  audioEngine.play.mockResolvedValue(undefined);
  audioEngine.pause.mockClear();
  audioEngine.setDelaySeconds.mockClear();
  audioEngine.setGain.mockClear();
  fetchStations.mockReset();
  fetchStations.mockResolvedValue({ stations: TEST_STATIONS, proxied: true });
  getFallbackStreamUrl.mockReset();
  getFallbackStreamUrl.mockImplementation((id) => TEST_FALLBACK_URLS[id]);
  isIOS.mockReset();
  isIOS.mockReturnValue(false);

  // jsdom doesn't implement canvas; Waveform's resize/draw logic needs a stub
  // 2d context so mounting it (via App) doesn't throw in tests.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }));
});

afterEach(() => cleanup());

describe('App mount', () => {
  it('fetches and renders all built-in stations', async () => {
    render(App);
    expect(await screen.findByText('Radio Nacional')).toBeTruthy();
    expect(screen.getByText('La 100')).toBeTruthy();
  });

  it('restores the last selected station and its saved delay', async () => {
    setLastStationId('la100');
    setStationDelay('la100', 8.5);
    render(App);
    await screen.findByText('Radio Nacional');
    expect(get(currentStation).id).toBe('la100');
    expect(get(delaySeconds)).toBe(8.5);
  });

  it('does not select any station when nothing was previously saved', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    expect(get(currentStation)).toBeNull();
  });
});

describe('selecting a station', () => {
  it('marks the clicked station as current and persists it as the last station', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    expect(get(currentStation).id).toBe('la100');
    expect(getLastStationId()).toBe('la100');
  });

  it("loads the newly selected station's own saved delay", async () => {
    setStationDelay('la100', 22.5);
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    expect(get(delaySeconds)).toBe(22.5);
  });

  it('defaults to 0s delay for a station with no saved value', async () => {
    setDelay(30);
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    expect(get(delaySeconds)).toBe(0);
  });
});

describe('play / pause', () => {
  async function renderAndSelectLa100() {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    return screen.getByLabelText('Play / Pause');
  }

  it('disables the play button until a station is selected', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    expect(screen.getByLabelText('Play / Pause').disabled).toBe(true);
    await fireEvent.click(screen.getByText('La 100'));
    expect(screen.getByLabelText('Play / Pause').disabled).toBe(false);
  });

  it('plays the current station and flips isPlaying on click', async () => {
    const playBtn = await renderAndSelectLa100();
    await fireEvent.click(playBtn);
    expect(audioEngine.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'la100' }));
    expect(get(isPlaying)).toBe(true);
  });

  it('pauses on a second click', async () => {
    const playBtn = await renderAndSelectLa100();
    await fireEvent.click(playBtn);
    await fireEvent.click(playBtn);
    expect(audioEngine.pause).toHaveBeenCalled();
    expect(get(isPlaying)).toBe(false);
  });

  it('switches the live stream immediately when selecting a new station while playing', async () => {
    const playBtn = await renderAndSelectLa100();
    await fireEvent.click(playBtn);
    await fireEvent.click(screen.getByText('Radio Nacional'));
    expect(audioEngine.play).toHaveBeenCalledTimes(2);
    expect(audioEngine.play).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'rnacional' }));
    expect(get(isPlaying)).toBe(true);
  });

  it('leaves isPlaying false and shows an unavailable message when both the stream and its fallback fail', async () => {
    audioEngine.play.mockRejectedValue(new Error('boom'));
    const playBtn = await renderAndSelectLa100();
    fireEvent.click(playBtn);
    await waitFor(() => expect(screen.getByText(/no está disponible/i)).toBeTruthy());
    expect(get(isPlaying)).toBe(false);
    expect(get(isLoading)).toBe(false);
    expect(audioEngine.play).toHaveBeenCalledTimes(2);
  });

  it('falls back to the direct upstream URL and still plays if the proxied stream fails', async () => {
    audioEngine.play.mockRejectedValueOnce(new Error('boom'));
    const playBtn = await renderAndSelectLa100();
    fireEvent.click(playBtn);
    await waitFor(() => expect(get(isPlaying)).toBe(true));
    expect(audioEngine.play).toHaveBeenCalledTimes(2);
    expect(audioEngine.play).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'la100', stream: 'https://direct.example.com/la100' })
    );
    expect(screen.queryByText(/no está disponible/i)).toBeNull();
  });

  it('clears a stale unavailable message when a different station is selected', async () => {
    audioEngine.play.mockRejectedValue(new Error('boom'));
    const playBtn = await renderAndSelectLa100();
    fireEvent.click(playBtn);
    await waitFor(() => expect(screen.getByText(/no está disponible/i)).toBeTruthy());

    await fireEvent.click(screen.getByText('Radio Nacional'));
    expect(screen.queryByText(/no está disponible/i)).toBeNull();
  });
});

describe('loading state', () => {
  async function renderAndSelectLa100() {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    return screen.getByLabelText('Play / Pause');
  }

  it('shows loading immediately after clicking play, then playing once the stream starts', async () => {
    let resolvePlay;
    audioEngine.play.mockImplementation(() => new Promise((resolve) => { resolvePlay = resolve; }));
    const playBtn = await renderAndSelectLa100();

    fireEvent.click(playBtn);
    await waitFor(() => expect(get(isLoading)).toBe(true));
    expect(get(isPlaying)).toBe(false);
    expect(playBtn.disabled).toBe(true);

    resolvePlay();
    await waitFor(() => expect(get(isPlaying)).toBe(true));
    expect(get(isLoading)).toBe(false);
  });

  it('pauses the current station and shows loading immediately when switching while playing', async () => {
    const playBtn = await renderAndSelectLa100();
    await fireEvent.click(playBtn);
    expect(get(isPlaying)).toBe(true);

    let resolveSecondPlay;
    audioEngine.play.mockImplementation(() => new Promise((resolve) => { resolveSecondPlay = resolve; }));
    fireEvent.click(screen.getByText('Radio Nacional'));

    await waitFor(() => expect(get(isLoading)).toBe(true));
    expect(get(isPlaying)).toBe(false);

    resolveSecondPlay();
    await waitFor(() => expect(get(isPlaying)).toBe(true));
  });
});

describe('loading extends through the configured delay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays loading until the configured delay has elapsed after the stream starts', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    setDelay(10);

    vi.useFakeTimers();
    await fireEvent.click(screen.getByLabelText('Play / Pause'));
    await vi.advanceTimersByTimeAsync(0);
    expect(get(isLoading)).toBe(true);
    expect(get(isPlaying)).toBe(false);

    await vi.advanceTimersByTimeAsync(9800);
    expect(get(isLoading)).toBe(true);
    expect(get(isPlaying)).toBe(false);

    await vi.advanceTimersByTimeAsync(300);
    expect(get(isLoading)).toBe(false);
    expect(get(isPlaying)).toBe(true);
  });

  it('shortens the remaining wait if the delay is reduced while still loading', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    setDelay(10);

    vi.useFakeTimers();
    await fireEvent.click(screen.getByLabelText('Play / Pause'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(get(isLoading)).toBe(true);

    setDelay(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(get(isLoading)).toBe(false);
    expect(get(isPlaying)).toBe(true);
  });
});

describe('increasing delay while already playing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops back into loading when the new delay outruns elapsed playback time', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));

    vi.useFakeTimers();
    await fireEvent.click(screen.getByLabelText('Play / Pause'));
    await vi.advanceTimersByTimeAsync(0);
    expect(get(isPlaying)).toBe(true);
    expect(get(isLoading)).toBe(false);

    // only 3s of real playback so far; raising the delay past that asks
    // the delayNode for history it hasn't buffered yet
    await vi.advanceTimersByTimeAsync(3000);
    setDelay(10);
    await vi.advanceTimersByTimeAsync(0);
    expect(get(isLoading)).toBe(true);
    expect(get(isPlaying)).toBe(false);
    expect(screen.getByLabelText('Play / Pause').disabled).toBe(true);

    await vi.advanceTimersByTimeAsync(6800);
    expect(get(isLoading)).toBe(true);
    expect(get(isPlaying)).toBe(false);

    await vi.advanceTimersByTimeAsync(300);
    expect(get(isLoading)).toBe(false);
    expect(get(isPlaying)).toBe(true);
  });

  it('does not show loading when the new delay is still under elapsed playback time', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));

    vi.useFakeTimers();
    await fireEvent.click(screen.getByLabelText('Play / Pause'));
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(10000);
    setDelay(5);
    await vi.advanceTimersByTimeAsync(0);
    expect(get(isLoading)).toBe(false);
    expect(get(isPlaying)).toBe(true);
  });
});

describe('delay and volume wiring', () => {
  it('pushes delay changes to the audio engine and persists them for the current station', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.click(screen.getByText('La 100'));
    await fireEvent.input(screen.getByLabelText('Delay slider'), { target: { value: '12.3' } });
    expect(audioEngine.setDelaySeconds).toHaveBeenCalledWith(12.3);
    expect(getStationDelay('la100')).toBe(12.3);
  });

  it('pushes volume changes to the audio engine', async () => {
    render(App);
    await screen.findByText('Radio Nacional');
    await fireEvent.input(screen.getByLabelText('Volumen'), { target: { value: '0.4' } });
    expect(audioEngine.setGain).toHaveBeenCalledWith(0.4);
    expect(get(volume)).toBe(0.4);
  });
});

describe('delay availability on iOS when the proxy is down', () => {
  it('shows a notice and disables the delay panel when on iOS and the proxy fell back', async () => {
    isIOS.mockReturnValue(true);
    fetchStations.mockResolvedValue({ stations: TEST_STATIONS, proxied: false });
    render(App);
    await screen.findByText('Radio Nacional');
    expect(screen.getByText(/delay no está disponible/i)).toBeTruthy();
    expect(screen.getByLabelText('Delay slider').disabled).toBe(true);
  });

  it('does not show the notice when the proxy is up, even on iOS', async () => {
    isIOS.mockReturnValue(true);
    fetchStations.mockResolvedValue({ stations: TEST_STATIONS, proxied: true });
    render(App);
    await screen.findByText('Radio Nacional');
    expect(screen.queryByText(/delay no está disponible/i)).toBeNull();
    expect(screen.getByLabelText('Delay slider').disabled).toBe(false);
  });

  it('does not show the notice on non-iOS even when the proxy fell back', async () => {
    isIOS.mockReturnValue(false);
    fetchStations.mockResolvedValue({ stations: TEST_STATIONS, proxied: false });
    render(App);
    await screen.findByText('Radio Nacional');
    expect(screen.queryByText(/delay no está disponible/i)).toBeNull();
    expect(screen.getByLabelText('Delay slider').disabled).toBe(false);
  });
});
