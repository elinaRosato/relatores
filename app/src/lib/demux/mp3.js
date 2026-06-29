// MPEG-1 Layer III only (the format every current MP3 station streams in).
// Bitrate table index -> kbps; index 0 ("free") and 15 ("bad") are not
// supported and treated as an invalid header.
const MPEG1_LAYER3_BITRATES_KBPS = [
  null, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, null,
];

// Sample rate index -> Hz, for MPEG Version 1. Index 3 is reserved.
const MPEG1_SAMPLE_RATES_HZ = [44100, 48000, 32000, null];

function parseHeader(buffer, offset) {
  if (offset + 4 > buffer.length) return null;

  const b0 = buffer[offset];
  const b1 = buffer[offset + 1];
  const b2 = buffer[offset + 2];
  const b3 = buffer[offset + 3];

  // 11-bit frame sync: byte0 all 1s, top 3 bits of byte1 also 1s.
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;

  const versionBits = (b1 >> 3) & 0x03; // 11 = MPEG Version 1
  const layerBits = (b1 >> 1) & 0x03; // 01 = Layer III
  if (versionBits !== 0x03 || layerBits !== 0x01) return null;

  const bitrateIndex = (b2 >> 4) & 0x0f;
  const sampleRateIndex = (b2 >> 2) & 0x03;
  const padding = (b2 >> 1) & 0x01;

  const bitrate = MPEG1_LAYER3_BITRATES_KBPS[bitrateIndex];
  const sampleRate = MPEG1_SAMPLE_RATES_HZ[sampleRateIndex];
  if (!bitrate || !sampleRate) return null;

  const channelMode = (b3 >> 6) & 0x03; // 11 = mono, anything else = stereo
  const numberOfChannels = channelMode === 0x03 ? 1 : 2;

  // Standard Layer III frame length formula: 1152 samples/frame, 8 bits/byte
  // -> 144 = 1152 / 8. bitrate is in kbps, so *1000 converts to bits/sec.
  const frameLength = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;

  return { frameLength, sampleRate, numberOfChannels };
}

function skipLeadingId3Tag(buffer) {
  if (buffer.length < 10) return 0;
  if (buffer[0] !== 0x49 || buffer[1] !== 0x44 || buffer[2] !== 0x33) return 0; // 'ID3'
  // Synchsafe size: 4 bytes, each only using the low 7 bits.
  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);
  return 10 + size;
}

export function createMp3FrameParser() {
  let buffer = new Uint8Array(0);
  let skippedLeadingTag = false;

  function append(chunk) {
    const combined = new Uint8Array(buffer.length + chunk.length);
    combined.set(buffer);
    combined.set(chunk, buffer.length);
    buffer = combined;
  }

  function findNextSync(start) {
    for (let i = start; i <= buffer.length - 4; i++) {
      if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) return i;
    }
    return -1;
  }

  return {
    push(chunk) {
      append(chunk);

      let consumed = 0;
      if (!skippedLeadingTag) {
        consumed = skipLeadingId3Tag(buffer);
        skippedLeadingTag = true;
        if (consumed > buffer.length) {
          // Tag header parsed but its body hasn't fully arrived yet; wait.
          return [];
        }
      }

      const frames = [];
      let offset = consumed;
      while (true) {
        const syncOffset = findNextSync(offset);
        if (syncOffset === -1) break;

        const header = parseHeader(buffer, syncOffset);
        if (!header) {
          offset = syncOffset + 1; // false-positive sync, keep scanning
          continue;
        }

        if (buffer.length < syncOffset + header.frameLength) break; // wait for more bytes

        frames.push({
          bytes: buffer.slice(syncOffset, syncOffset + header.frameLength),
          sampleRate: header.sampleRate,
          numberOfChannels: header.numberOfChannels,
        });
        offset = syncOffset + header.frameLength;
      }

      buffer = buffer.slice(offset);
      return frames;
    },
  };
}
