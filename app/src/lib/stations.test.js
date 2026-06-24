import { describe, it, expect } from 'vitest';
import { fetchStations } from './stations.js';

describe('fetchStations', () => {
  it('resolves all 8 built-in stations', async () => {
    const stations = await fetchStations();
    expect(stations).toHaveLength(8);
  });

  it('gives every station an id, name, freq, and stream URL', async () => {
    const stations = await fetchStations();
    for (const s of stations) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.freq).toBe('string');
      expect(s.stream.startsWith('https://')).toBe(true);
    }
  });

  it('includes Radio Nacional with its known stream URL', async () => {
    const stations = await fetchStations();
    const nacional = stations.find(s => s.id === 'rnacional');
    expect(nacional.stream).toBe('https://livestreaming.educ.ar/nacionales/nacfm.m3u8');
  });
});
