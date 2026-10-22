import { execFile } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleGenAI, Type, type File } from '@google/genai';

const TRANSCRIBE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
];
const AUDIT_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite',
];

const OVERLAP_SEC = 20;
const WINDOW_SEC = 600;
const MAX_INLINE_BYTES = 12 * 1024 * 1024;
const MODEL_TIMEOUT_MS = 180_000;

export class AnalysisError extends Error {
  status: number;
  errorType?: string;
  constructor(message: string, status = 500, errorType?: string) {
    super(message);
    this.name = 'AnalysisError';
    this.status = status;
    this.errorType = errorType;
  }
}

export interface TranscriptSegment {
  id: string;
  hablante: 'agente' | 'cliente';
  inicio: number;
  fin: number;
  texto: string;
  sentimientoScore: number;
}

interface WindowSegment {
  hablante: 'agente' | 'cliente';
  inicio: number;
  fin: number;
  texto: string;
  sentimientoScore: number;
}

export interface LongAudioResult {
  audit: Record<string, unknown>;
  segmentos: TranscriptSegment[];
  durationSeconds: number;
  modelUsed: string;
  windows: number;
  usage: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

interface Usage {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

const transcriptSchema = {
  type: Type.OBJECT,
  properties: {
    segmentos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hablante: { type: Type.STRING, description: 'agente o cliente' },
          inicio: { type: Type.NUMBER, description: 'Segundo de inicio relativo a este tramo, donde 0 es el inicio del tramo' },
          fin: { type: Type.NUMBER, description: 'Segundo de fin relativo a este tramo' },
          texto: { type: Type.STRING, description: 'Transcripción literal del turno, sin resumir' },
          sentimientoScore: { type: Type.NUMBER, description: 'De -1.0 a 1.0' },
        },
        required: ['hablante', 'inicio', 'fin', 'texto', 'sentimientoScore'],
      },
    },
  },
  required: ['segmentos'],
};

function markExecutable(filePath: string): string {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // Windows does not use this bit.
  }
  return filePath;
}

function resolveFfmpeg(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return markExecutable(process.env.FFMPEG_PATH);
  }
  const functionDir = path.dirname(process.argv[1] || '');
  const roots = [process.cwd(), functionDir, path.resolve(functionDir, '..'), '/var/task'].filter(Boolean);
  const relative = [
    ['vendor', 'ffmpeg'],
    ['vendor', 'ffmpeg.exe'],
    ['node_modules', 'ffmpeg-static', 'ffmpeg'],
    ['node_modules', 'ffmpeg-static', 'ffmpeg.exe'],
  ];
  for (const root of roots) {
    for (const parts of relative) {
      const candidate = path.join(root, ...parts);
      if (fs.existsSync(candidate)) return markExecutable(candidate);
    }
    const packageJson = path.join(root, 'package.json');
    if (!fs.existsSync(packageJson)) continue;
    try {
      const bundled = createRequire(packageJson)('ffmpeg-static') as string | null;
      if (bundled && fs.existsSync(bundled)) return markExecutable(bundled);
    } catch {
      // The package is optional at import time; the caller reports a clear error.
    }
  }
  return 'ffmpeg';
}

function runCmd(bin: string, args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const wrapped = err as NodeJS.ErrnoException & { stderr?: string };
        wrapped.stderr = stderr;
        reject(wrapped);
        return;
      }
      resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function probeDuration(ffmpeg: string, filePath: string, headers?: string, timeoutMs = 60_000): Promise<number> {
  let stdout = '';
  let stderr = '';
  const args = ['-hide_banner'];
  if (headers) args.push('-headers', headers);
  args.push('-probesize', '8000000', '-analyzeduration', '8000000', '-i', filePath);
  try {
    const result = await runCmd(ffmpeg, args, timeoutMs);
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { stderr?: string };
    stdout = '';
    stderr = error.stderr || error.message || '';
    if (error.code === 'ENOENT') {
      throw new AnalysisError(
        'No está disponible ffmpeg, que hace falta para cortar el audio en tramos sin perder diálogo.',
        500,
        'FFMPEG_MISSING'
      );
    }
  }

  const match = `${stdout}\n${stderr}`.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) {
    throw new AnalysisError('No se pudo leer la duración del audio. Revisa que el archivo no esté dañado.', 400, 'DURATION_UNREADABLE');
  }
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new AnalysisError('La duración del audio no es válida.', 400, 'DURATION_UNREADABLE');
  }
  return seconds;
}

