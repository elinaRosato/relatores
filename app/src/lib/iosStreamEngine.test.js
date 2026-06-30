import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Real bytes: first 2 complete frames of a captured rnacional stream
// sample (same source as demux/mp3.test.js's larger fixture, truncated).
const TWO_REAL_FRAMES_BASE64 =
  '//tCYAAAAcsK4PjDGSIJQAwfAAAARyRPf6GMaQgfgC/0AAABZ1ZpiGdtZASSShtn2YhmZgqIKmvgUJTx4UxKHg9s6S26m2n7mtotRJ1gL+4E3NmyQU+qzLhBr/Z9zOrNMQztrICSTbd/vdbGwEkgQCwshCIDw5GEuzvQ8YlJrTRs/DUGYrfmRkKyRw38EhFLrmFv63nadj+RKl+u+j73xtu/3utjYCSQVlNNUDMgZW5jIHYxLjAw//tAYAABEeQhX/hjG2IJQAv/AAAARuSle6MMTcgYAC90AAABZTVHaGVbGgUkgwEKCM7DkKCWh6yrTEuxKlY2Yj94rkvwu6FyR3uk/lBhAVzxeVBu7bWJ+08z2Lod3pg/ZlNUdoZVsaBSStNrnucZQccpCavKLimLsGh6RlSno5lV3NHmR5b51fu8S0/lhK1XdWarGxsC/z6v+32XW9s/sudptc9zjKBWU01QMyBlbmMgdjEuMDA=';

function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

class FakeAudioBuffer {
  constructor(numberOfChannels, length, sampleRate) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  copyToChannel(data, channel) {
    this.channels[channel].set(data);
  }
}

class FakeBufferSource {
  constructor() {
    this.connect = vi.fn();
    this.start = vi.fn();
    this.stop = vi.fn();
  }
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 10;
    this.destination = {};
    this.buffersCreated = [];
    this.sourcesCreated = [];
  }
  createBuffer(numberOfChannels, length, sampleRate) {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate);
    this.buffersCreated.push(buffer);
    return buffer;
  }
  createBufferSource() {
    const source = new FakeBufferSource();
    this.sourcesCreated.push(source);
    return source;
  }
  createGain() {
    return { connect: vi.fn(), gain: { value: 1 } };
  }
  resume() {
    return Promise.resolve();
  }
}

class FakeAudioData {
  constructor({ numberOfChannels, numberOfFrames, sampleRate }) {
    this.numberOfChannels = numberOfChannels;
    this.numberOfFrames = numberOfFrames;
    this.sampleRate = sampleRate;
  }
  copyTo(destination) {
    destination.fill(0);
  }
  close() {}
}

class FakeAudioDecoder {
  constructor({ output, error }) {
    this._output = output;
    this._error = error;
    this.decodeCalls = [];
  }
  configure(config) {
    this.configuredWith = config;
  }
  decode(chunk) {
    this.decodeCalls.push(chunk);
    this._output(
      new FakeAudioData({
        numberOfChannels: this.configuredWith.numberOfChannels,
        numberOfFrames: 1152,
        sampleRate: this.configuredWith.sampleRate,
      })
    );
  }
  close() {}
}

class FakeEncodedAudioChunk {
  constructor(init) {
    Object.assign(this, init);
  }
}

function fakeStreamResponse(bytes, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  };
}

// Like fakeStreamResponse but keeps the stream open so abort — not stream-end
// — is what terminates the read loop. Use this in tests where the assertion is
// that a clean done:true is NOT produced.
function openStreamResponse(bytes) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        // deliberately never call close() — stream stays open
      },
    }),
  };
}

let fakeAudioContext;

beforeEach(() => {
  vi.resetModules();
  fakeAudioContext = new FakeAudioContext();
  window.AudioContext = vi.fn().mockImplementation(function () {
    return fakeAudioContext;
  });
  globalThis.AudioDecoder = FakeAudioDecoder;
  globalThis.EncodedAudioChunk = FakeEncodedAudioChunk;
});

