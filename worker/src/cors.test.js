import { describe, it, expect } from 'vitest';
import { resolveCorsOrigin } from './cors.js';

describe('resolveCorsOrigin', () => {
  it('reflects the production origin', () => {
    expect(resolveCorsOrigin('https://re-lata.com')).toBe('https://re-lata.com');
  });

  it('reflects a Pages per-commit preview origin', () => {
    expect(resolveCorsOrigin('https://a1b2c3d4.relata.pages.dev')).toBe('https://a1b2c3d4.relata.pages.dev');
  });

  it('reflects a Pages per-branch preview origin', () => {
    expect(resolveCorsOrigin('https://my-feature-branch.relata.pages.dev')).toBe('https://my-feature-branch.relata.pages.dev');
  });

  it('rejects an unrelated origin', () => {
    expect(resolveCorsOrigin('https://evil.example.com')).toBeNull();
  });

  it('rejects a missing origin', () => {
    expect(resolveCorsOrigin(null)).toBeNull();
  });

  it('rejects a pages.dev origin under a different project', () => {
    expect(resolveCorsOrigin('https://a1b2c3d4.someoneelse.pages.dev')).toBeNull();
  });
});
