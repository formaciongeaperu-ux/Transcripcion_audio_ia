/**
 * Telephony Audio Decoder & WAV Normalizer
 * Specialized for Contact Center recordings: G.711 A-law, G.711 µ-law, and non-standard PCM.
 */

// G.711 A-law lookup table to 16-bit linear PCM
export const ALAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let val = i ^ 0x55;
  let t = (val & 0x0f) << 4;
  const seg = (val & 0x70) >> 4;
  switch (seg) {
    case 0:
      t += 8;
      break;
    case 1:
      t += 0x108;
      break;
    default:
      t += 0x108;
      t <<= seg - 1;
  }
  ALAW_TABLE[i] = (val & 0x80) ? t : -t;
}

// G.711 µ-law lookup table to 16-bit linear PCM
export const MULAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let val = ~i;
  const sign = val & 0x80;
  const exponent = (val >> 4) & 0x07;
  const mantissa = val & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_TABLE[i] = sign ? -sample : sample;
}

export interface WavMetadata {
  isWav: boolean;
  audioFormat: number; // 1 = PCM, 6 = A-law, 7 = µ-law, etc.
  formatName: string;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

/**
 * Inspects a WAV file binary header to determine audio codec and format.
 */
export function inspectWavHeader(buffer: ArrayBuffer): WavMetadata {
  const view = new DataView(buffer);
  if (buffer.byteLength < 44) {
    return {
      isWav: false,
      audioFormat: 0,
      formatName: 'Unknown',
      numChannels: 1,
      sampleRate: 8000,
      bitsPerSample: 16,
      dataOffset: 44,
      dataLength: 0,
    };
  }

  // Check RIFF and WAVE signatures
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));

  if (riff !== 'RIFF' || wave !== 'WAVE') {
    return {
      isWav: false,
      audioFormat: 0,
      formatName: 'Non-WAV',
      numChannels: 1,
      sampleRate: 8000,
      bitsPerSample: 16,
      dataOffset: 0,
      dataLength: buffer.byteLength,
    };
  }

  let offset = 12;
  let audioFormat = 1;
  let numChannels = 1;
  let sampleRate = 8000;
  let bitsPerSample = 16;
  let dataOffset = 44;
  let dataLength = buffer.byteLength - 44;

  // Walk chunks
  while (offset < buffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      audioFormat = view.getUint16(offset + 8, true);
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataLength = Math.min(chunkSize, buffer.byteLength - dataOffset);
      break;
    }

    offset += 8 + chunkSize;
  }

  let formatName = 'PCM Lineal';
  if (audioFormat === 6) formatName = 'G.711 A-law (Telefonía)';
  else if (audioFormat === 7) formatName = 'G.711 µ-law (Telefonía)';
  else if (audioFormat === 3) formatName = 'IEEE Float';
  else if (audioFormat === 17) formatName = 'IMA ADPCM';
  else if (audioFormat === 0x0031) formatName = 'GSM 6.10';

  return {
    isWav: true,
    audioFormat,
    formatName,
    numChannels,
    sampleRate,
    bitsPerSample,
    dataOffset,
    dataLength,
  };
}

/**
 * Creates a standard 16-bit PCM WAV container header.
 */
function createWavHeader(dataLength: number, sampleRate: number, numChannels: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const byteRate = sampleRate * numChannels * 2;
  const blockAlign = numChannels * 2;

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size for PCM
  view.setUint16(20, 1, true);  // AudioFormat = 1 (Linear PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16 bits per sample

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Decodes G.711 (A-law or µ-law) audio buffer into a standard playable 16-bit PCM WAV Blob.
 */
export function decodeTelephonyWavToPcmBlob(buffer: ArrayBuffer, meta: WavMetadata): Blob {
  const rawBytes = new Uint8Array(buffer, meta.dataOffset, meta.dataLength);
  const numSamples = rawBytes.length;
  const pcmBytes = new Uint8Array(numSamples * 2);
  const pcmView = new DataView(pcmBytes.buffer);

  const table = meta.audioFormat === 6 ? ALAW_TABLE : MULAW_TABLE;

  for (let i = 0; i < numSamples; i++) {
    const sample16 = table[rawBytes[i]];
    pcmView.setInt16(i * 2, sample16, true); // little-endian
  }

  // Create standard canonical WAV header
  const header = createWavHeader(pcmBytes.byteLength, meta.sampleRate || 8000, meta.numChannels || 1);
  return new Blob([header, pcmBytes], { type: 'audio/wav' });
}

/**
 * Ensures an audio File/Blob is in a standard playable format for modern browsers.
 * If it's a telephony G.711 WAV, it immediately converts it client-side into PCM.
 */
export async function normalizeAudioForPlayback(fileOrBlob: Blob | File): Promise<{
  blob: Blob;
  wasConverted: boolean;
  codecInfo: string;
}> {
  try {
    const arrayBuffer = await fileOrBlob.arrayBuffer();
    const meta = inspectWavHeader(arrayBuffer);

    // If it's G.711 A-law or µ-law (typical of contact centers)
    if (meta.isWav && (meta.audioFormat === 6 || meta.audioFormat === 7)) {
      const pcmBlob = decodeTelephonyWavToPcmBlob(arrayBuffer, meta);
      return {
        blob: pcmBlob,
        wasConverted: true,
        codecInfo: `Decodificado de ${meta.formatName} a PCM 16-bit ${meta.sampleRate}Hz`,
      };
    }

    // If it is standard PCM or MP3/OGG, return original blob directly
    return {
      blob: fileOrBlob,
      wasConverted: false,
      codecInfo: meta.isWav ? meta.formatName : fileOrBlob.type || 'Audio estándar',
    };
  } catch (err) {
    console.warn('Could not inspect WAV header, falling back to original:', err);
    return {
      blob: fileOrBlob,
      wasConverted: false,
      codecInfo: 'Original',
    };
  }
}
