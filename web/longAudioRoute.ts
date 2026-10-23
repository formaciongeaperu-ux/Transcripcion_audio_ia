import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GoogleGenAI } from '@google/genai';
import { del, issueSignedToken, presignUrl } from '@vercel/blob';
import {
  AnalysisError,
  auditTranscript,
  mergeWindowSegments,
  planWindows,
  probeSourceDuration,
  transcribeSourceWindow,
  type TranscriptSegment,
} from '../longAudioAnalysis.ts';
import { readCalibration } from '../calibrationStore.ts';
import { finalizeCallAnalysis, getActiveFullPrompt, qaSchemaWithoutTranscript } from '../qaEngine.ts';

const AUDIT_INSTRUCTION = `INSTRUCCIÓN DE ESTA EJECUCIÓN:
La transcripción literal ya fue hecha por completo y viene en el mensaje del usuario.
No la repitas. Evalúa la pauta, el tNPS, los silencios, los quiebres y el coaching sobre ese texto íntegro.`;

function send(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function readJson(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    return Promise.resolve(req.body ? JSON.parse(req.body) : {});
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new AnalysisError('El cuerpo de la petición no es JSON', 400, 'BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function publicMessage(err: unknown): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN || '';
  let message = err instanceof Error ? err.message : 'No se pudo analizar el audio';
  if (token) message = message.split(token).join('[token]');
  message = message
    .replace(/Bearer\s+\S+/gi, 'Bearer [token]')
    .replace(/https:\/\/\S*blob\.vercel-storage\.com\S*/gi, 'https://blob.vercel-storage.com/[audio]');
  try {
    const parsed = JSON.parse(message) as { error?: { message?: string } };
    if (parsed?.error?.message) message = parsed.error.message;
  } catch {
    // The provider sometimes returns plain text.
  }
  if (/high demand|UNAVAILABLE|currently experiencing|overloaded/i.test(message)) {
    return 'Gemini está saturado en este momento. Espera un minuto y vuelve a iniciar la auditoría.';
  }
  return message.slice(0, 500);
}

function assertBlobUrl(value: unknown): string {
  let parsed: URL;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new AnalysisError('El audio subido no es válido', 400, 'BAD_BLOB');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.blob.vercel-storage.com')) {
    throw new AnalysisError('El audio subido no es válido', 400, 'BAD_BLOB');
  }
  return parsed.toString();
}

async function readableAudioUrl(blobUrl: string): Promise<string> {
  const pathname = decodeURIComponent(new URL(blobUrl).pathname.replace(/^\/+/, ''));
  const validUntil = Date.now() + 10 * 60 * 1000;
  const signed = await issueSignedToken({
    pathname,
    operations: ['get', 'head'],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(signed, {
    access: 'private',
    operation: 'get',
    pathname,
    validUntil,
  });
  return presignedUrl;
}

function getAI(): GoogleGenAI {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key || key === '[SENSITIVE]') {
    throw new AnalysisError('GEMINI_API_KEY no está configurada en el servidor', 500, 'API_KEY_MISSING');
  }
  return new GoogleGenAI({ apiKey: key });
}

const sourceCache = new Map<string, Promise<string>>();

async function materializeBlob(url: string, signal?: AbortSignal): Promise<string> {
  const dest = path.join(os.tmpdir(), `gea-src-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  try {
    const response = await fetch(await readableAudioUrl(url), { signal });
    if (!response.ok || !response.body) {
      throw new AnalysisError('No se pudo leer el audio subido', 502, 'BLOB_READ_FAILED');
    }
    const webStream = response.body as unknown as import('node:stream/web').ReadableStream;
    await pipeline(Readable.fromWeb(webStream), fs.createWriteStream(dest), { signal });
    return dest;
  } catch (err) {
    fs.promises.unlink(dest).catch(() => {});
    if (signal?.aborted) {
      throw new AnalysisError('El tramo tardó demasiado para transcribirlo de una vez', 422, 'SPLIT_REQUIRED');
    }
    throw err;
  }
}

function cachedSource(blobUrl: string, signal?: AbortSignal): Promise<string> {
  const existing = sourceCache.get(blobUrl);
  if (existing) return existing;
  const created = materializeBlob(blobUrl, signal).catch((err) => {
    sourceCache.delete(blobUrl);
    throw err;
  });
  sourceCache.set(blobUrl, created);
  return created;
}

async function planCall(blobUrl: string) {
  const local = await cachedSource(blobUrl);
  const durationSeconds = await probeSourceDuration(local);
  return { success: true, durationSeconds, windows: planWindows(durationSeconds) };
}

function withDeadline<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new AnalysisError('El tramo tardó demasiado para transcribirlo de una vez', 422, 'SPLIT_REQUIRED'));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function transcribeCall(blobUrl: string, start: number, length: number) {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(length) || length <= 0) {
    throw new AnalysisError('El tramo pedido no es válido', 400, 'BAD_WINDOW');
  }
  if (length > 200) {
    throw new AnalysisError('El tramo es demasiado largo para transcribirlo de una vez', 422, 'SPLIT_REQUIRED');
  }
  const abort = new AbortController();
  return withDeadline((async () => {
    const local = await cachedSource(blobUrl, abort.signal);
    const segments = await transcribeSourceWindow({
      ai: getAI(),
      source: local,
      start,
      length,
      signal: abort.signal,
    });
    return { success: true, segments };
  })(), 34_000, () => abort.abort());
}

async function auditCall(body: any) {
  const groups = Array.isArray(body.groups) ? body.groups as TranscriptSegment[][] : [];
  const segmentos = mergeWindowSegments(groups);
  if (segmentos.length === 0) {
    throw new AnalysisError('La transcripción llegó vacía. El audio no tiene voz reconocible o el modelo no pudo escucharlo.', 422, 'EMPTY_TRANSCRIPT');
  }
  const durationSeconds = Number(body.durationSeconds) || segmentos[segmentos.length - 1]?.fin || 0;
  const agentName = String(body.agentName || 'Asesor Claro');
  const agentId = String(body.agentId || '');
  const queue = String(body.queue || 'General');
  const fileName = String(body.fileName || 'grabacion.wav');
  const calibration = await readCalibration();
  const { audit, modelUsed } = await auditTranscript({
    ai: getAI(),
    segmentos,
    durationSeconds,
    agentName,
    queue,
    auditSystemPrompt: `${getActiveFullPrompt(calibration)}\n\n${AUDIT_INSTRUCTION}`,
    auditSchema: qaSchemaWithoutTranscript(),
  });
  const parsed = {
    ...audit,
    segmentos,
    silencio_analisis: {
      ...((audit.silencio_analisis as Record<string, unknown> | undefined) || {}),
      duracion_total_segundos: durationSeconds,
    },
  };
  return {
    success: true,
    data: finalizeCallAnalysis(parsed, {
      model: modelUsed,
      fileName,
      agentName,
      agentId,
      queue,
      durationSeconds,
    }),
  };
}

async function cleanupCall(blobUrl: string) {
  const pending = sourceCache.get(blobUrl);
  sourceCache.delete(blobUrl);
  if (pending) {
    const local = await pending.catch(() => '');
    if (local) fs.promises.unlink(local).catch(() => {});
  }
  await del(blobUrl).catch(() => undefined);
  return { success: true };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    send(res, 405, { success: false, message: 'Método no permitido' });
    return;
  }
  try {
    const body = await readJson(req);
    const action = String(body.action || '');
    if (action === 'plan') {
      send(res, 200, await planCall(assertBlobUrl(body.blobUrl)));
      return;
    }
    if (action === 'transcribe') {
      send(res, 200, await transcribeCall(assertBlobUrl(body.blobUrl), Number(body.start), Number(body.length)));
      return;
    }
    if (action === 'audit') {
      send(res, 200, await auditCall(body));
      return;
    }
    if (action === 'cleanup') {
      send(res, 200, await cleanupCall(assertBlobUrl(body.blobUrl)));
      return;
    }
    send(res, 400, { success: false, message: 'Acción no reconocida' });
  } catch (err) {
    const status = err instanceof AnalysisError ? err.status : 500;
    send(res, status, {
      success: false,
      message: publicMessage(err),
      errorType: err instanceof AnalysisError ? err.errorType : 'SERVER_ERROR',
    });
  }
}
