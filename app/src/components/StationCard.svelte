<script>
  let { station, active = false, onSelect } = $props();
</script>

<div
  class="station-card"
  class:active
  role="button"
  tabindex="0"
  onclick={() => onSelect(station)}
  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(station); }}
>
  <div class="station-name">{station.name}</div>
  <div class="station-freq">{station.freq}</div>
</div>
