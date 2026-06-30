// ADTS AAC frame demuxer.
// Supports 7-byte headers (protection_absent=1, no CRC) and 9-byte headers
// (protection_absent=0, CRC present).

const SAMPLING_FREQUENCIES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

function parseAdtsHeader(buffer, offset) {
  if (offset + 7 > buffer.length) return null;

  const b0 = buffer[offset];
  const b1 = buffer[offset + 1];

  // 12-bit sync word (0xFFF) — top nibble of b1 must be 0xF.
  // Layer field (bits 2:1 of b1) must be 00 for AAC.
  if (b0 !== 0xff || (b1 & 0xf6) !== 0xf0) return null;

  const protectionAbsent = b1 & 0x01;
  const headerLength = protectionAbsent ? 7 : 9;
  if (offset + headerLength > buffer.length) return null;

  const b2 = buffer[offset + 2];
  const b3 = buffer[offset + 3];
  const b4 = buffer[offset + 4];
  const b5 = buffer[offset + 5];

  const profile          = (b2 >> 6) & 0x03;
  const samplingFreqIndex = (b2 >> 2) & 0x0f;
  const channelConfig    = ((b2 & 0x01) << 2) | ((b3 >> 6) & 0x03);
  const frameLength      = ((b3 & 0x03) << 11) | (b4 << 3) | ((b5 >> 5) & 0x07);

  const sampleRate = SAMPLING_FREQUENCIES[samplingFreqIndex];
  if (!sampleRate) return null;
  if (channelConfig === 0 || channelConfig > 7) return null; // 0 = programmatic, 8 = reserved
  if (frameLength < headerLength) return null;

  return {
    headerLength,
    frameLength,
    sampleRate,
    numberOfChannels: channelConfig === 7 ? 8 : channelConfig,
    audioObjectType: profile + 1, // ADTS profile is AOT - 1
    samplingFreqIndex,
    channelConfig,
  };
}

// Minimal AudioSpecificConfig (ISO 14496-3 §1.6.5.1) for AOT ≤ 30.
// Two bytes: 5-bit AOT + 4-bit sfIdx + 4-bit chCfg + 3 zero bits.
function buildAudioSpecificConfig(audioObjectType, samplingFreqIndex, channelConfig) {
  const word = (audioObjectType << 11) | (samplingFreqIndex << 7) | (channelConfig << 3);
  return new Uint8Array([word >> 8, word & 0xff]);
}

export function createAacFrameParser() {
  let buffer = new Uint8Array(0);

  function append(chunk) {
    const combined = new Uint8Array(buffer.length + chunk.length);
    combined.set(buffer);
    combined.set(chunk, buffer.length);
    buffer = combined;
  }

  function findNextSync(start) {
    for (let i = start; i <= buffer.length - 2; i++) {
      if (buffer[i] === 0xff && (buffer[i + 1] & 0xf6) === 0xf0) return i;
    }
    return -1;
  }

  return {
    push(chunk) {
      append(chunk);

      const frames = [];
      let offset = 0;

      while (true) {
        const syncOffset = findNextSync(offset);
        if (syncOffset === -1) break;

        const header = parseAdtsHeader(buffer, syncOffset);
        if (!header) {
          offset = syncOffset + 1; // false-positive sync, keep scanning
          continue;
        }

        if (buffer.length < syncOffset + header.frameLength) break; // wait for more bytes

        frames.push({
          // Strip ADTS header — WebCodecs mp4a decoder expects raw AAC access units,
          // not the ADTS container. Header info is provided via AudioSpecificConfig below.
          bytes: buffer.slice(syncOffset + header.headerLength, syncOffset + header.frameLength),
          sampleRate: header.sampleRate,
          numberOfChannels: header.numberOfChannels,
          audioObjectType: header.audioObjectType,
          description: buildAudioSpecificConfig(header.audioObjectType, header.samplingFreqIndex, header.channelConfig),
        });

        offset = syncOffset + header.frameLength;
      }

      buffer = buffer.slice(offset);
      return frames;
    },
  };
}
