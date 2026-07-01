<script>
  const base = import.meta.env.BASE_URL;
  let { station, active = false, onSelect, starred = false, onToggleStar } = $props();
</script>

<div
  class="station-card"
  class:active
  role="button"
  tabindex="0"
  onclick={() => onSelect(station)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(station); }}
>
  <div class="station-icon-wrap">
    {#if station.logo}
      <img class="station-logo" src="{base}{station.logo}" alt={station.name} />
    {:else}
      <svg class="station-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
      </svg>
    {/if}
  </div>

  <div class="station-info">
    <div class="station-name">{station.name}</div>
    <div class="station-freq">{station.freq}</div>
  </div>

  <div
    class="station-actions"
    role="presentation"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
  >
    <span class="live-tag">En vivo</span>
    <button
      class="star-btn"
      class:starred
      onclick={() => onToggleStar(station.id)}
      aria-label={starred ? 'Quitar de favoritas' : 'Agregar a favoritas'}
    >
      <svg viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    </button>
  </div>
</div>
