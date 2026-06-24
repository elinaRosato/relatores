import { render, screen, fireEvent, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, afterEach } from 'vitest';
import StationCard from './StationCard.svelte';

afterEach(() => cleanup());

const station = {
  id: 'rnacional',
  name: 'Radio Nacional',
  freq: 'AM 870 / FM 98.7 — Buenos Aires',
  stream: 'https://example.com/x.m3u8',
};

describe('StationCard', () => {
  it('renders the station name and frequency', () => {
    render(StationCard, { props: { station, onSelect: () => {} } });
    expect(screen.getByText('Radio Nacional')).toBeTruthy();
    expect(screen.getByText('AM 870 / FM 98.7 — Buenos Aires')).toBeTruthy();
  });

  it('calls onSelect with the station when clicked', async () => {
    const onSelect = vi.fn();
    render(StationCard, { props: { station, onSelect } });
    await fireEvent.click(screen.getByText('Radio Nacional'));
    expect(onSelect).toHaveBeenCalledWith(station);
  });

  it('applies the active class when active is true', () => {
    render(StationCard, { props: { station, active: true, onSelect: () => {} } });
    expect(
      screen.getByText('Radio Nacional').closest('.station-card').classList.contains('active')
    ).toBe(true);
  });

  it('does not apply the active class when active is false', () => {
    render(StationCard, { props: { station, active: false, onSelect: () => {} } });
    expect(
      screen.getByText('Radio Nacional').closest('.station-card').classList.contains('active')
    ).toBe(false);
  });

  it('calls onSelect when Enter is pressed', async () => {
    const onSelect = vi.fn();
    render(StationCard, { props: { station, onSelect } });
    await fireEvent.keyDown(screen.getByText('Radio Nacional').closest('.station-card'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(station);
  });

  it('calls onSelect when Space is pressed', async () => {
    const onSelect = vi.fn();
    render(StationCard, { props: { station, onSelect } });
    await fireEvent.keyDown(screen.getByText('Radio Nacional').closest('.station-card'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(station);
  });

  it('does not call onSelect for an unrelated key', async () => {
    const onSelect = vi.fn();
    render(StationCard, { props: { station, onSelect } });
    await fireEvent.keyDown(screen.getByText('Radio Nacional').closest('.station-card'), { key: 'Tab' });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
