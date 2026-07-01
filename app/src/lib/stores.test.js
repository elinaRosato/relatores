import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  clampDelay,
  delaySeconds,
  setDelay,
  currentStation,
  isPlaying,
  isLoading,
  volume,
} from './stores.js';

describe('clampDelay', () => {
  it('snaps to the nearest 0.1', () => {
    expect(clampDelay(12.34)).toBe(12.3);
    expect(clampDelay(12.37)).toBe(12.4);
  });

  it('clamps to a 0 minimum', () => {
    expect(clampDelay(-5)).toBe(0);
  });

  it('clamps to a 15 maximum', () => {
    expect(clampDelay(65)).toBe(15);
  });
});

describe('setDelay', () => {
  beforeEach(() => setDelay(0));

  it('writes a clamped, snapped value to the delaySeconds store', () => {
    setDelay(12.34);
    expect(get(delaySeconds)).toBe(12.3);
  });
});

describe('default store values', () => {
  it('starts with no current station', () => {
    expect(get(currentStation)).toBeNull();
  });

  it('starts paused', () => {
    expect(get(isPlaying)).toBe(false);
  });

  it('starts not loading', () => {
    expect(get(isLoading)).toBe(false);
  });

  it('starts at full volume', () => {
    expect(get(volume)).toBe(1);
  });
});
