import { createMp3FrameParser } from './demux/mp3.js';
import { createAacFrameParser } from './demux/aac.js';

let audioCtx = null;
let gainNode = null;
let currentAbortController = null;
let currentStation = null;
let currentOnFatalError = null;
let delayChangeTimer = null;
let activeSources = [];
let isStreaming = false; // true only after the first frame of a session is scheduled

const WAVEFORM_SAMPLE_COUNT = 128;
let waveformBytes = new Uint8Array(WAVEFORM_SAMPLE_COUNT).fill(128);

export function getWaveformData() {
  return waveformBytes;
}

function computeWaveformBytes(channelData) {
  const bytes = new Uint8Array(WAVEFORM_SAMPLE_COUNT);
  const step = Math.max(1, Math.floor(channelData.length / WAVEFORM_SAMPLE_COUNT));
  for (let i = 0; i < WAVEFORM_SAMPLE_COUNT; i++) {
    const sample = channelData[i * step] ?? 0; // Float32, range [-1, 1]
    const clamped = Math.max(-1, Math.min(1, sample));
    bytes[i] = Math.round((clamped + 1) * 127.5); // centered at 128, like AnalyserNode's time-domain bytes
  }
  return bytes;
}

function stopAllSources() {
  for (const source of activeSources) {
    try { source.stop(); } catch (_) {}
  }
  activeSources = [];
}

function ensureContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
}

// Must be called synchronously within the user gesture that triggers playback.
// Must be called synchronously within the user gesture that triggers playback.
// Sets 'playback' audio session before creating the context so iOS routes audio
// through the speaker even when the hardware mute switch is on. Then plays a
// 1-sample silent buffer — iOS Safari requires an actual audio operation, not
// just resume(), to fully activate the context.
export function warmContext() {
  if (navigator.audioSession) navigator.audioSession.type = 'playback';
  ensureContext();
  if (audioCtx.state === 'running') return;
  const silence = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
  const unlock = audioCtx.createBufferSource();
  unlock.buffer = silence;
  unlock.connect(audioCtx.destination);
  unlock.start(0);
  audioCtx.resume().catch(() => {});
}

export function isContextCreated() {
  return audioCtx !== null;
}

export function setGain(value) {
  if (gainNode) gainNode.gain.value = value;
}

function audioDataToBuffer(audioData) {
  const buffer = audioCtx.createBuffer(audioData.numberOfChannels, audioData.numberOfFrames, audioData.sampleRate);
  const channelData = new Float32Array(audioData.numberOfFrames);
  for (let channel = 0; channel < audioData.numberOfChannels; channel++) {
    audioData.copyTo(channelData, { planeIndex: channel, format: 'f32-planar' });
    buffer.copyToChannel(channelData, channel);
    if (channel === 0) waveformBytes = computeWaveformBytes(channelData);
  }
  audioData.close();
  return buffer;
}