async function pickEncoder(ffmpeg: string): Promise<'mp3' | 'aac' | 'wav'> {
  try {
    const { stdout, stderr } = await runCmd(ffmpeg, ['-hide_banner', '-encoders'], 30_000);
    const text = `${stdout}\n${stderr}`;
    if (/libmp3lame|\baac\b/.test(text) && /libmp3lame/.test(text)) return 'mp3';
    if (/\baac\b/.test(text)) return 'aac';
  } catch {
    // Fall through to WAV, which every ffmpeg build can write.
  }
  return 'wav';
}

function windowStarts(duration: number, windowSec: number): number[] {
  if (duration <= windowSec + 5) return [0];
  const step = Math.max(30, windowSec - OVERLAP_SEC);
  const starts: number[] = [];
  for (let start = 0; start < duration - 1; start += step) {
    starts.push(Math.round(start * 1000) / 1000);
    if (start + windowSec >= duration - 1) break;
  }
  return starts;
}

function ffmpegInputArgs(start: number, length: number, input: string, headers?: string): string[] {
  const args = ['-y', '-ss', String(start), '-t', String(length)];
  if (headers) args.push('-headers', headers);
  args.push('-i', input);
  return args;
}

async function extractWithCodec(
  ffmpeg: string,
  input: string,
  start: number,
  length: number,
  outputBase: string,
  encoder: 'mp3' | 'aac' | 'wav',
  headers?: string,
  timeoutMs = 120_000
): Promise<{ filePath: string; mimeType: string }> {
  const inputArgs = ffmpegInputArgs(start, length, input, headers);
  if (encoder === 'mp3') {
    const filePath = `${outputBase}.mp3`;
    await runCmd(ffmpeg, [
      ...inputArgs,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '32k', filePath,
    ], timeoutMs);
    return { filePath, mimeType: 'audio/mpeg' };
  }
  if (encoder === 'aac') {
    const filePath = `${outputBase}.m4a`;
    await runCmd(ffmpeg, [
      ...inputArgs,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '32k', filePath,
    ], timeoutMs);
    return { filePath, mimeType: 'audio/m4a' };
  }
  const filePath = `${outputBase}.wav`;
  await runCmd(ffmpeg, [
    ...inputArgs,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', filePath,
  ], timeoutMs);
  return { filePath, mimeType: 'audio/wav' };
}