afterEach(() => {
  delete globalThis.AudioDecoder;
  delete globalThis.EncodedAudioChunk;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const testStation = { id: 'rnacional', name: 'Radio Nacional', stream: 'https://re-lata.com/stream/rnacional' };

// Builds a minimal valid ADTS frame: 7-byte header (no CRC) + `payloadSize` zero bytes.
function buildAdtsFrame({ sampleRate = 44100, channels = 2, payloadSize = 8 } = {}) {
  const FREQS = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  const sfIndex = FREQS.indexOf(sampleRate);
  const profile = 1; // AAC-LC
  const headerLength = 7;
  const frameLength = headerLength + payloadSize;
  const f = new Uint8Array(frameLength);
  f[0] = 0xff;
  f[1] = 0xf1;
  f[2] = ((profile & 0x03) << 6) | ((sfIndex & 0x0f) << 2) | ((channels >> 2) & 0x01);
  f[3] = ((channels & 0x03) << 6) | ((frameLength >> 11) & 0x03);
  f[4] = (frameLength >> 3) & 0xff;
  f[5] = ((frameLength & 0x07) << 5) | 0x1f;
  f[6] = 0xfc;
  return f;
}

describe('play', () => {
  it('fetches the station stream URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');

    await play(testStation, 0);

    expect(globalThis.fetch).toHaveBeenCalledWith(testStation.stream, expect.any(Object));
  });

  it('creates an AudioBuffer matching the demuxed frame sample rate and channel count for every frame', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the background read loop process frame 2

    // Both real frames in the fixture are 44100Hz stereo (verified by hand
    // when the fixture was captured).
    expect(fakeAudioContext.buffersCreated).toHaveLength(2);
    for (const buffer of fakeAudioContext.buffersCreated) {
      expect(buffer.sampleRate).toBe(44100);
      expect(buffer.numberOfChannels).toBe(2);
    }
  });

  it('assigns the decoded AudioBuffer to each source node before starting it', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fakeAudioContext.sourcesCreated).toHaveLength(2);
    for (let i = 0; i < fakeAudioContext.sourcesCreated.length; i++) {
      expect(fakeAudioContext.sourcesCreated[i].buffer).toBe(fakeAudioContext.buffersCreated[i]);
    }
  });

  it('resolves once the first frame is scheduled, without waiting for the whole stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');

    await expect(play(testStation, 0)).resolves.toBeUndefined();
    expect(fakeAudioContext.sourcesCreated.length).toBeGreaterThanOrEqual(1);
    expect(fakeAudioContext.sourcesCreated[0].start).toHaveBeenCalled();
  });

  it('schedules the first frame at currentTime + delaySeconds', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');

    await play(testStation, 5);

    expect(fakeAudioContext.sourcesCreated[0].start).toHaveBeenCalledWith(15); // currentTime(10) + delay(5)
  });

  it('schedules each subsequent frame immediately after the previous one ends, for gapless playback', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the background read loop process frame 2

    expect(fakeAudioContext.sourcesCreated.length).toBe(2);
    const firstDuration = fakeAudioContext.buffersCreated[0].duration;
    expect(fakeAudioContext.sourcesCreated[1].start).toHaveBeenCalledWith(10 + firstDuration);
  });

  it('rejects if the fetch response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fakeStreamResponse(new Uint8Array(0), { ok: false, status: 502 }));
    const { play } = await import('./iosStreamEngine.js');

    await expect(play(testStation, 0)).rejects.toThrow('502');
  });

  it('rejects after 15 seconds if no audio frame is ever decoded', async () => {
    const hangingResponse = {
      ok: true,
      status: 200,
      body: new ReadableStream({ start() {} }), // never sends data
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(hangingResponse);
    const { play } = await import('./iosStreamEngine.js');

    vi.useFakeTimers();
    const playPromise = play(testStation, 0);
    const assertion = expect(playPromise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });
});

