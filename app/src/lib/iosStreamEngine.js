import { createMp3FrameParser } from './demux/mp3.js';

let audioCtx = null;
let gainNode = null;
let currentAbortController = null;
let currentStation = null;
let currentOnFatalError = null;
let delayChangeTimer = null;

const WAVEFORM_SAMPLE_COUNT = 64;
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

function ensureContext() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
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
  ensureContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  if (currentAbortController) currentAbortController.abort();
  const abortController = new AbortController();
  currentAbortController = abortController;

  const response = await fetch(station.stream, { signal: abortController.signal });
  if (!response.ok) {
    throw new Error(`Stream responded with ${response.status}`);
  }

  const parser = createMp3FrameParser();
  const reader = response.body.getReader();

  let decoder;
  let configured = false;
  let nextStartTime = null;
  let resolveFirstFrame;
  let rejectFirstFrame;
  let firstFrameSettled = false;
  const firstFrameScheduled = new Promise((resolve, reject) => {
    resolveFirstFrame = resolve;
    rejectFirstFrame = reject;
  });

  function handleFatalError(err) {
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
      source.connect(gainNode);
      if (nextStartTime === null) nextStartTime = audioCtx.currentTime + delaySeconds;
      source.start(nextStartTime);
      nextStartTime += buffer.duration;
      if (!firstFrameSettled) {
        firstFrameSettled = true;
        resolveFirstFrame();
      }
    },
    error: handleFatalError,
  });

  (async () => {
    try {
      while (!abortController.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of parser.push(value)) {
          if (!configured) {
            decoder.configure({ codec: 'mp3', sampleRate: frame.sampleRate, numberOfChannels: frame.numberOfChannels });
            configured = true;
          }
          decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: 0, data: frame.bytes }));
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
}

export function setDelaySeconds(value) {
  if (!currentStation || !currentAbortController) return;
  if (delayChangeTimer) clearTimeout(delayChangeTimer);
  delayChangeTimer = setTimeout(() => {
    delayChangeTimer = null;
    play(currentStation, value, currentOnFatalError).catch((err) => {
      if (currentOnFatalError) currentOnFatalError(err);
    });
  }, 300);
}
