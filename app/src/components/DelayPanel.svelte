<script>
  import { delaySeconds, setDelay } from '../lib/stores.js';

  let { disabled = false } = $props();

  const presets = [5, 10, 15, 20, 30, 45];

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
  <div class="delay-header">
    <div>
      <div class="delay-label">Delay de audio</div>
      <div class="delay-hint">Ajustá hasta que el audio coincida con la imagen</div>
    </div>
    <div class="delay-value-display">
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
  </div>

  <input
    type="range"
    min="0"
    max="60"
    step="0.1"
    value={$delaySeconds}
    oninput={(e) => setDelay(parseFloat(e.target.value))}
    aria-label="Delay slider"
    {disabled}
  />

  <div class="delay-ticks">
    <span>0s</span><span>15s</span><span>30s</span><span>45s</span><span>60s</span>
  </div>

  <div class="presets">
    <span class="presets-label">Presets rápidos:</span>
    {#each presets as p (p)}
      <button class="preset-btn" class:active={$delaySeconds === p} onclick={() => setDelay(p)} {disabled}>
        {p}s
      </button>
    {/each}
  </div>

  <div class="fine-tune">
    <span class="fine-label">Ajuste fino:</span>
    <button class="fine-btn" onclick={() => setDelay($delaySeconds - 0.1)} aria-label="Restar 0.1 segundos" {disabled}>−</button>
    <span class="fine-step">0.1s</span>
    <button class="fine-btn" onclick={() => setDelay($delaySeconds + 0.1)} aria-label="Sumar 0.1 segundos" {disabled}>+</button>
  </div>
</div>
