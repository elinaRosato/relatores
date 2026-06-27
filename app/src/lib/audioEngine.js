let audioCtx = null;
let audioEl = null;
let sourceNode = null;
let delayNode = null;
let gainNode = null;
let analyserNode = null;

let resumeListenerAttached = false;

// TEMP DEBUG -- remove once the iOS investigation is done.
function debugLog(...args) {
  console.log('[audio-debug]', performance.now().toFixed(0) + 'ms', ...args);
}
let debugPollStarted = false;
function startDebugPoll() {
  if (debugPollStarted) return;
  debugPollStarted = true;
  setInterval(() => {
    if (!audioCtx) return;
    debugLog(
      'poll: ctxState=', audioCtx.state,
      'ctxTime=', audioCtx.currentTime.toFixed(2),
      'delayTime=', delayNode ? delayNode.delayTime.value : null,
      'audioElPaused=', audioEl ? audioEl.paused : null,
      'audioElMuted=', audioEl ? audioEl.muted : null,
      'audioElReadyState=', audioEl ? audioEl.readyState : null
    );
  }, 1000);
}

function attachBackgroundAudioSupport() {
  if (resumeListenerAttached) return;
  resumeListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    debugLog('visibilitychange, visibilityState=', document.visibilityState, 'ctxState=', audioCtx && audioCtx.state);
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(
        () => debugLog('visibilitychange resume() resolved, ctxState=', audioCtx.state),
        (err) => debugLog('visibilitychange resume() REJECTED', err)
      );
    }
  });
}

function ensureAudioContext() {
  if (audioCtx) return;

  audioEl = new Audio();
  audioEl.crossOrigin = 'anonymous';
  // iOS Safari has a known history of createMediaElementSource() silently
  // failing to route real audio into the graph when the element is never
  // attached to the document -- the node is created, the context stays
  // "running", but nothing reaches the analyser/destination while the
  // element keeps playing through its own native output. Visually hidden,
  // not display:none (which can throttle media decode in some engines).
  audioEl.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none;';
  document.body.appendChild(audioEl);

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  debugLog('AudioContext created, initial ctxState=', audioCtx.state);
  sourceNode = audioCtx.createMediaElementSource(audioEl);
  gainNode = audioCtx.createGain();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 256;

  gainNode.connect(analyserNode);

  attachBackgroundAudioSupport();
  startDebugPoll();
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
  debugLog('play() called for', station.id, 'ctxState (pre-ensure)=', audioCtx && audioCtx.state);
  ensureAudioContext();
  if (audioCtx.state === 'suspended') {
    debugLog('ctx suspended at play(), calling resume()');
    audioCtx.resume().then(
      () => debugLog('play() resume() resolved, ctxState=', audioCtx.state),
      (err) => debugLog('play() resume() REJECTED', err)
    );
  }
  rebuildDelayNode();

  // delayNode keeps buffering audio for delayTime seconds after the source
  // stops, so pause() disconnects downstream of it to silence immediately;
  // reconnect here rather than in ensureAudioContext (which only runs once).
  analyserNode.connect(audioCtx.destination);

  if (navigator.audioSession) {
    navigator.audioSession.type = 'play';
    debugLog('navigator.audioSession.type set to play');
  } else {
    debugLog('navigator.audioSession not available');
  }

  audioEl.src = station.stream;
  audioEl.load();
  debugLog('calling audioEl.play(), ctxState=', audioCtx.state);
  return audioEl.play().then(
    () => debugLog('audioEl.play() RESOLVED, ctxState=', audioCtx.state, 'delayTime=', delayNode.delayTime.value),
    (err) => {
      debugLog('audioEl.play() REJECTED', err);
      throw err;
    }
  );
}

export function pause() {
  if (!audioEl) return;
  debugLog('pause() called, ctxState=', audioCtx && audioCtx.state);
  audioEl.pause();
  audioEl.src = '';
  if (analyserNode) analyserNode.disconnect();
}

export function setDelaySeconds(seconds) {
  debugLog('setDelaySeconds', seconds, 'ctxState=', audioCtx && audioCtx.state, 'ctxTime=', audioCtx && audioCtx.currentTime.toFixed(2));
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
