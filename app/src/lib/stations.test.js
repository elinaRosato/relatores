import { describe, it, expect } from 'vitest';
import { fetchStations } from './stations.js';

describe('fetchStations', () => {
  it('resolves all 7 built-in stations', async () => {
    const stations = await fetchStations();
    expect(stations).toHaveLength(7);
  });

  it('gives every station an id, name, freq, stream URL, and radio-browser.info uuid', async () => {
    const stations = await fetchStations();
    for (const s of stations) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.freq).toBe('string');
      expect(s.stream.startsWith('https://')).toBe(true);
      expect(typeof s.uuid).toBe('string');
    }
  });

  it('includes Radio Nacional with its verified stream URL', async () => {
    const stations = await fetchStations();
    const nacional = stations.find(s => s.id === 'rnacional');
    expect(nacional.stream).toBe('https://sa.mp3.icecast.magma.edge-access.net/sc_rad1');
  });
});
