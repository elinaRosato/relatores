<script>
  import StationCard from './StationCard.svelte';

  let { stations, currentStationId = null, onSelect } = $props();
</script>

<div class="stations-grid">
  {#each stations as station (station.id)}
    <StationCard {station} active={station.id === currentStationId} {onSelect} />
  {/each}
</div>
