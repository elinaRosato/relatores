<script>
  import { delaySeconds, setDelay } from '../lib/stores.js';

  let { disabled = false } = $props();

  const presets = [3, 5, 7, 10, 12, 15];

  let editValue = $state($delaySeconds.toFixed(1));

  $effect(() => {
    editValue = $delaySeconds.toFixed(1);
  });

  function commitEdit() {
    const parsed = parseFloat(editValue);
    if (!Number.isNaN(parsed)) {
      setDelay(parsed);
    } else {
      editValue = $delaySeconds.toFixed(1);
    }
  }

  function handleEditKeydown(e) {
    if (e.key === 'Enter') {
      commitEdit();
      e.target.blur();
    }
  }
</script>

<div class="delay-section" class:disabled>
  <div class="delay-display">
    <input
      class="delay-seconds"
      type="text"
      inputmode="decimal"
      bind:value={editValue}
      onblur={commitEdit}
      onkeydown={handleEditKeydown}
      aria-label="Delay en segundos"
      {disabled}
    />
    <span class="delay-unit">s</span>
  </div>
  <p class="delay-hint">Ajustá hasta que coincida con la imagen</p>

  <input
    type="range"
    min="0"
    max="15"
    step="0.1"
    value={$delaySeconds}
    style="--track-fill: {($delaySeconds / 15 * 100).toFixed(1)}%"
    oninput={(e) => setDelay(parseFloat(e.target.value))}
    aria-label="Delay slider"
    {disabled}
  />

  <div class="delay-ticks">
    <span>0s</span><span>5s</span><span>10s</span><span>15s</span>
  </div>

  <div class="presets">
    {#each presets as p (p)}
      <button
        class="preset-btn"
        class:active={$delaySeconds === p}
        onclick={() => setDelay(p)}
        {disabled}
      >{p}s</button>
    {/each}
  </div>
</div>
