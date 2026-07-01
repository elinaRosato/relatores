import { writable } from 'svelte/store';

export function clampDelay(value) {
  const snapped = Math.round(value * 10) / 10;
  return Math.min(15, Math.max(0, snapped));
}

export const delaySeconds = writable(0);

export function setDelay(value) {
  delaySeconds.set(clampDelay(value));
}

export const currentStation = writable(null);
export const isPlaying = writable(false);
export const isLoading = writable(false);
export const volume = writable(1);
