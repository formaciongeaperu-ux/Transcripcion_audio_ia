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

function auditNeedsRetry(result: AnalyzeCallResult): boolean {
  if (result.ok && result.data.success) return false;
  if (result.status === 401 || result.status === 429) return false;
  const kind = result.data.errorType;
  if (kind === 'API_KEY_INVALID' || kind === 'QUOTA_EXHAUSTED_ALL_MODELS' || kind === 'EMPTY_TRANSCRIPT') return false;
  return result.status === 502 || result.status === 503 || result.status === 504
    || kind === 'MODEL_BUSY' || kind === 'MODEL_ERROR' || kind === 'TIMEOUT';
}

async function transcribeSpan(blobUrl: string, start: number, length: number, depth = 0, attempt = 0): Promise<TranscriptSegment[]> {
  let result: AnalyzeCallResult;
  try {
    result = await postJson('/api/long-audio', { action: 'transcribe', blobUrl, start, length });
  } catch {
    if (length > 20 && depth < 6) {
      const half = length / 2;
      const left = await transcribeSpan(blobUrl, start, half, depth + 1);
      const right = await transcribeSpan(blobUrl, start + half, length - half, depth + 1);
      return [...left, ...right];
    }
    throw new Error('Se cortó la conexión al transcribir un tramo. Vuelve a iniciar la auditoría.');
  }
  const shouldSplit = result.data.errorType === 'SPLIT_REQUIRED'
    || result.data.errorType === 'TIMEOUT'
    || result.status === 504;
  if (shouldSplit && length > 20 && depth < 6) {
    const half = length / 2;
    const left = await transcribeSpan(blobUrl, start, half, depth + 1);
    const right = await transcribeSpan(blobUrl, start + half, length - half, depth + 1);
    return [...left, ...right];
  }
  const busy = result.status === 503 || result.data.errorType === 'MODEL_BUSY';
  if (busy && attempt < 2) {
    await sleep(8000 * (attempt + 1));
    return transcribeSpan(blobUrl, start, length, depth, attempt + 1);
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
    for (let attempt = 1; attempt <= 5 && auditNeedsRetry(audit); attempt++) {
      onProgress?.(93, `La transcripción ya está. Reintentando la auditoría (${attempt} de 5)`);
      await sleep(10000 * attempt);
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
