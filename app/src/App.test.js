import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import App from './App.svelte';
import { currentStation, isPlaying, volume, delaySeconds, setDelay } from './lib/stores.js';
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

beforeEach(() => {
  localStorage.clear();
  currentStation.set(null);
  isPlaying.set(false);
  volume.set(1);
  setDelay(0);
  audioEngine.play.mockClear();
  audioEngine.play.mockResolvedValue(undefined);
  audioEngine.pause.mockClear();
  audioEngine.setDelaySeconds.mockClear();
  audioEngine.setGain.mockClear();

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

  it('leaves isPlaying false when the stream fails to start', async () => {
    audioEngine.play.mockRejectedValueOnce(new Error('boom'));
    const playBtn = await renderAndSelectLa100();
    await fireEvent.click(playBtn);
    expect(get(isPlaying)).toBe(false);
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