async function extractWindow(
  ffmpeg: string,
  input: string,
  start: number,
  length: number,
  outputBase: string,
  encoder: 'mp3' | 'aac' | 'wav',
  headers?: string,
  timeoutMs = 120_000
): Promise<{ filePath: string; mimeType: string }> {
  const order: Array<'mp3' | 'aac' | 'wav'> = encoder === 'wav'
    ? ['wav']
    : encoder === 'aac'
      ? ['aac', 'wav']
      : ['mp3', 'aac', 'wav'];
  let lastError: unknown;
  for (const codec of order) {
    try {
      return await extractWithCodec(ffmpeg, input, start, length, outputBase, codec, headers, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }
  const error = lastError as { message?: string };
  throw new AnalysisError(error?.message || 'No se pudo recortar el audio en tramos', 500, 'FFMPEG_SPLIT_FAILED');
}

function emptyUsage(): Usage {
  return { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
}

function addUsage(total: Usage, extra?: Partial<Usage> | null) {
  total.promptTokenCount += extra?.promptTokenCount || 0;
  total.candidatesTokenCount += extra?.candidatesTokenCount || 0;
  total.totalTokenCount += extra?.totalTokenCount || 0;
}

function parseModelJson(text: string): unknown {
  let raw = text.trim();
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  return JSON.parse(raw);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GenerateJsonResult {
  json: unknown;
  usage: Usage;
  truncated: boolean;
}

async function generateJson(
  ai: GoogleGenAI,
  model: string,
  parts: Array<Record<string, unknown>>,
  schema: object,
  systemInstruction: string,
  maxOutputTokens: number,
  temperature: number,
  acceptTruncated = false,
  limits?: { timeoutMs?: number; maxAttempts?: number }
): Promise<GenerateJsonResult> {
  const timeoutMs = limits?.timeoutMs ?? MODEL_TIMEOUT_MS;
  const maxAttempts = limits?.maxAttempts ?? 3;
  const configs: Array<Record<string, unknown>> = [
    {
      systemInstruction,
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
      thinkingConfig: { thinkingLevel: 'MINIMAL' },
    },
    {
      systemInstruction,
      temperature,
      maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: schema,
    },
  ];

  let lastError: unknown;
  for (const config of configs) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AnalysisError(`El modelo ${model} no respondió a tiempo`, 504, 'TIMEOUT')), timeoutMs);
        });
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
            config,
          }),
          timeout,
        ]) as {
          text?: string;
          usageMetadata?: Partial<Usage>;
          candidates?: Array<{ finishReason?: string }>;
        };
        clearTimeout(timer);

        const finish = response.candidates?.[0]?.finishReason || '';
        const text = response.text?.trim() || '';
        if (!text) {
          throw new AnalysisError(`El modelo ${model} devolvió una respuesta vacía`, 502, 'EMPTY_RESPONSE');
        }
        let json: unknown;
        try {
          json = parseModelJson(text);
        } catch {
          throw new AnalysisError('La respuesta de Gemini llegó cortada', 502, 'TRUNCATED');
        }
        if (finish === 'MAX_TOKENS' && !acceptTruncated) {
          throw new AnalysisError('La respuesta de Gemini llegó cortada', 502, 'TRUNCATED');
        }
        return {
          json,
          usage: {
            promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
            candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokenCount: response.usageMetadata?.totalTokenCount || 0,
          },
          truncated: false,
        };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (err instanceof AnalysisError && (err.errorType === 'TRUNCATED' || err.errorType === 'TIMEOUT' || err.status === 401)) throw err;
        const error = err as { status?: number; message?: string };
        const message = error.message || String(err);
        const status = error.status || (err instanceof AnalysisError ? err.status : 500);
        if (status === 401 || status === 403 || /API_KEY_INVALID|unregistered project/i.test(message)) {
          throw new AnalysisError(
            'La clave de Gemini API es inválida o no tiene permisos. Revísala en Google AI Studio.',
            401,
            'API_KEY_INVALID'
          );
        }
        const thinkingRejected = /thinking/i.test(message) && Boolean(config.thinkingConfig);
        if (thinkingRejected) break;
        const busy = status === 503 || /high demand|UNAVAILABLE|overloaded|currently experiencing/i.test(message);
        if (busy) {
          throw new AnalysisError('Gemini está saturado en este modelo. Se intenta con otro.', 503, 'MODEL_BUSY');
        }
        const is429 = status === 429 || /429|quota|Too Many Requests/i.test(message);
        if (is429 && attempt < maxAttempts) {
          await sleep(Math.pow(2, attempt) * 1000);
          continue;
        }
        if (is429) {
          throw new AnalysisError(
            'Se agotó la cuota de Gemini. La llamada puede reintentarse desde la cola diferida.',
            429,
            'QUOTA_EXHAUSTED_ALL_MODELS'
          );
        }
        if (attempt < maxAttempts && (status >= 500 || err instanceof AnalysisError)) {
          await sleep(1000 * attempt);
          continue;
        }
        break;
      }
    }
  }
  const error = lastError as { message?: string };
  throw new AnalysisError(error?.message || 'No se pudo analizar el audio con Gemini', 502, 'MODEL_ERROR');
}

