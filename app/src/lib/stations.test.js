import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchStations, getFallbackStreamUrl } from './stations.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchStations', () => {
  it('fetches the station registry from the proxy', async () => {
    const proxiedStations = [
      {
        id: 'rnacional',
        name: 'Radio Nacional',
        freq: 'AM 870 / FM 98.7 — Buenos Aires',
        stream: 'https://re-lata.com/stream/rnacional',
      },
    ];
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(proxiedStations), { status: 200 })
    );

    const result = await fetchStations();

    expect(global.fetch).toHaveBeenCalledWith('/stations');
    expect(result).toEqual({ stations: proxiedStations, proxied: true });
  });

  it('falls back to the built-in list when the proxy is unreachable', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

    const result = await fetchStations();

    expect(result.proxied).toBe(false);
    expect(result.stations).toHaveLength(6);
    const nacional = result.stations.find((s) => s.id === 'rnacional');
    expect(nacional.stream).toBe('https://sa.mp3.icecast.magma.edge-access.net/sc_rad1');
  });

  it('falls back to the built-in list when the proxy responds with an error status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));

    const result = await fetchStations();

    expect(result.proxied).toBe(false);
    expect(result.stations).toHaveLength(6);
  });

  it('gives every fallback station an id, name, freq, and stream URL', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

    const { stations } = await fetchStations();

    for (const s of stations) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.freq).toBe('string');
      expect(s.stream.startsWith('https://')).toBe(true);
    }
  });
});

describe('getFallbackStreamUrl', () => {
  it('returns the direct upstream URL for a known station id', () => {
    expect(getFallbackStreamUrl('rnacional')).toBe('https://sa.mp3.icecast.magma.edge-access.net/sc_rad1');
  });

  it('returns undefined for an unknown station id', () => {
    expect(getFallbackStreamUrl('doesnotexist')).toBeUndefined();
  });
});