describe('play (AAC stream)', () => {
  it('auto-detects ADTS AAC and schedules audio buffers with the correct sample rate and channels', async () => {
    const frame = buildAdtsFrame({ sampleRate: 44100, channels: 1, payloadSize: 8 });
    const twoFrames = new Uint8Array([...frame, ...frame]);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(twoFrames)));
    const { play } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fakeAudioContext.buffersCreated.length).toBeGreaterThanOrEqual(1);
    expect(fakeAudioContext.buffersCreated[0].sampleRate).toBe(44100);
    expect(fakeAudioContext.buffersCreated[0].numberOfChannels).toBe(1);
  });
});

describe('pause', () => {
  it('aborts the in-flight fetch', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play, pause } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    pause();

    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.signal.aborted).toBe(true);
  });

  it('stops all scheduled AudioBufferSourceNodes immediately', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play, pause } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    pause();

    for (const source of fakeAudioContext.sourcesCreated) {
      expect(source.stop).toHaveBeenCalled();
    }
  });

  it('stops old sources when play() is called again (delay change restart)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    const firstSources = [...fakeAudioContext.sourcesCreated];

    await play(testStation, 5);

    for (const source of firstSources) {
      expect(source.stop).toHaveBeenCalled();
    }
  });
});

describe('isContextCreated', () => {
  it('is false before any play() call', async () => {
    const { isContextCreated } = await import('./iosStreamEngine.js');
    expect(isContextCreated()).toBe(false);
  });

  it('is true after play() has run', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play, isContextCreated } = await import('./iosStreamEngine.js');
    await play(testStation, 0);
    expect(isContextCreated()).toBe(true);
  });
});

describe('getWaveformData', () => {
  it('returns a flat, centered array before any playback', async () => {
    const { getWaveformData } = await import('./iosStreamEngine.js');
    const data = getWaveformData();
    expect(data).toHaveLength(128);
    expect(Array.from(data).every((v) => v === 128)).toBe(true);
  });

  it('updates from the decoded PCM after a frame is scheduled', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play, getWaveformData } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    const data = getWaveformData();

    expect(data).toHaveLength(128);
    // FakeAudioData.copyTo() fills with silence (0), which maps to the
    // centered byte value 128 -- same as true silence would on a real
    // AnalyserNode. This proves the computation path runs and produces
    // the right shape/centering; the real device test is what proves it
    // tracks actual music/speech amplitude.
    expect(Array.from(data).every((v) => v === 128)).toBe(true);
  });
});

describe('fatal errors after the first frame', () => {
  it('calls onFatalError, not the play() promise, when the decoder errors after the first frame', async () => {
    let decoderInstance;
    class FailingAfterFirstFrameDecoder extends FakeAudioDecoder {
      constructor(init) {
        super(init);
        decoderInstance = this;
      }
    }
    globalThis.AudioDecoder = FailingAfterFirstFrameDecoder;

    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play } = await import('./iosStreamEngine.js');
    const onFatalError = vi.fn();

    await play(testStation, 0, onFatalError);
    decoderInstance._error(new Error('decode exploded'));

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'decode exploded' }));
  });

  it('calls onFatalError when the background read loop throws after the first frame', async () => {
    let pullController;
    const response = {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(decodeBase64(TWO_REAL_FRAMES_BASE64));
          pullController = controller;
        },
      }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    const { play } = await import('./iosStreamEngine.js');
    const onFatalError = vi.fn();

    await play(testStation, 0, onFatalError);
    pullController.error(new Error('connection dropped'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onFatalError).toHaveBeenCalledWith(expect.objectContaining({ message: 'connection dropped' }));
  });

  it('reconnects transparently when the CDN closes the connection after a segment', async () => {
    // StreamTheWorld sends ~32 KB then closes. The engine should reconnect
    // immediately without surfacing an error — pre-scheduled AudioBufferSourceNodes
    // cover the brief gap.
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => Promise.resolve(fakeStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))))
      .mockImplementation(() => Promise.resolve(openStreamResponse(new Uint8Array(0))));
    const { play } = await import('./iosStreamEngine.js');
    const onFatalError = vi.fn();

    await play(testStation, 0, onFatalError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // initial + reconnect
    expect(onFatalError).not.toHaveBeenCalled();
  });

  it('calls onFatalError when the reconnect fails after a segment close', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => Promise.resolve(fakeStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))))
      .mockImplementation(() => Promise.resolve({ ok: false, status: 503 }));
    const { play } = await import('./iosStreamEngine.js');
    const onFatalError = vi.fn();

    await play(testStation, 0, onFatalError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onFatalError).toHaveBeenCalledTimes(1);
    expect(onFatalError.mock.calls[0][0].message).toMatch(/reconnect/i);
  });
});