async function uploadAndWait(ai: GoogleGenAI, filePath: string, mimeType: string): Promise<File> {
  let file = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });
  const started = Date.now();
  while (file.state === 'PROCESSING' && Date.now() - started < 120_000) {
    await sleep(2000);
    if (!file.name) break;
    file = await ai.files.get({ name: file.name });
  }
  if (file.state === 'FAILED') {
    throw new AnalysisError(file.error?.message || 'Gemini no pudo procesar el archivo de audio', 502, 'FILE_PROCESSING_FAILED');
  }
  return file;
}

async function audioPartForFile(
  ai: GoogleGenAI,
  filePath: string,
  mimeType: string,
  remoteNames: string[]
): Promise<Record<string, unknown>> {
  const size = (await fs.promises.stat(filePath)).size;
  if (size <= MAX_INLINE_BYTES) {
    const data = (await fs.promises.readFile(filePath)).toString('base64');
    return { inlineData: { data, mimeType } };
  }
  const uploaded = await uploadAndWait(ai, filePath, mimeType);
  if (uploaded.name) remoteNames.push(uploaded.name);
  if (!uploaded.uri) {
    throw new AnalysisError('Gemini no devolvió la referencia del audio subido', 502, 'FILE_UPLOAD_FAILED');
  }
  return { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType || mimeType } };
}

function normalizeSpeaker(value: unknown): 'agente' | 'cliente' {
  const text = String(value || '').toLowerCase();
  if (text.includes('client') || text.includes('usuario') || text.includes('customer')) return 'cliente';
  return 'agente';
}

function asSegments(payload: unknown, windowStart: number, windowLength: number): WindowSegment[] {
  const segmentos = (payload as { segmentos?: unknown[] })?.segmentos;
  if (!Array.isArray(segmentos)) return [];
  const result: WindowSegment[] = [];
  for (const item of segmentos) {
    const seg = item as { hablante?: unknown; inicio?: unknown; fin?: unknown; texto?: unknown; sentimientoScore?: unknown };
    const texto = String(seg.texto || '').trim();
    if (!texto) continue;
    let inicio = Number(seg.inicio);
    let fin = Number(seg.fin);
    if (!Number.isFinite(inicio)) inicio = 0;
    if (!Number.isFinite(fin)) fin = inicio;
    const looksAbsolute = inicio > windowLength + 2 && inicio >= windowStart - 2;
    if (!looksAbsolute) {
      inicio += windowStart;
      fin += windowStart;
    }
    if (fin < inicio) fin = inicio;
    const score = Number(seg.sentimientoScore);
    result.push({
      hablante: normalizeSpeaker(seg.hablante),
      inicio,
      fin,
      texto,
      sentimientoScore: Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0,
    });
  }
  return result.sort((a, b) => a.inicio - b.inicio);
}

function rangesOverlap(a: WindowSegment, b: WindowSegment): boolean {
  const overlap = Math.min(a.fin, b.fin) - Math.max(a.inicio, b.inicio);
  if (a.texto === b.texto && Math.abs(a.inicio - b.inicio) < 8) return true;
  if (overlap <= 0.3) return false;
  const shorter = Math.max(0.1, Math.min(a.fin - a.inicio, b.fin - b.inicio));
  return overlap / shorter > 0.45;
}

export function mergeWindowSegments(groups: WindowSegment[][]): TranscriptSegment[] {
  const flat = groups.flat().sort((a, b) => a.inicio - b.inicio || (b.fin - b.inicio) - (a.fin - a.inicio));
  const kept: WindowSegment[] = [];
  for (const seg of flat) {
    const index = kept.findIndex((prev) => rangesOverlap(prev, seg));
    if (index === -1) {
      kept.push(seg);
      continue;
    }
    const prev = kept[index];
    if (seg.fin - seg.inicio > prev.fin - prev.inicio + 0.4) kept[index] = seg;
  }
  kept.sort((a, b) => a.inicio - b.inicio);
  return kept.map((seg, index) => ({
    id: `seg-${index + 1}`,
    ...seg,
  }));
}

function formatStamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function transcriptForAudit(segmentos: TranscriptSegment[]): string {
  return segmentos
    .map((seg) => `[${formatStamp(seg.inicio)} ${seg.hablante}] ${seg.texto}`)
    .join('\n');
}

const TRANSCRIBE_SYSTEM = `Eres un transcriptor literal de llamadas de contact center de Claro Chile.
Transcribes palabra por palabra lo que se escucha, incluidos modismos chilenos y el habla del asesor.
No resumes, no inventas turnos y no completas frases que no se escuchan.
Cada turno lleva hablante "agente" o "cliente", inicio y fin en segundos relativos a este tramo (0 es el inicio del tramo) y un sentimientoScore de -1 a 1.`;

async function transcribeWindow(
  ai: GoogleGenAI,
  audioPart: Record<string, unknown>,
  start: number,
  length: number,
  usage: Usage,
  limits?: { timeoutMs?: number; maxAttempts?: number }
): Promise<WindowSegment[]> {
  const prompt = `Transcribe LITERALMENTE este tramo de la llamada.
El tramo dura ${Math.round(length)} segundos y corresponde al intervalo ${formatStamp(start)} – ${formatStamp(start + length)} de la grabación completa.
Devuelve todos los turnos de este tramo, en orden, sin omitir palabras. Los tiempos inicio y fin son relativos a este tramo.`;

  const models = TRANSCRIBE_MODELS;
  let lastError: unknown;
  for (const model of models) {
    try {
      const result = await generateJson(
        ai,
        model,
        [audioPart, { text: prompt }],
        transcriptSchema,
        TRANSCRIBE_SYSTEM,
        16384,
        0,
        false,
        limits
      );
      addUsage(usage, result.usage);
      return asSegments(result.json, start, length);
    } catch (err) {
      lastError = err;
      if (err instanceof AnalysisError && (err.errorType === 'TRUNCATED' || err.status === 401 || err.status === 429)) throw err;
    }
  }
  if (lastError instanceof AnalysisError && lastError.errorType === 'MODEL_BUSY') {
    throw new AnalysisError('Gemini está saturado en este momento. Espera un minuto y vuelve a iniciar la auditoría.', 503, 'MODEL_BUSY');
  }
  throw lastError instanceof Error ? lastError : new AnalysisError('No se pudo transcribir un tramo del audio');
}

async function transcribeRange(
  ai: GoogleGenAI,
  ffmpeg: string,
  source: string,
  encoder: 'mp3' | 'aac' | 'wav',
  workDir: string,
  start: number,
  length: number,
  usage: Usage,
  remoteNames: string[],
  depth = 0
): Promise<WindowSegment[]> {
  const outputBase = path.join(workDir, `win-${Math.round(start)}-${depth}`);
  let extracted: { filePath: string; mimeType: string } | null = null;
  try {
    extracted = await extractWindow(ffmpeg, source, start, length, outputBase, encoder);
    const audioPart = await audioPartForFile(ai, extracted.filePath, extracted.mimeType, remoteNames);
    try {
      return await transcribeWindow(ai, audioPart, start, length, usage);
    } catch (err) {
      const canSplit = length > 45 && depth < 5 && err instanceof AnalysisError && err.errorType === 'TRUNCATED';
      if (!canSplit) throw err;
    }
  } finally {
    if (extracted) fs.promises.unlink(extracted.filePath).catch(() => {});
  }

  const half = length / 2;
  const left = await transcribeRange(ai, ffmpeg, source, encoder, workDir, start, half, usage, remoteNames, depth + 1);
  const right = await transcribeRange(ai, ffmpeg, source, encoder, workDir, start + half, length - half, usage, remoteNames, depth + 1);
  return [...left, ...right];
}

