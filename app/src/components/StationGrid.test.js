import { render, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, afterEach } from 'vitest';
import StationGrid from './StationGrid.svelte';

afterEach(() => cleanup());

const stations = [
  { id: 'a', name: 'Station A', freq: 'AM 100' },
  { id: 'b', name: 'Station B', freq: 'AM 200' },
];

describe('StationGrid', () => {
  it('renders a card for every station', () => {
    render(StationGrid, { props: { stations, onSelect: () => {} } });
    expect(screen.getByText('Station A')).toBeTruthy();
    expect(screen.getByText('Station B')).toBeTruthy();
  });

  it('marks only the current station as active', () => {
    render(StationGrid, { props: { stations, currentStationId: 'b', onSelect: () => {} } });
    expect(
      screen.getByText('Station B').closest('.station-card').classList.contains('active')
    ).toBe(true);
    expect(
      screen.getByText('Station A').closest('.station-card').classList.contains('active')
    ).toBe(false);
  });
});
