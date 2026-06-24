import { describe, it, expect, beforeEach } from 'vitest';
import {
  getStationDelay,
  setStationDelay,
  getLastStationId,
  setLastStationId,
} from './persistence.js';

beforeEach(() => localStorage.clear());

describe('getStationDelay / setStationDelay', () => {
  it('returns 0 for a station with no saved delay', () => {
    expect(getStationDelay('rnacional')).toBe(0);
  });

  it('round-trips a saved delay value', () => {
    setStationDelay('rnacional', 12.3);
    expect(getStationDelay('rnacional')).toBe(12.3);
  });

  it('keeps delays for different stations independent', () => {
    setStationDelay('rnacional', 5);
    setStationDelay('mitre', 20);
    expect(getStationDelay('rnacional')).toBe(5);
    expect(getStationDelay('mitre')).toBe(20);
  });
});

describe('getLastStationId / setLastStationId', () => {
  it('returns null when no last station is saved', () => {
    expect(getLastStationId()).toBeNull();
  });

  it('round-trips the last selected station id', () => {
    setLastStationId('vorterix');
    expect(getLastStationId()).toBe('vorterix');
  });
});
