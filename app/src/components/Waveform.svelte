<script>
  import { onDestroy } from 'svelte';
  import { isPlaying } from '../lib/stores.js';
  import { getAnalyser } from '../lib/audioEngine.js';

  let canvas;
  let ctx = null;
  let frameId = null;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
  }

  function draw() {
    const analyser = getAnalyser();
    if (!ctx || !analyser) return;
    frameId = requestAnimationFrame(draw);

    const bufLen = analyser.frequencyBinCount;
    const dataArr = new Uint8Array(bufLen);
    analyser.getByteTimeDomainData(dataArr);

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#4FC3F7');
    grad.addColorStop(0.5, '#F5C518');
    grad.addColorStop(1, '#4FC3F7');

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = grad;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#4FC3F744';
    ctx.beginPath();

    const sliceW = w / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = dataArr[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceW;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function stopDrawing() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  $effect(() => {
    if ($isPlaying) {
      if (!ctx) {
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
      }
      if (frameId === null) draw();
    } else {
      stopDrawing();
    }
  });

  onDestroy(() => {
    stopDrawing();
    window.removeEventListener('resize', resizeCanvas);
  });
</script>

<div class="waveform-wrap">
  <canvas bind:this={canvas}></canvas>
  {#if !$isPlaying}
    <div class="waveform-idle-text">Seleccioná una radio para comenzar</div>
  {/if}
</div>
