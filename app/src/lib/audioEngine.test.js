import { describe, it, expect, vi, beforeEach } from 'vitest';

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  createMediaElementSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createDelay = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), delayTime: { value: 0 } }));
  createGain() {
    return { connect: vi.fn(), gain: { value: 1 } };
  }
  createAnalyser() {
    return { connect: vi.fn(), disconnect: vi.fn(), fftSize: 0 };
  }
  resume() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  vi.resetModules();
  window.AudioContext = vi.fn().mockImplementation(function () {
    return new FakeAudioContext();
  });
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

const testStation = { id: 'x', name: 'Test Station', stream: 'https://example.com/x.mp3' };

describe('gesture gating', () => {
  it('does not create an AudioContext on import', async () => {
    const { isContextCreated } = await import('./audioEngine.js');
    expect(isContextCreated()).toBe(false);
    expect(window.AudioContext).not.toHaveBeenCalled();
  });

  it('creates the AudioContext only when play() is called', async () => {
    const { play, isContextCreated } = await import('./audioEngine.js');
    expect(window.AudioContext).not.toHaveBeenCalled();
    await play(testStation);
    expect(isContextCreated()).toBe(true);
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
  });

  it('reuses the same AudioContext across multiple play() calls', async () => {
    const { play } = await import('./audioEngine.js');
    await play(testStation);
    await play(testStation);
    expect(window.AudioContext).toHaveBeenCalledTimes(1);
  });
});

describe('crossorigin', () => {
  it('sets crossorigin=anonymous on the audio element', async () => {
    const { play, getAudioElement } = await import('./audioEngine.js');
    await play(testStation);
    expect(getAudioElement().crossOrigin).toBe('anonymous');
  });
});

describe('delay and gain control', () => {
  it('is a no-op when called before any playback has started', async () => {
    const { setDelaySeconds, setGain } = await import('./audioEngine.js');
    expect(() => setDelaySeconds(10)).not.toThrow();
    expect(() => setGain(0.5)).not.toThrow();
  });

  it('updates the delay node when setDelaySeconds is called', async () => {
    const { play, setDelaySeconds, getDelayTimeValue } = await import('./audioEngine.js');
    await play(testStation);
    setDelaySeconds(12.3);
    expect(getDelayTimeValue()).toBe(12.3);
  });

  it('updates the gain node when setGain is called', async () => {
    const { play, setGain, getGainValue } = await import('./audioEngine.js');
    await play(testStation);
    setGain(0.5);
    expect(getGainValue()).toBe(0.5);
  });
});

describe('pause does not let buffered delayed audio keep draining out', () => {
  it('disconnects the output from the destination on pause', async () => {
    const { play, pause, getAnalyser } = await import('./audioEngine.js');
    await play(testStation);
    pause();
    expect(getAnalyser().disconnect).toHaveBeenCalled();
  });

  it('reconnects the output when playing again after a pause', async () => {
    const { play, pause, getAnalyser } = await import('./audioEngine.js');
    await play(testStation);
    pause();
    getAnalyser().connect.mockClear();
    await play(testStation);
    expect(getAnalyser().connect).toHaveBeenCalledWith(expect.anything());
  });

  it('rebuilds the delay node on every play() so a previous session\'s buffered audio cannot resurface', async () => {
    const { play, pause } = await import('./audioEngine.js');
    await play(testStation);
    pause();
    await play(testStation);
    const ctxInstance = window.AudioContext.mock.results[0].value;
    expect(ctxInstance.createDelay).toHaveBeenCalledTimes(2);
  });

  it('preserves the configured delay value across the rebuild', async () => {
    const { play, pause, setDelaySeconds, getDelayTimeValue } = await import('./audioEngine.js');
    await play(testStation);
    setDelaySeconds(12.3);
    pause();
    await play(testStation);
    expect(getDelayTimeValue()).toBe(12.3);
  });
});

describe('background audio', () => {
  it('sets navigator.audioSession.type to "play" when the API is available', async () => {
    navigator.audioSession = { type: '' };
    const { play } = await import('./audioEngine.js');
    await play(testStation);
    expect(navigator.audioSession.type).toBe('play');
    delete navigator.audioSession;
  });

  it('does not throw when navigator.audioSession is unavailable', async () => {
    delete navigator.audioSession;
    const { play } = await import('./audioEngine.js');
    await expect(play(testStation)).resolves.not.toThrow();
  });

  it('resumes a suspended AudioContext when the page becomes visible again', async () => {
    const { play } = await import('./audioEngine.js');
    await play(testStation);
    const ctxInstance = window.AudioContext.mock.results[0].value;
    ctxInstance.state = 'suspended';
    ctxInstance.resume = vi.fn(() => Promise.resolve());
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctxInstance.resume).toHaveBeenCalled();
  });
});