export async function analyzeLongAudio(options: {
  ai: GoogleGenAI;
  filePath: string;
  fileName: string;
  agentName: string;
  queue: string;
  auditSystemPrompt: string;
  auditSchema: object;
}): Promise<LongAudioResult> {
  const ffmpeg = resolveFfmpeg();
  const durationSeconds = await probeDuration(ffmpeg, options.filePath);
  const encoder = await pickEncoder(ffmpeg);
  const windowSec = WINDOW_SEC;
  const starts = windowStarts(durationSeconds, windowSec);
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gea-call-'));
  const usage = emptyUsage();
  const remoteNames: string[] = [];
  const groups: WindowSegment[][] = [];

  try {
    console.log(`[Audio largo] ${options.fileName}: ${Math.round(durationSeconds)}s en ${starts.length} tramo(s), codec ${encoder}`);
    for (let index = 0; index < starts.length; index++) {
      const start = starts[index];
      const length = Math.max(1, Math.min(windowSec, durationSeconds - start));
      console.log(`[Audio largo] Transcribiendo tramo ${index + 1}/${starts.length} (${formatStamp(start)})`);
      const segments = await transcribeRange(
        options.ai,
        ffmpeg,
        options.filePath,
        encoder,
        workDir,
        start,
        length,
        usage,
        remoteNames
      );
      groups.push(segments);
    }

    const segmentos = mergeWindowSegments(groups);
    if (segmentos.length === 0) {
      throw new AnalysisError('La transcripción llegó vacía. El audio no tiene voz reconocible o el modelo no pudo escucharlo.', 422, 'EMPTY_TRANSCRIPT');
    }

    const transcript = transcriptForAudit(segmentos);
    const auditPrompt = `Audita la llamada completa del asesor "${options.agentName}" en la cola "${options.queue}".
Duración real de la grabación: ${Math.round(durationSeconds)} segundos.
La transcripción siguiente está completa y es la fuente literal. No la recortes ni la reescribas.
Evalúa las 4 fases, el tNPS, los silencios, los quiebres y el coaching.

TRANSCRIPCIÓN COMPLETA:
${transcript}`;

    let audit: Record<string, unknown> | null = null;
    let auditModel = AUDIT_MODELS[0];
    let lastAuditError: unknown;
    for (const model of AUDIT_MODELS) {
      try {
        const result = await generateJson(
          options.ai,
          model,
          [{ text: auditPrompt }],
          options.auditSchema,
          options.auditSystemPrompt,
          12288,
          0.1,
          true
        );
        addUsage(usage, result.usage);
        audit = (result.json && typeof result.json === 'object' ? result.json : {}) as Record<string, unknown>;
        auditModel = model;
        break;
      } catch (err) {
        lastAuditError = err;
        if (err instanceof AnalysisError && (err.status === 401 || err.status === 429)) throw err;
      }
    }
    if (!audit) {
      throw lastAuditError instanceof Error
        ? lastAuditError
        : new AnalysisError('No se pudo auditar la transcripción completa');
    }

    return {
      audit,
      segmentos,
      durationSeconds,
      modelUsed: `${TRANSCRIBE_MODELS[0]} + ${auditModel}`,
      windows: starts.length,
      usage,
    };
  } finally {
    await Promise.all(remoteNames.map((name) => options.ai.files.delete({ name }).catch(() => undefined)));
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export const WEB_WINDOW_SEC = 150;
export const WEB_OVERLAP_SEC = 12;

export function planWindows(duration: number, windowSec = WEB_WINDOW_SEC, overlapSec = WEB_OVERLAP_SEC) {
  const safeDuration = Math.max(1, duration);
  if (safeDuration <= windowSec + 5) {
    return [{ start: 0, length: Math.round(safeDuration * 1000) / 1000 }];
  }
  const step = Math.max(30, windowSec - overlapSec);
  const windows: Array<{ start: number; length: number }> = [];
  for (let start = 0; start < safeDuration - 1; start += step) {
    const length = Math.max(1, Math.min(windowSec, safeDuration - start));
    windows.push({
      start: Math.round(start * 1000) / 1000,
      length: Math.round(length * 1000) / 1000,
    });
    if (start + windowSec >= safeDuration - 1) break;
  }
  return windows;
}

export async function probeSourceDuration(source: string, headers?: string): Promise<number> {
  return probeDuration(resolveFfmpeg(), source, headers, 18_000);
}

export async function transcribeSourceWindow(options: {
  ai: GoogleGenAI;
  source: string;
  start: number;
  length: number;
  headers?: string;
}): Promise<TranscriptSegment[]> {
  const ffmpeg = resolveFfmpeg();
  const encoder = await pickEncoder(ffmpeg);
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'gea-win-'));
  const usage = emptyUsage();
  const remoteNames: string[] = [];
  const limits = { timeoutMs: 28_000, maxAttempts: 1 };
  try {
    const extracted = await extractWindow(
      ffmpeg,
      options.source,
      options.start,
      options.length,
      path.join(workDir, 'win'),
      encoder,
      options.headers,
      18_000
    );
    try {
      const audioPart = await audioPartForFile(options.ai, extracted.filePath, extracted.mimeType, remoteNames);
      const segments = await transcribeWindow(options.ai, audioPart, options.start, options.length, usage, limits);
      return segments.map((seg, index) => ({ id: `seg-${index + 1}`, ...seg }));
    } finally {
      fs.promises.unlink(extracted.filePath).catch(() => {});
    }
  } catch (err) {
    if (err instanceof AnalysisError && err.errorType === 'TRUNCATED') {
      throw new AnalysisError('El tramo es demasiado largo para transcribirlo de una vez', 422, 'SPLIT_REQUIRED');
    }
    throw err;
  } finally {
    await Promise.all(remoteNames.map((name) => options.ai.files.delete({ name }).catch(() => undefined)));
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function auditTranscript(options: {
  ai: GoogleGenAI;
  segmentos: TranscriptSegment[];
  durationSeconds: number;
  agentName: string;
  queue: string;
  auditSystemPrompt: string;
  auditSchema: object;
}): Promise<{ audit: Record<string, unknown>; modelUsed: string }> {
  const transcript = transcriptForAudit(options.segmentos);
  const auditPrompt = `Audita la llamada completa del asesor "${options.agentName}" en la cola "${options.queue}".
Duración real de la grabación: ${Math.round(options.durationSeconds)} segundos.
La transcripción siguiente está completa y es la fuente literal. No la recortes ni la reescribas.
Evalúa las 4 fases, el tNPS, los silencios, los quiebres y el coaching.

TRANSCRIPCIÓN COMPLETA:
${transcript}`;

  let lastAuditError: unknown;
  for (const model of AUDIT_MODELS) {
    try {
      const result = await generateJson(
        options.ai,
        model,
        [{ text: auditPrompt }],
        options.auditSchema,
        options.auditSystemPrompt,
        12288,
        0.1,
        true,
        { timeoutMs: 42_000, maxAttempts: 1 }
      );
      const audit = (result.json && typeof result.json === 'object' ? result.json : {}) as Record<string, unknown>;
      return { audit, modelUsed: `${TRANSCRIBE_MODELS[0]} + ${model}` };
    } catch (err) {
      lastAuditError = err;
      if (err instanceof AnalysisError && (err.errorType === 'TIMEOUT' || err.status === 401 || err.status === 429)) throw err;
    }
  }
  if (lastAuditError instanceof AnalysisError && lastAuditError.errorType === 'MODEL_BUSY') {
    throw new AnalysisError('Gemini está saturado en este momento. Espera un minuto y vuelve a iniciar la auditoría.', 503, 'MODEL_BUSY');
  }
  throw lastAuditError instanceof Error
    ? lastAuditError
    : new AnalysisError('No se pudo auditar la transcripción completa');
}