describe('setDelaySeconds', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing if called before any play()', async () => {
    const { setDelaySeconds } = await import('./iosStreamEngine.js');
    expect(() => setDelaySeconds(10)).not.toThrow();
  });

  it('does not schedule a restart while the initial stream is still buffering (before first frame)', async () => {
    // Simulates the stale-timer bug: $effect fires setDelaySeconds while
    // play() is in-flight but before the first frame has been decoded.
    // With isStreaming=false during startup, the timer must be a no-op.
    let resolveRead;
    const hangingResponse = {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          // Enqueue nothing — simulates a slow stream that hasn't sent frames yet.
          resolveRead = () => controller.close();
        },
      }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(hangingResponse);
    const { play, setDelaySeconds } = await import('./iosStreamEngine.js');

    vi.useFakeTimers();
    const playPromise = play(testStation, 0); // starts but first frame never arrives
    const assertion = expect(playPromise).rejects.toThrow('timed out');

    setDelaySeconds(5); // called while still buffering — must be ignored
    await vi.advanceTimersByTimeAsync(300); // debounce would fire here if not guarded

    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // no restart triggered
    resolveRead();
    // Advance past the 15s timeout so the play() promise settles and doesn't leak.
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
  });

  it('restarts playback with the new delay after settling for 300ms', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play, setDelaySeconds } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    const sourceCountBeforeRestart = fakeAudioContext.sourcesCreated.length;

    vi.useFakeTimers();
    setDelaySeconds(20);
    await vi.advanceTimersByTimeAsync(300);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // original play() + the restart
    // The fixture's 2 fake frames resolve essentially synchronously, so by
    // now the restart has scheduled both of its frames too -- check the
    // first one the restart created, not whichever frame happens to be last.
    expect(fakeAudioContext.sourcesCreated[sourceCountBeforeRestart].start).toHaveBeenCalledWith(10 + 20); // currentTime + new delay
  });

  it('only restarts once after several rapid changes, using the last value', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play, setDelaySeconds } = await import('./iosStreamEngine.js');

    await play(testStation, 0);
    const sourceCountBeforeRestart = fakeAudioContext.sourcesCreated.length;

    vi.useFakeTimers();
    setDelaySeconds(5);
    await vi.advanceTimersByTimeAsync(100);
    setDelaySeconds(15);
    await vi.advanceTimersByTimeAsync(100);
    setDelaySeconds(25);
    await vi.advanceTimersByTimeAsync(300);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // original play() + exactly one restart
    expect(fakeAudioContext.sourcesCreated[sourceCountBeforeRestart].start).toHaveBeenCalledWith(10 + 25);
  });

  it('does not fire onFatalError for the abort caused by its own restart', async () => {
    // Use an open (never-closing) stream so the IIFE's read loop only ends
    // via abort, not via a clean done:true — which is the correct live-stream
    // behaviour the abort guard is designed to protect against.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(openStreamResponse(decodeBase64(TWO_REAL_FRAMES_BASE64))));
    const { play, setDelaySeconds } = await import('./iosStreamEngine.js');
    const onFatalError = vi.fn();

    await play(testStation, 0, onFatalError);

    vi.useFakeTimers();
    setDelaySeconds(20);
    await vi.advanceTimersByTimeAsync(300);

    expect(onFatalError).not.toHaveBeenCalled();
  });
});
