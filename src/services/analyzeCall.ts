import { upload } from '@vercel/blob/client';

export interface AnalyzeCallMeta {
  fileName?: string;
  agentName: string;
  agentId: string;
  queue: string;
}

export interface AnalyzeCallResult {
  ok: boolean;
  status: number;
  data: {
    success?: boolean;
    data?: unknown;
    message?: string;
    errorType?: string;
    durationSeconds?: number;
    windows?: Array<{ start: number; length: number }>;
    segments?: TranscriptSegment[];
  };
}

interface AudioWindow {
  start: number;
  length: number;
}

interface TranscriptSegment {
  hablante: 'agente' | 'cliente';
  inicio: number;
  fin: number;
  texto: string;
  sentimientoScore: number;
}

export function postAudioForAnalysis(file: File, meta: AnalyzeCallMeta): Promise<Response> {
  return fetch('/api/analyze-call', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(meta.fileName || file.name),
      'X-Agent-Name': encodeURIComponent(meta.agentName),
      'X-Agent-Id': encodeURIComponent(meta.agentId),
      'X-Queue': encodeURIComponent(meta.queue),
    },
    body: file,
  });
}

async function postJson(url: string, payload: unknown): Promise<AnalyzeCallResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function transcribeSpan(blobUrl: string, start: number, length: number, depth = 0, attempt = 0): Promise<TranscriptSegment[]> {
  const result = await postJson('/api/long-audio', { action: 'transcribe', blobUrl, start, length });
  const busy = result.status === 502 || result.status === 503 || result.data.errorType === 'MODEL_ERROR';
  if (busy && attempt < 2 && result.data.errorType !== 'SPLIT_REQUIRED') {
    await sleep(3000 * (attempt + 1));
    return transcribeSpan(blobUrl, start, length, depth, attempt + 1);
  }
  const shouldSplit = result.data.errorType === 'SPLIT_REQUIRED'
    || result.data.errorType === 'TIMEOUT'
    || result.status === 504;
  if (shouldSplit && length > 40 && depth < 5) {
    const half = length / 2;
    const left = await transcribeSpan(blobUrl, start, half, depth + 1);
    const right = await transcribeSpan(blobUrl, start + half, length - half, depth + 1);
    return [...left, ...right];
  }
  if (!result.ok || !result.data.success) {
    const error = new Error(result.data.message || 'No se pudo transcribir un tramo del audio');
    (error as Error & { status?: number; errorType?: string }).status = result.status;
    (error as Error & { errorType?: string }).errorType = result.data.errorType;
    throw error;
  }
  return Array.isArray(result.data.segments) ? result.data.segments as TranscriptSegment[] : [];
}

async function analyzeOnWeb(
  file: File,
  meta: AnalyzeCallMeta,
  onProgress?: (progress: number, detail: string) => void
): Promise<AnalyzeCallResult> {
  onProgress?.(2, 'Subiendo audio');
  const blob = await upload(meta.fileName || file.name, file, {
    access: 'private',
    handleUploadUrl: '/api/blob-upload',
    contentType: file.type || 'application/octet-stream',
    multipart: file.size > 4 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => {
      onProgress?.(Math.max(2, Math.min(10, Math.round(percentage * 0.1))), 'Subiendo audio');
    },
  });

  try {
    onProgress?.(12, 'Leyendo duración');
    const plan = await postJson('/api/long-audio', { action: 'plan', blobUrl: blob.url });
    if (!plan.ok || !plan.data.success) return plan;

    const windows = (plan.data.windows || []) as AudioWindow[];
    const groups: TranscriptSegment[][] = [];
    for (let index = 0; index < windows.length; index++) {
      const window = windows[index];
      const progress = 14 + Math.round((index / Math.max(1, windows.length)) * 74);
      onProgress?.(progress, `Tramo ${index + 1} de ${windows.length}`);
      groups.push(await transcribeSpan(blob.url, window.start, window.length));
    }

    onProgress?.(92, 'Auditando la llamada');
    const auditPayload = {
      action: 'audit',
      durationSeconds: plan.data.durationSeconds,
      groups,
      fileName: meta.fileName || file.name,
      agentName: meta.agentName,
      agentId: meta.agentId,
      queue: meta.queue,
    };
    let audit = await postJson('/api/long-audio', auditPayload);
    if (!audit.ok && (audit.status === 504 || audit.data.errorType === 'TIMEOUT')) {
      onProgress?.(95, 'Reintentando la auditoría');
      audit = await postJson('/api/long-audio', auditPayload);
    }
    return audit;
  } finally {
    await postJson('/api/long-audio', { action: 'cleanup', blobUrl: blob.url }).catch(() => undefined);
  }
}

export async function analyzeUploadedCall(
  file: File,
  meta: AnalyzeCallMeta,
  onProgress?: (progress: number, detail: string) => void
): Promise<AnalyzeCallResult> {
  const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
  const runsLocally = host === 'localhost' || host === '127.0.0.1';
  if (runsLocally) {
    onProgress?.(30, 'Transcribiendo');
    const response = await postAudioForAnalysis(file, meta);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }
  try {
    return await analyzeOnWeb(file, meta, onProgress);
  } catch (err) {
    const error = err as Error & { status?: number; errorType?: string };
    return {
      ok: false,
      status: error.status || 500,
      data: {
        success: false,
        message: error.message || 'No se pudo analizar el audio',
        errorType: error.errorType,
      },
    };
  }
}
