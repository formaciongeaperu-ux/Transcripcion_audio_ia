/**
 * In-browser Audio Optimizer using Web Audio API
 * Downsamples any audio file (.mp3, .wav, .m4a, .ogg) to 16,000 Hz 16-bit Mono WAV
 * This saves ~80% network bandwidth while preserving optimal speech clarity for Gemini AI models.
 */

import { normalizeAudioForPlayback } from './telephonyAudio';

export interface AudioOptimizationResult {
  originalSize: number;
  optimizedSize: number;
  savingsPercentage: number;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  wavBlob: Blob;
  base64Data: string;
}

export async function downsampleTo16kHzMonoWav(file: File | Blob): Promise<{ base64: string; optimizedSize: number; savingsPercentage: number }> {
  const res = await optimizeAudioInBrowser(file, 16000);
  return {
    base64: res.base64Data,
    optimizedSize: res.optimizedSize,
    savingsPercentage: res.savingsPercentage
  };
}

export async function optimizeAudioInBrowser(
  file: File | Blob,
  targetSampleRate: number = 16000
): Promise<AudioOptimizationResult> {
  const originalSize = file.size;

  try {
    // 1. First normalize telephony formats (G.711 A-law / µ-law) to standard PCM WAV
    const normalized = await normalizeAudioForPlayback(file);
    const audioBlobToDecode = normalized.blob;
    const arrayBuffer = await audioBlobToDecode.arrayBuffer();

    // 2. Attempt decoding with browser AudioContext
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioContext = new AudioCtx();

    let audioBuffer: AudioBuffer | null = null;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch (decodeErr) {
      console.warn('Browser AudioContext could not decode directly. Delegating to server ffmpeg transcoding:', decodeErr);
      audioBuffer = null;
    } finally {
      audioContext.close().catch(() => {});
    }

    // 3. If browser successfully decoded, render high quality 16kHz Mono WAV
    if (audioBuffer) {
      const durationSeconds = audioBuffer.duration;
      const offlineCtx = new OfflineAudioContext(
        1, // mono channel
        Math.max(1, Math.ceil(durationSeconds * targetSampleRate)),
        targetSampleRate
      );

      const source = offlineCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const monoChannelData = renderedBuffer.getChannelData(0);

      const wavBlob = encodeWAV(monoChannelData, targetSampleRate);
      const optimizedSize = wavBlob.size;
      const savingsPercentage = Math.max(0, Math.round(((originalSize - optimizedSize) / originalSize) * 100));
      const base64Data = await blobToBase64(wavBlob);

      return {
        originalSize,
        optimizedSize,
        savingsPercentage,
        durationSeconds,
        sampleRate: targetSampleRate,
        channels: 1,
        wavBlob,
        base64Data
      };
    }

    // 4. If browser decode failed (e.g. GSM 6.10, ADPCM, non-standard codecs), use server ffmpeg
    const originalBase64 = await blobToBase64(file);
    try {
      const convRes = await fetch('/api/convert-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: originalBase64 })
      });

      if (convRes.ok) {
        const convertedBlob = await convRes.blob();
        const base64Data = await blobToBase64(convertedBlob);
        return {
          originalSize,
          optimizedSize: convertedBlob.size,
          savingsPercentage: Math.max(0, Math.round(((originalSize - convertedBlob.size) / originalSize) * 100)),
          durationSeconds: 0,
          sampleRate: targetSampleRate,
          channels: 1,
          wavBlob: convertedBlob,
          base64Data
        };
      }
    } catch (serverConvErr) {
      console.warn('Server conversion request failed:', serverConvErr);
    }

    // 5. If everything fails, preserve 100% of real audio data by returning original base64
    return {
      originalSize,
      optimizedSize: originalSize,
      savingsPercentage: 0,
      durationSeconds: 0,
      sampleRate: 8000,
      channels: 1,
      wavBlob: file instanceof Blob ? file : new Blob([file]),
      base64Data: originalBase64
    };

  } catch (error) {
    console.error('Error during audio optimization, falling back to original audio:', error);
    const fallbackBase64 = await blobToBase64(file);
    return {
      originalSize,
      optimizedSize: originalSize,
      savingsPercentage: 0,
      durationSeconds: 0,
      sampleRate: 8000,
      channels: 1,
      wavBlob: file instanceof Blob ? file : new Blob([file]),
      base64Data: fallbackBase64
    };
  }
}

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count (1 for mono) */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples (16-bit clamp)
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
