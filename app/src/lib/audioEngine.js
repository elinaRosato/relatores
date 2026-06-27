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
  // Attached to the document (visually hidden, not display:none, which can
  // throttle media decode in some engines) -- some WebKit versions have had
  // trouble routing real audio into createMediaElementSource() from a
  // detached element.
  audioEl.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none;';
  document.body.appendChild(audioEl);

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaElementSource(audioEl);
  gainNode = audioCtx.createGain();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;

  gainNode.connect(analyserNode);

  attachBackgroundAudioSupport();
}

// DelayNode has no public flush/clear API, and disconnecting it (in pause())
// only stops new audio from entering -- whatever was already buffered from
// before the pause is still sitting in it. Rebuilding it on every play() call
// means playback always starts from an empty buffer, so stale audio can't
// resurface and play back before the freshly-requested stream arrives.
function rebuildDelayNode() {
  const currentDelay = delayNode ? delayNode.delayTime.value : 0;
  if (delayNode) {
    sourceNode.disconnect();
    delayNode.disconnect();
  }
  delayNode = audioCtx.createDelay(65);
  delayNode.delayTime.value = currentDelay;
  sourceNode.connect(delayNode);
  delayNode.connect(gainNode);
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
  rebuildDelayNode();

  // delayNode keeps buffering audio for delayTime seconds after the source
  // stops, so pause() disconnects downstream of it to silence immediately;
  // reconnect here rather than in ensureAudioContext (which only runs once).
  analyserNode.connect(audioCtx.destination);

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
  if (analyserNode) analyserNode.disconnect();
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
