import { describe, it, expect } from 'vitest';
import { createMp3FrameParser } from './mp3.js';

// Real bytes captured from the live rnacional stream (12 complete MPEG-1
// Layer III frames starting exactly at the first frame sync, plus 84
// trailing bytes of a 13th, incomplete frame). Verified by hand before
// this plan was written: walking frame-by-frame via the computed
// frameLength lands exactly on the next frame's sync word, every time.
const REAL_MP3_SAMPLE_BASE64 =
  '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';

function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

describe('createMp3FrameParser', () => {
  it('parses a real captured stream into 12 complete frames, buffering the trailing partial frame', () => {
    const parser = createMp3FrameParser();
    const frames = parser.push(decodeBase64(REAL_MP3_SAMPLE_BASE64));

    expect(frames).toHaveLength(12);
    for (const frame of frames) {
      expect(frame.sampleRate).toBe(44100);
      expect(frame.numberOfChannels).toBe(2);
      expect(frame.bytes.length).toBeGreaterThan(0);
      // every frame starts with a valid MPEG1 LayerIII sync
      expect(frame.bytes[0]).toBe(0xff);
      expect(frame.bytes[1] & 0xe0).toBe(0xe0);
    }
  });

  it('returns no frames until a complete frame has arrived, across multiple push() calls', () => {
    const parser = createMp3FrameParser();
    const allBytes = decodeBase64(REAL_MP3_SAMPLE_BASE64);
    const firstFrameLength = 183; // verified by hand: the sample's first frame

    const partial = parser.push(allBytes.slice(0, firstFrameLength - 10));
    expect(partial).toHaveLength(0);

    const rest = parser.push(allBytes.slice(firstFrameLength - 10, firstFrameLength + 5));
    expect(rest).toHaveLength(1);
    expect(rest[0].bytes.length).toBe(firstFrameLength);
  });

  it('skips a leading ID3v2 tag before looking for frame sync', () => {
    const parser = createMp3FrameParser();
    const id3Header = new Uint8Array([
      0x49, 0x44, 0x33, // 'ID3'
      0x04, 0x00, // version
      0x00, // flags
      0x00, 0x00, 0x00, 0x05, // synchsafe size = 5
    ]);
    const id3Body = new Uint8Array(5); // 5 bytes of tag data, content irrelevant
    const real = decodeBase64(REAL_MP3_SAMPLE_BASE64);

    const combined = new Uint8Array(id3Header.length + id3Body.length + real.length);
    combined.set(id3Header, 0);
    combined.set(id3Body, id3Header.length);
    combined.set(real, id3Header.length + id3Body.length);

    const frames = parser.push(combined);
    expect(frames).toHaveLength(12);
  });

  it('ignores a byte sequence that looks like a sync word but fails header validation', () => {
    const parser = createMp3FrameParser();
    const fakeSync = new Uint8Array([0xff, 0xe0, 0x00, 0x00]); // sync bits ok, but bitrate/samplerate index both 0 (invalid)
    const real = decodeBase64(REAL_MP3_SAMPLE_BASE64);
    const combined = new Uint8Array(fakeSync.length + real.length);
    combined.set(fakeSync, 0);
    combined.set(real, fakeSync.length);

    const frames = parser.push(combined);
    expect(frames).toHaveLength(12);
  });
});
