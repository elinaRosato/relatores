import { describe, it, expect } from 'vitest';
import { createAacFrameParser } from './aac.js';

const SAMPLING_FREQUENCIES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

// Builds a minimal valid ADTS frame: 7-byte header (no CRC) + `payloadSize` zero bytes.
// Frame layout follows ISO 13818-7 §2.4.3.7 (ADTS).
function buildAdtsFrame({ sampleRate = 44100, channels = 2, payloadSize = 8 } = {}) {
  const sfIndex = SAMPLING_FREQUENCIES.indexOf(sampleRate);
  if (sfIndex === -1) throw new Error(`Unsupported sample rate: ${sampleRate}`);
  const profile = 1; // AAC-LC (audio object type = profile + 1 = 2)
  const headerLength = 7;
  const frameLength = headerLength + payloadSize;

  const frame = new Uint8Array(frameLength);
  frame[0] = 0xff;
  frame[1] = 0xf1; // sync[3:0]=0xF, ID=0 (MPEG-4), layer=00, protection_absent=1
  frame[2] = ((profile & 0x03) << 6) | ((sfIndex & 0x0f) << 2) | ((channels >> 2) & 0x01);
  frame[3] = ((channels & 0x03) << 6) | ((frameLength >> 11) & 0x03);
  frame[4] = (frameLength >> 3) & 0xff;
  frame[5] = ((frameLength & 0x07) << 5) | 0x1f; // frameLen[2:0] + bufFullness[10:6]=11111
  frame[6] = 0xfc; // bufFullness[5:0]=111111, number_of_raw_data_blocks=0
  // bytes 7+: zero payload
  return frame;
}

describe('createAacFrameParser', () => {
  it('parses a single ADTS frame and returns the payload without the header', () => {
    const parser = createAacFrameParser();
    const frame = buildAdtsFrame({ sampleRate: 44100, channels: 2, payloadSize: 8 });

    const frames = parser.push(frame);

    expect(frames).toHaveLength(1);
    expect(frames[0].sampleRate).toBe(44100);
    expect(frames[0].numberOfChannels).toBe(2);
    expect(frames[0].audioObjectType).toBe(2); // AAC-LC
    expect(frames[0].bytes.length).toBe(8); // header stripped
  });

  it('parses two consecutive frames in a single push', () => {
    const parser = createAacFrameParser();
    const frame = buildAdtsFrame({ sampleRate: 48000, channels: 1, payloadSize: 16 });
    const twoFrames = new Uint8Array([...frame, ...frame]);

    const frames = parser.push(twoFrames);

    expect(frames).toHaveLength(2);
    for (const f of frames) {
      expect(f.sampleRate).toBe(48000);
      expect(f.numberOfChannels).toBe(1);
    }
  });

  it('buffers a partial frame across two push() calls', () => {
    const parser = createAacFrameParser();
    const frame = buildAdtsFrame({ payloadSize: 20 }); // 27 bytes total

    expect(parser.push(frame.slice(0, 20))).toHaveLength(0);

    const frames = parser.push(frame.slice(20));
    expect(frames).toHaveLength(1);
    expect(frames[0].bytes.length).toBe(20);
  });

  it('ignores a byte sequence that passes the sync check but fails header validation', () => {
    const parser = createAacFrameParser();
    // sfIndex=15 is reserved — parseAdtsHeader returns null for it.
    // byte[1]=0xF1 passes sync check, byte[2]=0x3C gives sfIndex=(0x3C>>2)&0xF=15.
    const fakeSync = new Uint8Array([0xff, 0xf1, 0x3c, 0x00, 0x00, 0x00, 0x00]);
    const realFrame = buildAdtsFrame();
    const combined = new Uint8Array([...fakeSync, ...realFrame]);

    const frames = parser.push(combined);

    expect(frames).toHaveLength(1);
    expect(frames[0].sampleRate).toBe(44100);
  });

  it('includes a valid 2-byte AudioSpecificConfig in description', () => {
    const parser = createAacFrameParser();
    const [frame] = parser.push(buildAdtsFrame({ sampleRate: 44100, channels: 2 }));

    // AOT=2, sfIdx=4, chCfg=2 → (2<<11)|(4<<7)|(2<<3) = 4624 = 0x1210
    expect(frame.description).toBeInstanceOf(Uint8Array);
    expect(frame.description[0]).toBe(0x12);
    expect(frame.description[1]).toBe(0x10);
  });

  it('handles a 9-byte header (CRC present, protection_absent=0)', () => {
    const sfIndex = 4; // 44100Hz
    const profile = 1;
    const channels = 2;
    const payloadSize = 8;
    const headerLength = 9;
    const frameLength = headerLength + payloadSize; // 17

    const frame = new Uint8Array(frameLength);
    frame[0] = 0xff;
    frame[1] = 0xf0; // protection_absent=0 → CRC present, 9-byte header
    frame[2] = ((profile & 0x03) << 6) | ((sfIndex & 0x0f) << 2) | ((channels >> 2) & 0x01);
    frame[3] = ((channels & 0x03) << 6) | ((frameLength >> 11) & 0x03);
    frame[4] = (frameLength >> 3) & 0xff;
    frame[5] = ((frameLength & 0x07) << 5) | 0x1f;
    frame[6] = 0xfc;
    // frame[7..8]: CRC bytes (0x00 0x00)
    // frame[9+]: zero payload

    const frames = createAacFrameParser().push(frame);

    expect(frames).toHaveLength(1);
    expect(frames[0].bytes.length).toBe(payloadSize); // 9-byte header stripped
    expect(frames[0].sampleRate).toBe(44100);
    expect(frames[0].numberOfChannels).toBe(2);
  });
});
