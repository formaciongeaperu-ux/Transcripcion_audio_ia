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

const BUSY_WAITS_MS = [12_000, 18_000, 24_000, 30_000, 40_000, 50_000, 60_000, 60_000];
const MIN_SPAN_SEC = 8;
const MAX_SPLIT_DEPTH = 8;
const PROGRESS_KEY = 'gea_transcript_progress_v1';

interface SavedProgress {
  blobUrl: string;
  durationSeconds: number;
  windows: AudioWindow[];
  groups: TranscriptSegment[][];
  nextIndex: number;
}

const memoryProgress = new Map<string, SavedProgress>();

function fileKey(file: File): string {
  return `${file.name}\n${file.size}\n${file.lastModified}`;
}

function recallProgress(key: string): SavedProgress | null {
  const cached = memoryProgress.get(key);
  if (cached) return cached;
  try {
    const all = JSON.parse(sessionStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, SavedProgress>;
    return all[key] || null;
  } catch {
    return null;
  }
}

function rememberProgress(key: string, progress: SavedProgress | null) {
  if (progress) memoryProgress.set(key, progress);
  else memoryProgress.delete(key);
  try {
    const all = JSON.parse(sessionStorage.getItem(PROGRESS_KEY) || '{}') as Record<string, SavedProgress>;
    if (progress) all[key] = progress;
    else delete all[key];
    sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // Si el navegador no alcanza a guardar, la copia en memoria sigue sirviendo en esta pestaña.
  }
}

function samePlan(left: AudioWindow[], right: AudioWindow[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((window, index) =>
    Math.abs(window.start - right[index].start) < 0.5
    && Math.abs(window.length - right[index].length) < 0.5
  );
}

function spanTooSlow(result: AnalyzeCallResult): boolean {
  if (result.data.errorType === 'SPLIT_REQUIRED' || result.data.errorType === 'TIMEOUT' || result.status === 504) {
    return true;
  }
  return /tardó demasiado|demasiado largo/i.test(result.data.message || '');
}

function geminiBusy(result: AnalyzeCallResult): boolean {
  if (result.status === 401 || result.status === 429) return false;
  if (result.status === 503 || result.data.errorType === 'MODEL_BUSY') return true;
  return /saturado|high demand|UNAVAILABLE/i.test(result.data.message || '');
}

async function transcribeSpan(
  blobUrl: string,
  start: number,
  length: number,
  depth = 0,
  attempt = 0,
  onWait?: (detail: string) => void
): Promise<TranscriptSegment[]> {
  let result: AnalyzeCallResult;
  try {
    result = await postJson('/api/long-audio', { action: 'transcribe', blobUrl, start, length });
  } catch {
    if (length > MIN_SPAN_SEC && depth < MAX_SPLIT_DEPTH) {
      const half = length / 2;
      const left = await transcribeSpan(blobUrl, start, half, depth + 1, 0, onWait);
      const right = await transcribeSpan(blobUrl, start + half, length - half, depth + 1, 0, onWait);
      return [...left, ...right];
    }
    if (attempt < 2) {
      onWait?.(`Se cortó la conexión. Reintento ${attempt + 1} de 2`);
      await sleep(4000 * (attempt + 1));
      return transcribeSpan(blobUrl, start, length, depth, attempt + 1, onWait);
    }
    throw new Error('Se cortó la conexión al transcribir un tramo. Pulsa Continuar para retomarlo.');
  }
  if (spanTooSlow(result) && length > MIN_SPAN_SEC && depth < MAX_SPLIT_DEPTH) {
    const half = length / 2;
    const left = await transcribeSpan(blobUrl, start, half, depth + 1, 0, onWait);
    const right = await transcribeSpan(blobUrl, start + half, length - half, depth + 1, 0, onWait);
    return [...left, ...right];
  }
  if (spanTooSlow(result) && attempt < 3) {
    onWait?.(`El tramo no alcanzó. Reintento ${attempt + 1} de 3`);
    await sleep(5000 * (attempt + 1));
    return transcribeSpan(blobUrl, start, length, depth, attempt + 1, onWait);
  }
  if (geminiBusy(result) && attempt < BUSY_WAITS_MS.length) {
    onWait?.(`Gemini ocupado, reintento ${attempt + 1} de ${BUSY_WAITS_MS.length}`);
    await sleep(BUSY_WAITS_MS[attempt]);
    return transcribeSpan(blobUrl, start, length, depth, attempt + 1, onWait);
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
  const key = fileKey(file);
  const saved = recallProgress(key);
  let blobUrl = saved?.blobUrl || '';
  let keepBlob = false;

  const uploadAudio = async () => {
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
    blobUrl = blob.url;
  };

  try {
    if (!blobUrl) await uploadAudio();

    onProgress?.(12, saved?.nextIndex ? `Retomando en el tramo ${saved.nextIndex + 1}` : 'Leyendo duración');
    let plan = await postJson('/api/long-audio', { action: 'plan', blobUrl });
    if ((!plan.ok || !plan.data.success) && saved?.blobUrl) {
      await uploadAudio();
      plan = await postJson('/api/long-audio', { action: 'plan', blobUrl });
    }
    if (!plan.ok || !plan.data.success) return plan;

    const windows = (plan.data.windows || []) as AudioWindow[];
    const durationSeconds = Number(plan.data.durationSeconds) || 0;
    const canResume = Boolean(saved && samePlan(saved.windows, windows));
    const groups: TranscriptSegment[][] = canResume ? saved!.groups.slice() : [];
    let nextIndex = canResume ? Math.min(saved!.nextIndex, windows.length) : 0;
    keepBlob = true;

    const store = () => rememberProgress(key, { blobUrl, durationSeconds, windows, groups, nextIndex });
    store();

    for (let index = nextIndex; index < windows.length; index++) {
      const window = windows[index];
      const progress = 14 + Math.round((index / Math.max(1, windows.length)) * 74);
      onProgress?.(progress, `Tramo ${index + 1} de ${windows.length}`);
      try {
        groups[index] = await transcribeSpan(blobUrl, window.start, window.length, 0, 0, (detail) => {
          onProgress?.(progress, detail);
        });
      } catch (err) {
        nextIndex = index;
        store();
        const reason = err instanceof Error ? err.message : 'No se pudo transcribir el tramo';
        const notice = index === 0
          ? 'No se pudo transcribir el primer tramo. Pulsa Continuar para reintentarlo.'
          : `Se guardó hasta el tramo ${index} de ${windows.length}. Pulsa Continuar para retomar ese audio.`;
        throw new Error(`${notice} ${reason}`);
      }
      nextIndex = index + 1;
      store();
    }

    onProgress?.(92, 'Auditando la llamada');
    const auditPayload = {
      action: 'audit',
      durationSeconds,
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
    if (audit.ok && audit.data.success) {
      keepBlob = false;
      rememberProgress(key, null);
    }
    return audit;
  } finally {
    if (blobUrl && !keepBlob) {
      await postJson('/api/long-audio', { action: 'cleanup', blobUrl }).catch(() => undefined);
    }
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
