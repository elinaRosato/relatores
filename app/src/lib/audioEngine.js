let audioCtx = null;
let audioEl = null;
let sourceNode = null;
let delayNode = null;
let gainNode = null;
let analyserNode = null;

let resumeListenerAttached = false;

function attachBackgroundAudioSupport() {
  if (resumeListenerAttached) return;
  resumeListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  });
}

function ensureAudioContext() {
  if (audioCtx) return;

  audioEl = new Audio();
  audioEl.crossOrigin = 'anonymous';

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaElementSource(audioEl);
  delayNode = audioCtx.createDelay(65);
  gainNode = audioCtx.createGain();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;

  sourceNode.connect(delayNode);
  delayNode.connect(gainNode);
  gainNode.connect(analyserNode);
  analyserNode.connect(audioCtx.destination);

  attachBackgroundAudioSupport();
}

export function isContextCreated() {
  return audioCtx !== null;
}

export function getAudioElement() {
  return audioEl;
}

export async function play(station) {
  ensureAudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();

  if (navigator.audioSession) {
    navigator.audioSession.type = 'play';
  }

  audioEl.src = station.stream;
  audioEl.load();
  return audioEl.play();
}

export function pause() {
  if (!audioEl) return;
  audioEl.pause();
  audioEl.src = '';
}

export function setDelaySeconds(seconds) {
  if (delayNode) delayNode.delayTime.value = seconds;
}

export function getDelayTimeValue() {
  return delayNode ? delayNode.delayTime.value : 0;
}

export function setGain(value) {
  if (gainNode) gainNode.gain.value = value;
}

export function getGainValue() {
  return gainNode ? gainNode.gain.value : 1;
}

export function getAnalyser() {
  return analyserNode;
}
