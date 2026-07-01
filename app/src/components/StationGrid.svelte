<script>
  import StationCard from './StationCard.svelte';

  let { stations, currentStationId = null, onSelect } = $props();

  let query = $state('');
  let starredIds = $state(new Set(JSON.parse(localStorage.getItem('starred-radios') ?? '[]')));

  let filtered = $derived(
    query.trim() === ''
      ? stations
      : stations.filter((s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.freq.toLowerCase().includes(query.toLowerCase())
        )
  );

  function toggleStar(id) {
    const next = new Set(starredIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    starredIds = next;
    localStorage.setItem('starred-radios', JSON.stringify([...next]));
  }
</script>

<div class="station-search-wrap">
  <svg class="search-icon" viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
  </svg>
  <input
    class="station-search"
    type="search"
    placeholder="Buscar radio..."
    bind:value={query}
  />
</div>

<div class="stations-list">
  {#each filtered as station (station.id)}
    <StationCard
      {station}
      active={station.id === currentStationId}
      {onSelect}
      starred={starredIds.has(station.id)}
      onToggleStar={toggleStar}
    />
  {/each}
  {#if filtered.length === 0}
    <p class="stations-empty">No hay radios que coincidan.</p>
  {/if}
</div>
