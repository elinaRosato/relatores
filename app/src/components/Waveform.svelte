<script>
  import { onDestroy } from 'svelte';
  import { isPlaying, currentStation } from '../lib/stores.js';
  import { getAnalyser } from '../lib/audioEngine.js';
  import { getWaveformData } from '../lib/iosStreamEngine.js';

  let canvas;
  let ctx = null;
  let frameId = null;

  // Setting canvas.width/height wipes the bitmap. Mobile browsers fire
  // `resize` on scroll as the address bar collapses/expands, so without a
  // repaint here the idle flat-line goes blank until the next play()
  // restarts the rAF loop. Skip it while playing -- the loop repaints anyway.
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);
    if (!$isPlaying) paintIdleState();
  }

  function paintIdleState() {
    if ($currentStation) {
      drawFlatLine();
    } else {
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    }
  }

  function strokeGradientPath(drawPath) {
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
    drawPath(w, h);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function draw() {
    if (!ctx) return;
    frameId = requestAnimationFrame(draw);

    const analyser = getAnalyser();
    let dataArr;
    if (analyser) {
      dataArr = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(dataArr);
    } else {
      dataArr = getWaveformData();
    }

    strokeGradientPath((w, h) => {
      const sliceW = w / dataArr.length;
      let x = 0;
      for (let i = 0; i < dataArr.length; i++) {
        const v = dataArr[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceW;
      }
      ctx.lineTo(w, h / 2);
    });
  }

  function drawFlatLine() {
    strokeGradientPath((w, h) => {
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
    });
  }

  function stopDrawing() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (!ctx) return;
    paintIdleState();
  }

  $effect(() => {
    if ($currentStation && !ctx) {
      ctx = canvas.getContext('2d');
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
    }

    if ($isPlaying) {
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
  {#if !$currentStation}
    <div class="waveform-idle-text">Seleccioná una radio para comenzar</div>
  {/if}
</div>