export async function play(station, delaySeconds, onFatalError) {
  currentStation = station;
  currentOnFatalError = onFatalError;
  // Reset before any await so Svelte effects that fire during audioCtx.resume()
  // see isStreaming=false and don't schedule a stale delay-change restart.
  if (currentAbortController) currentAbortController.abort();
  if (delayChangeTimer) { clearTimeout(delayChangeTimer); delayChangeTimer = null; }
  stopAllSources();
  isStreaming = false;
  ensureContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  const abortController = new AbortController();
  currentAbortController = abortController;

  const response = await fetch(station.stream, { signal: abortController.signal });
  if (!response.ok) {
    throw new Error(`Stream responded with ${response.status}`);
  }

  let mp3Parser = createMp3FrameParser();
  let aacParser = createAacFrameParser();
  let detectedFormat = null; // 'mp3' | 'aac' | null while probing
  let samplesPerFrame = 1152; // updated on first frame: 1152 for MP3, 1024 for AAC
  let reader = response.body.getReader();
  let totalBytesReceived = 0; // used for Range: bytes=N- on reconnect

  let decoder;
  let configured = false;
  let nextStartTime = null;
  let firstFrameAudioTime = null; // audio-context time when the first frame is scheduled to play
  let frameTimestampUs = 0;
  let resolveFirstFrame;
  let rejectFirstFrame;
  let firstFrameSettled = false;
  let firstFrameTimeout = setTimeout(() => {
    if (!firstFrameSettled) {
      firstFrameSettled = true;
      rejectFirstFrame(new Error('Stream timed out — no audio frames received'));
    }
  }, 15000);
  const firstFrameScheduled = new Promise((resolve, reject) => {
    resolveFirstFrame = resolve;
    rejectFirstFrame = reject;
  });

  function handleFatalError(err) {
    clearTimeout(firstFrameTimeout);
    if (!firstFrameSettled) {
      firstFrameSettled = true;
      rejectFirstFrame(err);
    } else if (onFatalError) {
      onFatalError(err);
    }
  }

  decoder = new AudioDecoder({
    output: (audioData) => {
      const buffer = audioDataToBuffer(audioData);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      if (nextStartTime === null) {
        nextStartTime = audioCtx.currentTime + delaySeconds;
        firstFrameAudioTime = nextStartTime;
      }
      activeSources.push(source);
      source.onended = () => { activeSources = activeSources.filter((s) => s !== source); };
      source.start(nextStartTime);
      nextStartTime += buffer.duration;
      if (!firstFrameSettled) {
        firstFrameSettled = true;
        isStreaming = true;
        clearTimeout(firstFrameTimeout);
        resolveFirstFrame();
      }
    },
    error: handleFatalError,
  });

  (async () => {
    try {
      while (!abortController.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          if (abortController.signal.aborted) break;
          if (!firstFrameSettled) break; // 15 s timeout handles the pre-first-frame case
          // StreamTheWorld CDN closes after ~32 KB, expecting the client to reconnect.
          //
          // Two-part fix to avoid the "scratched disk" repetition effect:
          //
          // 1. TIMING: wait until ~1.5 s of pre-scheduled audio remains before reconnecting.
          //    The CDN serves a rolling ~2 s live buffer, so waiting lets its window advance
          //    before we fetch again — reducing content overlap without Range support.
          //    1.5 s also provides headroom for cold CDN connections (400-600 ms on mobile).
          //
          //    IMPORTANT: use `firstFrameAudioTime` (when playback *starts*, not when frames
          //    are scheduled) to measure remaining buffer. With delay > 0, `nextStartTime` is
          //    delaySeconds ahead of `currentTime`, which would give a wildly inflated
          //    bufferRemaining and a correspondingly long wait — during which the CDN's live
          //    window moves on by delaySeconds, causing a content jump on reconnect.
          //
          //    (In tests, fake frames are ~26 ms each so bufferRemaining < 1.5 s → waitMs=0.)
          //
          // 2. RANGE: bytes=N- tells the CDN to pick up exactly where we left off, eliminating
          //    overlap entirely for CDNs that honour byte-range requests on live streams
          //    (StreamTheWorld advertises Accept-Ranges: bytes).
          const playStartsAt = firstFrameAudioTime ?? audioCtx.currentTime;
          const bufferRemaining = (nextStartTime ?? audioCtx.currentTime)
            - Math.max(audioCtx.currentTime, playStartsAt);
          const RECONNECT_AHEAD_S = 1.5;
          const waitMs = Math.max(0, (bufferRemaining - RECONNECT_AHEAD_S) * 1000);
          if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
          if (abortController.signal.aborted) break;
          try {
            const newResponse = await fetch(station.stream, {
              signal: abortController.signal,
              headers: { Range: `bytes=${totalBytesReceived}-` },
            });
            if (!newResponse.ok) {
              handleFatalError(new Error(`Reconnect failed: ${newResponse.status}`));
              break;
            }
            reader = newResponse.body.getReader();
            if (detectedFormat === 'mp3') mp3Parser = createMp3FrameParser();
            else if (detectedFormat === 'aac') aacParser = createAacFrameParser();
            continue;
          } catch (err) {
            if (!abortController.signal.aborted) handleFatalError(err);
            break;
          }
        }
        totalBytesReceived += value.byteLength;
        let frames;
        if (detectedFormat === 'mp3') {
          frames = mp3Parser.push(value);
        } else if (detectedFormat === 'aac') {
          frames = aacParser.push(value);
        } else {
          // Still probing: try MP3 first, fall back to AAC.
          // Both parsers accumulate bytes independently until one finds a frame.
          const mp3Frames = mp3Parser.push(value);
          if (mp3Frames.length > 0) {
            detectedFormat = 'mp3';
            samplesPerFrame = 1152;
            frames = mp3Frames;
          } else {
            const aacFrames = aacParser.push(value);
            if (aacFrames.length > 0) {
              detectedFormat = 'aac';
              samplesPerFrame = 1024;
              frames = aacFrames;
            } else {
              frames = [];
            }
          }
        }
        for (const frame of frames) {
          if (!configured) {
            const config = detectedFormat === 'mp3'
              ? { codec: 'mp3', sampleRate: frame.sampleRate, numberOfChannels: frame.numberOfChannels }
              : { codec: `mp4a.40.${frame.audioObjectType}`, sampleRate: frame.sampleRate, numberOfChannels: frame.numberOfChannels, description: frame.description };
            decoder.configure(config);
            configured = true;
          }
          decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: frameTimestampUs, data: frame.bytes }));
          frameTimestampUs += Math.round(samplesPerFrame * 1_000_000 / frame.sampleRate);
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) handleFatalError(err);
    }
  })();

  return firstFrameScheduled;
}

export function pause() {
  if (delayChangeTimer) {
    clearTimeout(delayChangeTimer);
    delayChangeTimer = null;
  }
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  isStreaming = false;
  stopAllSources();
}

export function setDelaySeconds(value, { onBegin, onComplete, onError } = {}) {
  if (!currentStation || !isStreaming) return;
  if (delayChangeTimer) clearTimeout(delayChangeTimer);
  delayChangeTimer = setTimeout(async () => {
    delayChangeTimer = null;
    if (onBegin) onBegin();
    try {
      await play(currentStation, value, onError || currentOnFatalError);
      if (onComplete) onComplete();
    } catch (err) {
      const handler = onError || currentOnFatalError;
      if (handler) handler(err);
    }
  }, 300);
}
