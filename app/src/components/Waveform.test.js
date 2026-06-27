import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Waveform from './Waveform.svelte';
import { isPlaying, currentStation } from '../lib/stores.js';

vi.mock('../lib/audioEngine.js', () => ({
  getAnalyser: vi.fn(),
}));
import { getAnalyser } from '../lib/audioEngine.js';

const fakeStation = { id: 'x', name: 'Test Station', freq: 'AM 000', stream: 'https://example.com/x' };

let fakeCtx;

beforeEach(() => {
  fakeCtx = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    scale: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx);
  window.requestAnimationFrame = vi.fn(() => 1);
  window.cancelAnimationFrame = vi.fn();
  getAnalyser.mockReturnValue(undefined);
});

afterEach(() => {
  cleanup();
  isPlaying.set(false);
  currentStation.set(null);
});

describe('Waveform idle state', () => {
  it('shows the idle prompt when no station is selected', () => {
    render(Waveform);
    expect(screen.getByText('Seleccioná una radio para comenzar')).toBeTruthy();
  });

  it('hides the idle prompt once a station is selected, even before playback starts', () => {
    currentStation.set(fakeStation);
    render(Waveform);
    expect(screen.queryByText('Seleccioná una radio para comenzar')).toBeNull();
  });

  it('hides the idle prompt while playing', () => {
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    expect(screen.queryByText('Seleccioná una radio para comenzar')).toBeNull();
  });

  it('draws a flat line instead of the idle prompt when a station is selected but not playing', () => {
    currentStation.set(fakeStation);
    render(Waveform);
    expect(fakeCtx.moveTo).toHaveBeenCalled();
    expect(fakeCtx.lineTo).toHaveBeenCalled();
    expect(fakeCtx.stroke).toHaveBeenCalled();
  });
});

describe('Waveform animation lifecycle', () => {
  const fakeAnalyser = { frequencyBinCount: 4, getByteTimeDomainData: vi.fn() };

  it('does not start the animation loop while idle', () => {
    render(Waveform);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('starts the animation loop when playback begins', () => {
    getAnalyser.mockReturnValue(fakeAnalyser);
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it('cancels the animation loop when playback stops', async () => {
    getAnalyser.mockReturnValue(fakeAnalyser);
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    isPlaying.set(false);
    await Promise.resolve();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it('clears the canvas when playback stops, instead of leaving the last frame frozen', async () => {
    getAnalyser.mockReturnValue(fakeAnalyser);
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    fakeCtx.clearRect.mockClear();
    isPlaying.set(false);
    await Promise.resolve();
    expect(fakeCtx.clearRect).toHaveBeenCalled();
  });

  it('cancels the animation loop on unmount while still playing', () => {
    getAnalyser.mockReturnValue(fakeAnalyser);
    currentStation.set(fakeStation);
    isPlaying.set(true);
    const { unmount } = render(Waveform);
    unmount();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });
});

describe('Waveform drawing', () => {
  const fakeAnalyser = { frequencyBinCount: 4, getByteTimeDomainData: vi.fn() };

  it('reads time-domain data from the analyser on each frame', () => {
    getAnalyser.mockReturnValue(fakeAnalyser);
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    expect(fakeAnalyser.getByteTimeDomainData).toHaveBeenCalled();
  });

  it('strokes the waveform with the sky-blue/gold brand gradient', () => {
    getAnalyser.mockReturnValue(fakeAnalyser);
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    const gradient = fakeCtx.createLinearGradient.mock.results[0].value;
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, '#4FC3F7');
    expect(gradient.addColorStop).toHaveBeenCalledWith(0.5, '#F5C518');
    expect(fakeCtx.stroke).toHaveBeenCalled();
  });
});

describe('Waveform canvas sizing', () => {
  const fakeAnalyser = { frequencyBinCount: 4, getByteTimeDomainData: vi.fn() };

  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 56,
    });
    window.devicePixelRatio = 2;
    getAnalyser.mockReturnValue(fakeAnalyser);
  });

  afterEach(() => {
    delete window.devicePixelRatio;
  });

  it('sizes the canvas backing buffer to its CSS size scaled by devicePixelRatio', () => {
    currentStation.set(fakeStation);
    isPlaying.set(true);
    const { container } = render(Waveform);
    const canvas = container.querySelector('canvas');
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(112);
    expect(fakeCtx.scale).toHaveBeenCalledWith(2, 2);
  });

  it('resizes the canvas when the window resizes', () => {
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    const callsBefore = fakeCtx.scale.mock.calls.length;
    window.dispatchEvent(new Event('resize'));
    expect(fakeCtx.scale.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('removes the resize listener when the component unmounts', () => {
    currentStation.set(fakeStation);
    isPlaying.set(true);
    const { unmount } = render(Waveform);
    unmount();
    const callsBefore = fakeCtx.scale.mock.calls.length;
    window.dispatchEvent(new Event('resize'));
    expect(fakeCtx.scale.mock.calls.length).toBe(callsBefore);
  });

  // Resizing a canvas (setting .width/.height) wipes its bitmap. Mobile
  // browsers fire `resize` on scroll as the address bar collapses/expands,
  // so without a repaint here the flat-line idle state goes blank until the
  // next play() restarts the rAF loop.
  it('redraws the flat line after a resize while paused, instead of leaving the canvas blank', () => {
    currentStation.set(fakeStation);
    isPlaying.set(false);
    render(Waveform);
    fakeCtx.moveTo.mockClear();
    fakeCtx.lineTo.mockClear();
    fakeCtx.stroke.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(fakeCtx.moveTo).toHaveBeenCalled();
    expect(fakeCtx.stroke).toHaveBeenCalled();
  });

  it('does not redraw on resize while playing, leaving the next animation frame to repaint', () => {
    currentStation.set(fakeStation);
    isPlaying.set(true);
    render(Waveform);
    fakeCtx.moveTo.mockClear();
    fakeCtx.stroke.mockClear();
    window.dispatchEvent(new Event('resize'));
    expect(fakeCtx.moveTo).not.toHaveBeenCalled();
  });
});
