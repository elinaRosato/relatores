import { describe, it, expect, afterEach } from 'vitest';
import { isIOS, supportsWebCodecsAudio } from './platform.js';

const ORIGINAL = {
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints,
};

function mockNavigator({ userAgent, platform, maxTouchPoints }) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

afterEach(() => {
  mockNavigator(ORIGINAL);
});

describe('isIOS', () => {
  it('detects iPhone Safari', () => {
    mockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
  });

  it('detects Chrome on iOS (CriOS), which is WebKit under the hood', () => {
    mockNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
  });

  it('detects iPadOS, which reports itself as Macintosh', () => {
    mockNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(true);
  });

  it('does not flag a real Mac with no touch support', () => {
    mockNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
    expect(isIOS()).toBe(false);
  });

  it('does not flag Android', () => {
    mockNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });
    expect(isIOS()).toBe(false);
  });
});

describe('supportsWebCodecsAudio', () => {
  afterEach(() => {
    delete globalThis.AudioDecoder;
  });

  it('returns true when AudioDecoder is defined', () => {
    globalThis.AudioDecoder = class {};
    expect(supportsWebCodecsAudio()).toBe(true);
  });

  it('returns false when AudioDecoder is undefined', () => {
    delete globalThis.AudioDecoder;
    expect(supportsWebCodecsAudio()).toBe(false);
  });
});
