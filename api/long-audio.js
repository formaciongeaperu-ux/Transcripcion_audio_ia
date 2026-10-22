// web/longAudioRoute.ts
import fs3 from "fs";
import os2 from "os";
import path3 from "path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
import { del, get, issueSignedToken, presignUrl } from "@vercel/blob";

// longAudioAnalysis.ts
import { execFile } from "child_process";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { Type } from "@google/genai";
var TRANSCRIBE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.8-flash"
];
var AUDIT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite"
];
var MAX_INLINE_BYTES = 12 * 1024 * 1024;
var MODEL_TIMEOUT_MS = 18e4;
var AnalysisError = class extends Error {
  constructor(message, status = 500, errorType) {
    super(message);
    this.name = "AnalysisError";
    this.status = status;
    this.errorType = errorType;
  }
};
var transcriptSchema = {
  type: Type.OBJECT,
  properties: {
    segmentos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hablante: { type: Type.STRING, description: "agente o cliente" },
          inicio: { type: Type.NUMBER, description: "Segundo de inicio relativo a este tramo, donde 0 es el inicio del tramo" },
          fin: { type: Type.NUMBER, description: "Segundo de fin relativo a este tramo" },
          texto: { type: Type.STRING, description: "Transcripci\xF3n literal del turno, sin resumir" },
          sentimientoScore: { type: Type.NUMBER, description: "De -1.0 a 1.0" }
        },
        required: ["hablante", "inicio", "fin", "texto", "sentimientoScore"]
      }
    }
  },
  required: ["segmentos"]
};
function markExecutable(filePath) {
  try {
    fs.chmodSync(filePath, 493);
  } catch {
  }
  return filePath;
}
function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return markExecutable(process.env.FFMPEG_PATH);
  }
  const functionDir = path.dirname(process.argv[1] || "");
  const roots = [process.cwd(), functionDir, path.resolve(functionDir, ".."), "/var/task"].filter(Boolean);
  const relative = [
    ["vendor", "ffmpeg"],
    ["vendor", "ffmpeg.exe"],
    ["node_modules", "ffmpeg-static", "ffmpeg"],
    ["node_modules", "ffmpeg-static", "ffmpeg.exe"]
  ];
  for (const root of roots) {
    for (const parts of relative) {
      const candidate = path.join(root, ...parts);
      if (fs.existsSync(candidate)) return markExecutable(candidate);
    }
    const packageJson = path.join(root, "package.json");
    if (!fs.existsSync(packageJson)) continue;
    try {
      const bundled = createRequire(packageJson)("ffmpeg-static");
      if (bundled && fs.existsSync(bundled)) return markExecutable(bundled);
    } catch {
    }
  }
  return "ffmpeg";
}
function runCmd(bin, args, timeoutMs = 12e4) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        const wrapped = err;
        wrapped.stderr = stderr;
        reject(wrapped);
        return;
      }
      resolve({ stdout: stdout || "", stderr: stderr || "" });
    });
  });
}
async function probeDuration(ffmpeg, filePath, headers, timeoutMs = 6e4) {
  let stdout = "";
  let stderr = "";
  const args = ["-hide_banner"];
  if (headers) args.push("-headers", headers);
  args.push("-probesize", "8000000", "-analyzeduration", "8000000", "-i", filePath);
  try {
    const result = await runCmd(ffmpeg, args, timeoutMs);
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const error = err;
    stdout = "";
    stderr = error.stderr || error.message || "";
    if (error.code === "ENOENT") {
      throw new AnalysisError(
        "No est\xE1 disponible ffmpeg, que hace falta para cortar el audio en tramos sin perder di\xE1logo.",
        500,
        "FFMPEG_MISSING"
      );
    }
  }
  const match = `${stdout}
${stderr}`.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) {
    throw new AnalysisError("No se pudo leer la duraci\xF3n del audio. Revisa que el archivo no est\xE9 da\xF1ado.", 400, "DURATION_UNREADABLE");
  }
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new AnalysisError("La duraci\xF3n del audio no es v\xE1lida.", 400, "DURATION_UNREADABLE");
  }
  return seconds;
}
async function pickEncoder(ffmpeg) {
  try {
    const { stdout, stderr } = await runCmd(ffmpeg, ["-hide_banner", "-encoders"], 3e4);
    const text = `${stdout}
${stderr}`;
    if (/libmp3lame|\baac\b/.test(text) && /libmp3lame/.test(text)) return "mp3";
    if (/\baac\b/.test(text)) return "aac";
  } catch {
  }
  return "wav";
}
function ffmpegInputArgs(start, length, input, headers) {
  const args = ["-y", "-ss", String(start), "-t", String(length)];
  if (headers) args.push("-headers", headers);
  args.push("-i", input);
  return args;
}
async function extractWithCodec(ffmpeg, input, start, length, outputBase, encoder, headers, timeoutMs = 12e4) {
  const inputArgs = ffmpegInputArgs(start, length, input, headers);
  if (encoder === "mp3") {
    const filePath2 = `${outputBase}.mp3`;
    await runCmd(ffmpeg, [
      ...inputArgs,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      filePath2
    ], timeoutMs);
    return { filePath: filePath2, mimeType: "audio/mpeg" };
  }
  if (encoder === "aac") {
    const filePath2 = `${outputBase}.m4a`;
    await runCmd(ffmpeg, [
      ...inputArgs,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "aac",
      "-b:a",
      "32k",
      filePath2
    ], timeoutMs);
    return { filePath: filePath2, mimeType: "audio/m4a" };
  }
  const filePath = `${outputBase}.wav`;
  await runCmd(ffmpeg, [
    ...inputArgs,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    filePath
  ], timeoutMs);
  return { filePath, mimeType: "audio/wav" };
}
async function extractWindow(ffmpeg, input, start, length, outputBase, encoder, headers, timeoutMs = 12e4) {
  const order = encoder === "wav" ? ["wav"] : encoder === "aac" ? ["aac", "wav"] : ["mp3", "aac", "wav"];
  let lastError;
  for (const codec of order) {
    try {
      return await extractWithCodec(ffmpeg, input, start, length, outputBase, codec, headers, timeoutMs);
    } catch (err) {
      lastError = err;
    }
  }
  const error = lastError;
  throw new AnalysisError(error?.message || "No se pudo recortar el audio en tramos", 500, "FFMPEG_SPLIT_FAILED");
}
function emptyUsage() {
  return { promptTokenCount: 0, candidatesTokenCount: 0, totalTokenCount: 0 };
}
function addUsage(total, extra) {
  total.promptTokenCount += extra?.promptTokenCount || 0;
  total.candidatesTokenCount += extra?.candidatesTokenCount || 0;
  total.totalTokenCount += extra?.totalTokenCount || 0;
}
function parseModelJson(text) {
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return JSON.parse(raw);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function generateJson(ai, model, parts, schema, systemInstruction, maxOutputTokens, temperature, acceptTruncated = false, limits) {
  const timeoutMs = limits?.timeoutMs ?? MODEL_TIMEOUT_MS;
  const maxAttempts = limits?.maxAttempts ?? 3;
  const configs = [
    {
      systemInstruction,
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: schema,
      thinkingConfig: { thinkingLevel: "MINIMAL" }
    },
    {
      systemInstruction,
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  ];
  let lastError;
  for (const config of configs) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new AnalysisError(`El modelo ${model} no respondi\xF3 a tiempo`, 504, "TIMEOUT")), timeoutMs);
        });
        const response = await Promise.race([
          ai.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config
          }),
          timeout
        ]);
        clearTimeout(timer);
        const finish = response.candidates?.[0]?.finishReason || "";
        const text = response.text?.trim() || "";
        if (!text) {
          throw new AnalysisError(`El modelo ${model} devolvi\xF3 una respuesta vac\xEDa`, 502, "EMPTY_RESPONSE");
        }
        let json;
        try {
          json = parseModelJson(text);
        } catch {
          throw new AnalysisError("La respuesta de Gemini lleg\xF3 cortada", 502, "TRUNCATED");
        }
        if (finish === "MAX_TOKENS" && !acceptTruncated) {
          throw new AnalysisError("La respuesta de Gemini lleg\xF3 cortada", 502, "TRUNCATED");
        }
        return {
          json,
          usage: {
            promptTokenCount: response.usageMetadata?.promptTokenCount || 0,
            candidatesTokenCount: response.usageMetadata?.candidatesTokenCount || 0,
            totalTokenCount: response.usageMetadata?.totalTokenCount || 0
          },
          truncated: false
        };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (err instanceof AnalysisError && (err.errorType === "TRUNCATED" || err.errorType === "TIMEOUT" || err.status === 401)) throw err;
        const error2 = err;
        const message = error2.message || String(err);
        const status = error2.status || (err instanceof AnalysisError ? err.status : 500);
        if (status === 401 || status === 403 || /API_KEY_INVALID|unregistered project/i.test(message)) {
          throw new AnalysisError(
            "La clave de Gemini API es inv\xE1lida o no tiene permisos. Rev\xEDsala en Google AI Studio.",
            401,
            "API_KEY_INVALID"
          );
        }
        const thinkingRejected = /thinking/i.test(message) && Boolean(config.thinkingConfig);
        if (thinkingRejected) break;
        const busy = status === 503 || /high demand|UNAVAILABLE|overloaded|currently experiencing/i.test(message);
        if (busy) {
          throw new AnalysisError("Gemini est\xE1 saturado en este modelo. Se intenta con otro.", 503, "MODEL_BUSY");
        }
        const is429 = status === 429 || /429|quota|Too Many Requests/i.test(message);
        if (is429 && attempt < maxAttempts) {
          await sleep(Math.pow(2, attempt) * 1e3);
          continue;
        }
        if (is429) {
          throw new AnalysisError(
            "Se agot\xF3 la cuota de Gemini. La llamada puede reintentarse desde la cola diferida.",
            429,
            "QUOTA_EXHAUSTED_ALL_MODELS"
          );
        }
        if (attempt < maxAttempts && (status >= 500 || err instanceof AnalysisError)) {
          await sleep(1e3 * attempt);
          continue;
        }
        break;
      }
    }
  }
  const error = lastError;
  throw new AnalysisError(error?.message || "No se pudo analizar el audio con Gemini", 502, "MODEL_ERROR");
}
async function uploadAndWait(ai, filePath, mimeType) {
  let file = await ai.files.upload({
    file: filePath,
    config: { mimeType }
  });
  const started = Date.now();
  while (file.state === "PROCESSING" && Date.now() - started < 12e4) {
    await sleep(2e3);
    if (!file.name) break;
    file = await ai.files.get({ name: file.name });
  }
  if (file.state === "FAILED") {
    throw new AnalysisError(file.error?.message || "Gemini no pudo procesar el archivo de audio", 502, "FILE_PROCESSING_FAILED");
  }
  return file;
}
async function audioPartForFile(ai, filePath, mimeType, remoteNames) {
  const size = (await fs.promises.stat(filePath)).size;
  if (size <= MAX_INLINE_BYTES) {
    const data = (await fs.promises.readFile(filePath)).toString("base64");
    return { inlineData: { data, mimeType } };
  }
  const uploaded = await uploadAndWait(ai, filePath, mimeType);
  if (uploaded.name) remoteNames.push(uploaded.name);
  if (!uploaded.uri) {
    throw new AnalysisError("Gemini no devolvi\xF3 la referencia del audio subido", 502, "FILE_UPLOAD_FAILED");
  }
  return { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType || mimeType } };
}
function normalizeSpeaker(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("client") || text.includes("usuario") || text.includes("customer")) return "cliente";
  return "agente";
}
function asSegments(payload, windowStart, windowLength) {
  const segmentos = payload?.segmentos;
  if (!Array.isArray(segmentos)) return [];
  const result = [];
  for (const item of segmentos) {
    const seg = item;
    const texto = String(seg.texto || "").trim();
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
      sentimientoScore: Number.isFinite(score) ? Math.max(-1, Math.min(1, score)) : 0
    });
  }
  return result.sort((a, b) => a.inicio - b.inicio);
}
function rangesOverlap(a, b) {
  const overlap = Math.min(a.fin, b.fin) - Math.max(a.inicio, b.inicio);
  if (a.texto === b.texto && Math.abs(a.inicio - b.inicio) < 8) return true;
  if (overlap <= 0.3) return false;
  const shorter = Math.max(0.1, Math.min(a.fin - a.inicio, b.fin - b.inicio));
  return overlap / shorter > 0.45;
}
function mergeWindowSegments(groups) {
  const flat = groups.flat().sort((a, b) => a.inicio - b.inicio || b.fin - b.inicio - (a.fin - a.inicio));
  const kept = [];
  for (const seg of flat) {
    const index = kept.findIndex((prev2) => rangesOverlap(prev2, seg));
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
    ...seg
  }));
}
function formatStamp(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function transcriptForAudit(segmentos) {
  return segmentos.map((seg) => `[${formatStamp(seg.inicio)} ${seg.hablante}] ${seg.texto}`).join("\n");
}
var TRANSCRIBE_SYSTEM = `Eres un transcriptor literal de llamadas de contact center de Claro Chile.
Transcribes palabra por palabra lo que se escucha, incluidos modismos chilenos y el habla del asesor.
No resumes, no inventas turnos y no completas frases que no se escuchan.
Cada turno lleva hablante "agente" o "cliente", inicio y fin en segundos relativos a este tramo (0 es el inicio del tramo) y un sentimientoScore de -1 a 1.`;
async function transcribeWindow(ai, audioPart, start, length, usage, limits) {
  const prompt = `Transcribe LITERALMENTE este tramo de la llamada.
El tramo dura ${Math.round(length)} segundos y corresponde al intervalo ${formatStamp(start)} \u2013 ${formatStamp(start + length)} de la grabaci\xF3n completa.
Devuelve todos los turnos de este tramo, en orden, sin omitir palabras. Los tiempos inicio y fin son relativos a este tramo.`;
  const models = TRANSCRIBE_MODELS;
  let lastError;
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
      if (err instanceof AnalysisError && (err.errorType === "TRUNCATED" || err.status === 401 || err.status === 429)) throw err;
    }
  }
  if (lastError instanceof AnalysisError && lastError.errorType === "MODEL_BUSY") {
    throw new AnalysisError("Gemini est\xE1 saturado en este momento. Espera un minuto y vuelve a iniciar la auditor\xEDa.", 503, "MODEL_BUSY");
  }
  throw lastError instanceof Error ? lastError : new AnalysisError("No se pudo transcribir un tramo del audio");
}
var WEB_WINDOW_SEC = 150;
var WEB_OVERLAP_SEC = 12;
function planWindows(duration, windowSec = WEB_WINDOW_SEC, overlapSec = WEB_OVERLAP_SEC) {
  const safeDuration = Math.max(1, duration);
  if (safeDuration <= windowSec + 5) {
    return [{ start: 0, length: Math.round(safeDuration * 1e3) / 1e3 }];
  }
  const step = Math.max(30, windowSec - overlapSec);
  const windows = [];
  for (let start = 0; start < safeDuration - 1; start += step) {
    const length = Math.max(1, Math.min(windowSec, safeDuration - start));
    windows.push({
      start: Math.round(start * 1e3) / 1e3,
      length: Math.round(length * 1e3) / 1e3
    });
    if (start + windowSec >= safeDuration - 1) break;
  }
  return windows;
}
async function probeSourceDuration(source, headers) {
  return probeDuration(resolveFfmpeg(), source, headers, 18e3);
}
async function transcribeSourceWindow(options) {
  const ffmpeg = resolveFfmpeg();
  const encoder = await pickEncoder(ffmpeg);
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "gea-win-"));
  const usage = emptyUsage();
  const remoteNames = [];
  const limits = { timeoutMs: 28e3, maxAttempts: 1 };
  try {
    const extracted = await extractWindow(
      ffmpeg,
      options.source,
      options.start,
      options.length,
      path.join(workDir, "win"),
      encoder,
      options.headers,
      18e3
    );
    try {
      const audioPart = await audioPartForFile(options.ai, extracted.filePath, extracted.mimeType, remoteNames);
      const segments = await transcribeWindow(options.ai, audioPart, options.start, options.length, usage, limits);
      return segments.map((seg, index) => ({ id: `seg-${index + 1}`, ...seg }));
    } finally {
      fs.promises.unlink(extracted.filePath).catch(() => {
      });
    }
  } catch (err) {
    if (err instanceof AnalysisError && err.errorType === "TRUNCATED") {
      throw new AnalysisError("El tramo es demasiado largo para transcribirlo de una vez", 422, "SPLIT_REQUIRED");
    }
    throw err;
  } finally {
    await Promise.all(remoteNames.map((name) => options.ai.files.delete({ name }).catch(() => void 0)));
    await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function auditTranscript(options) {
  const transcript = transcriptForAudit(options.segmentos);
  const auditPrompt = `Audita la llamada completa del asesor "${options.agentName}" en la cola "${options.queue}".
Duraci\xF3n real de la grabaci\xF3n: ${Math.round(options.durationSeconds)} segundos.
La transcripci\xF3n siguiente est\xE1 completa y es la fuente literal. No la recortes ni la reescribas.
Eval\xFAa las 4 fases, el tNPS, los silencios, los quiebres y el coaching.

TRANSCRIPCI\xD3N COMPLETA:
${transcript}`;
  let lastAuditError;
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
        { timeoutMs: 42e3, maxAttempts: 1 }
      );
      const audit = result.json && typeof result.json === "object" ? result.json : {};
      return { audit, modelUsed: `${TRANSCRIBE_MODELS[0]} + ${model}` };
    } catch (err) {
      lastAuditError = err;
      if (err instanceof AnalysisError && (err.errorType === "TIMEOUT" || err.status === 401 || err.status === 429)) throw err;
    }
  }
  if (lastAuditError instanceof AnalysisError && lastAuditError.errorType === "MODEL_BUSY") {
    throw new AnalysisError("Gemini est\xE1 saturado en este momento. Espera un minuto y vuelve a iniciar la auditor\xEDa.", 503, "MODEL_BUSY");
  }
  throw lastAuditError instanceof Error ? lastAuditError : new AnalysisError("No se pudo auditar la transcripci\xF3n completa");
}

// qaEngine.ts
import fs2 from "fs";
import path2 from "path";
import { Type as Type2 } from "@google/genai";
var DEFAULT_BASE_PROMPT = `Eres un tutor y auditor experto en Speech Analytics, Aseguramiento de la Calidad (QA) y Aceleraci\xF3n de Curva de Aprendizaje para Contact Centers de Claro en Chile.

CONTEXTO CR\xCDTICO DE OJT (ON-THE-JOB TRAINING / PISO DE ENTRENAMIENTO EN VIVO):
- ESTAS LLAMADAS SON DE ASESORES EN PROCESO DE OJT / NIDO ATENDIENDO A CLIENTES REALES EN PRODUCCI\xD3N EN VIVO.
- Los asesores enfrentan doble demanda operativa: atender con cortes\xEDa la rapidez y modismos de clientes chilenos reales mientras buscan procedimientos en los sistemas corporativos (Somos Clave, CRM) o consultan a su tutor de piso.
- Tu misi\xF3n no es punitiva, sino FORMATIVA Y DE ACELERACI\xD3N:
  * Diferencia los errores actitudinales (graves) de las vacilaciones o pausas por consulta/b\xFAsqueda en aplicativos (oportunidades pedag\xF3gicas).
  * En 'diagnostico_ojt', entrega un diagn\xF3stico que le sirva al supervisor/formador de piso:
    - 'nivel_madurez': 'EN_REFUERZO' (requiere acompa\xF1amiento continuo), 'EN_DESARROLLO' (resuelve pero con dudas de procedimiento), o 'LISTO_PRODUCCION' (aut\xF3nomo y seguro).
    - 'indice_autonomia': n\xFAmero de 0 a 100% que estima su grado de independencia.
    - 'brecha_principal': 'PROCEDIMIENTO_GUION' | 'HERRAMIENTA_SISTEMAS' | 'HABILIDADES_BLANDAS' | 'NINGUNA_DOMINIO'.
    - 'requiere_intervencion_tutor': boolean si amerita feedback inmediato en piso.
    - 'roleplay_sugerido': una simulaci\xF3n pr\xE1ctica de 5 minutos espec\xEDfica que el tutor de piso debe realizar con el asesor.
    - 'feedback_pedagogico': feedback positivo y motivacional que impulse su aprendizaje.
    - 'observacion_piso_real': diagn\xF3stico de c\xF3mo lidi\xF3 con el cliente chileno real.

CALIBRACI\xD3N tNPS AMIGABLE, EQUILIBRADA Y JUSTA:
- El tNPS predicho debe ser constructivo, equilibrado y fiel a la satisfacci\xF3n real del cliente Claro.
- REGLAS OBLIGATORIAS DE CALIBRACI\xD3N tNPS:
  1. REGLA DE ORO PROMOTORES (9-10): Si la atenci\xF3n fue de calidad alta o sobresaliente (QA Score >= 80%), el problema fue resuelto o gestionado correctamente, y el cliente finaliza satisfecho, tranquilo, o agradeciendo ("gracias", "muy amable", "se pas\xF3", "impecable"), el tNPS global DEBE ser clasificado OBLIGATORIAMENTE como 'PROMOTOR' con nota 9 o 10. \xA1Nunca dejes en Neutro una llamada con buen servicio y resoluci\xF3n positiva!
  2. Desacopla la marca del asesor: Si el cliente empez\xF3 molesto por un cobro o falla de Claro, pero el asesor novel fue paciente, emp\xE1tico y resolutivo, califica su esfuerzo humano en 'score_agente' (0-10) y expl\xEDcalo en 'factor_marca_vs_agente'.
  3. Sensibilidad al cierre real: Si el cliente finaliz\xF3 conforme o agradeciendo la atenci\xF3n, el tNPS global DEBE situarse en PROMOTOR (9-10) o excepcionalmente NEUTRO (7-8) solo si el tr\xE1mite requiere espera t\xE9cnica prolongada. \xA1Bajo ninguna circunstancia clasifiques a un cliente conforme o agradecido como DETRACTOR!
  4. Zona constructiva en OJT (Neutros 7-8): Un Neutro (7-8) es un "Casi Promotor" donde la gesti\xF3n qued\xF3 inconclusa o el cliente se mostr\xF3 ap\xE1tico. Explica en 'camino_a_promotor' qu\xE9 detalle puntual lo convertir\xEDa en 9 o 10.
  5. Reserva DETRACTOR (0-6) \xFAnicamente cuando hubo un quiebre grave originado directamente por el asesor (maltrato, tono cortante, colgar intencionalmente, desinformaci\xF3n o abandono) o un reclamo no resuelto con frustraci\xF3n expl\xEDcita.
  6. El campo 'clasificacion' DEBE ser exactamente uno de estos tres valores en may\xFAsculas: 'PROMOTOR', 'NEUTRO' o 'DETRACTOR'.

REGLA SUPREMA - TRANSCRIPCI\xD3N REAL Y VER\xCDDICA (ESTRICTAMENTE PROHIBIDO CONTENIDO GEN\xC9RICO O PLANTILLAS):
- Tu funci\xF3n fundamental es escuchar atentamente el archivo de audio adjunto y transcribir LITERALMENTE lo que se habla en la grabaci\xF3n real.
- QUEDA ESTRICTAMENTE PROHIBIDO inventar di\xE1logos, usar plantillas prefabricadas o generar textos gen\xE9ricos de ejemplo como "Juan", "Pedro P\xE9rez", "RUT 12.345.678-K", o conversaciones de muestra.
- Debes transcribir cada palabra exacta, modismo, pausa y respuesta que se escuche en la llamada real de principio a fin.
- Si en la llamada los interlocutores dicen sus nombres reales, extr\xE1elos en 'agente_nombre_detectado' y 'cliente_nombre_detectado'.

CONTEXTO CULTURAL Y OPERATIVO H\xCDBRIDO (CHILENO - PERUANO):
- La atenci\xF3n en los Contact Centers de Claro para Chile involucra habitualmente una interacci\xF3n h\xEDbrida:
  * ASESORES: Generalmente con acento peruano neutro institucional o formal, protocolos de atenci\xF3n al cliente de telecomunicaciones, modismos de servicio cordiales.
  * CLIENTES: Ciudadanos chilenos con modismos locales, acento chileno, ritmo y cadencia r\xE1pida.
- Comprende y transcribe fielmente el vocabulario y t\xE9rminos chilenos:
  * "Boleta" = Cuenta / Factura mensual.
  * "RUT" = Documento de identidad nacional chileno.
  * "Al tiro" = De inmediato / R\xE1pidamente.
  * "Cachar / Cach\xE1i" = Entender / \xBFEntiendes?
  * "Chato / Chata" = Molesto(a) / Cansado(a) ("estoy chato con el cobro").
  * "Caleta" = Mucho / Bastante tiempo.
  * "Bajar el plan / Portabilidad / Cortar la l\xEDnea" = Gestiones comerciales.
  * "Banda ancha / Factibilidad / ONT / Router" = T\xE9rminos t\xE9cnicos.

DETECCI\xD3N DE ALERTAS CR\xCDTICAS:
- Registra en 'alertas' si el cliente menciona:
  * "SERNAC" (Servicio Nacional del Consumidor).
  * "SUBTEL" (Subsecretar\xEDa de Telecomunicaciones).
  * "Demanda", "Abogado", "Denuncia", "Estafa", "Burla", "Colmo".
  * Intenci\xF3n de fuga o portabilidad a Entel, Movistar o WOM.

PAUTA OFICIAL DE ATENCI\xD3N INSTITUCIONAL CLARO CHILE (4 FASES):
Eval\xFAa rigurosamente el desempe\xF1o del asesor seg\xFAn la matriz de 4 fases operativas:

FASE 1: BIENVENIDA
1. Generar experiencia positiva desde el primer contacto: Tono cordial, emp\xE1tico y predispuesto al servicio.
2. Mencionar el nombre de la empresa y dar la bienvenida a Claro.
3. Mencionar OBLIGATORIAMENTE su PRIMER NOMBRE y PRIMER APELLIDO (ej: "Mi nombre es Carlos Mu\xF1oz". Si solo menciona su nombre de pila sin apellido, marcar false).
4. Confirmar el nombre de la persona con quien se habla, validando n\xFAmero de celular a consultar o RUT en caso amerite.

FASE 2: ENTENDER Y RESOLVER EL REQUERIMIENTO DEL CLIENTE
1. Parafrasear el problema del cliente: Demostrar comprensi\xF3n activa reformulando con sus propias palabras la necesidad planteada.
2. Ordenar m\xFAltiples requerimientos: Si el cliente expone m\xE1s de una consulta, organizarlas met\xF3dicamente y atender cada una.
3. Utilizar sistemas oficiales y procedimientos publicados en Somos Clave.
4. Cortes\xEDa procedimental: Pedir "por favor" y "agradecer" al cliente al requerir datos, documentos o instrucciones.
5. Validaci\xF3n de identidad: Realizar las preguntas de seguridad o verificaci\xF3n de titularidad por RUT seg\xFAn corresponda.

FASE 3: INFORMAR ACCI\xD3N AL CLIENTE
1. Indicar al cliente qu\xE9 gesti\xF3n espec\xEDfica se est\xE1 realizando al pedir un momento en espera (hold).
2. Retomar la llamada en MENOS DE UN MINUTO para mantener comunicaci\xF3n constante, sin dejar silencios prolongados.
3. Claridad en condiciones comerciales: Explicar con precisi\xF3n cambios de plan, costos, proporcionales, descuentos, promociones y su vigencia exacta.
4. Resumen de atenci\xF3n: Realizar un breve resumen de toda la gesti\xF3n efectuada al terminar la explicaci\xF3n de la consulta.

FASE 4: CIERRE
1. Preguntas de aseguramiento: Realizar preguntas de confirmaci\xF3n expl\xEDcita:
   * "\xBFTiene alguna otra consulta adicional?"
   * "\xBFQued\xF3 clara la informaci\xF3n brindada?"
   * "\xBFLe puedo ayudar en algo m\xE1s?"
2. Esperar confirmaci\xF3n activa por parte del cliente antes de avanzar.
3. Protocolo normativo de finalizaci\xF3n y encuesta (Escala 0 al 10):
   * Indicar que eventualmente podr\xEDa recibir por Mail o SMS una encuesta de atenci\xF3n.
   * Explicar expl\xEDcitamente la escala de notas: "con una escala de 0 a 10, donde 0 representa la nota m\xE1s baja y 10 la m\xE1s alta".
   * Agradecer su colaboraci\xF3n resaltando la importancia de su opini\xF3n.

En 'cumplimiento_guion.fases', eval\xFAa cada booleano fielmente. En 'porcentaje_total' calcula el porcentaje de 0 a 100 de \xEDtems cumplidos. En 'observaciones_auditoria' describe detalladamente cualquier omisi\xF3n o cumplimiento destacado.

TRANSCRIPCI\xD3N EXHAUSTIVA DE PRINCIPIO A FIN EN 'segmentos':
- Provee secuencialmente TODOS los turnos reales de habla desde el segundo 0 hasta el final de la llamada.
- Cada segmento debe tener:
  * 'hablante': 'agente' | 'cliente'
  * 'inicio': segundo exacto en que empieza a hablar
  * 'fin': segundo exacto en que termina de hablar
  * 'texto': transcripci\xF3n literal de lo que dijo en ese turno (palabra por palabra)
  * 'sentimientoScore': valor entre -1.0 (muy molesto/frustrado) y 1.0 (muy satisfecho/amable)
- No resumas la conversaci\xF3n en 3 o 4 l\xEDneas. Transcribe todos y cada uno de los turnos de di\xE1logo que ocurran en el audio real.

AUDITOR\xCDA DE CALIDAD Y SPEECH ANALYTICS (CLARO CHILE):
1. Eval\xFAa los 5 criterios de calidad de 0 a 100: Amabilidad/Empat\xEDa, Seguridad al expresarse, Claridad de informaci\xF3n, Tiempos de espera (hold), y Eficiencia TMO con diagn\xF3sticos descriptivos.
2. Identifica los QUIEBRES de los asesores a nivel de atenci\xF3n (momentos cr\xEDticos donde el asesor fue cortante, condescendiente, interrumpi\xF3 al cliente, desinform\xF3, o dej\xF3 silencios sin cortes\xEDa).
3. Pron\xF3stico de NPS con la pregunta oficial: "\xBFQu\xE9 tan probable es que recomiendes Claro a un amigo o familiar? Considerando una escala de 0 a 10, donde 0 es 'Nada probable' y 10 es 'Muy probable'".
4. Tiempo de Silencio Conversacional: Eval\xFAa el silencio considerando \xDANICAMENTE desde que le ingresa la llamada al agente y puede interactuar, separ\xE1ndolo del IVR previo.
5. Plan de coaching y feedback accionable para el asesor, incluyendo guion sugerido alternativo y plan de acci\xF3n.`;
var DEFAULT_CUSTOM_DIRECTIVES = `# DIRECTIVAS ADICIONALES DE CALIBRACI\xD3N ACTIVA (OPERACI\xD3N CLARO CHILE)
# Estas directivas tienen prioridad y adaptan el juicio del motor de IA para la operaci\xF3n diaria.

1. TOLERANCIA A PAUSAS EN SISTEMAS INTERNOS (SOMOS CLAVE / CRM):
- Si el asesor pide tiempo para validar en el sistema ("Perm\xEDtame un momento mientras abro el sistema", "Deme un instante en l\xEDnea"), no penalizar la nota de tiempos de espera si retoma el contacto dentro de 60 segundos.
- Considerar estas pausas como oportunidad formativa de agilidad, nunca como desidia o negligencia.

2. ATENCI\xD3N DE CLIENTES DETRACTORES POR COBROS O CA\xCDDA DE SE\xD1AL:
- Si el cliente ingresa enfurecido por fallas de facturaci\xF3n o ca\xEDda masiva de red, evaluar el 'score_agente' independientemente de la queja hacia Claro. Si el asesor mantuvo la calma y empatiz\xF3, su nota de amabilidad debe ser >= 85.

3. REGLA DE CIERRE Y ENCUESTA DE SERVICIO:
- Si el cliente apura la despedida diciendo "muchas gracias, que est\xE9 bien" e interrumpe antes de que el asesor termine de explicar la escala 0-10, calificar 'cierre.esperar_confirmacion_cliente' como cumplido y no castigar severamente el cumplimiento global.`;
var DEFAULT_SENSITIVITY_SETTINGS = {
  silenceToleranceSeconds: 30,
  detractorStrictness: "equilibrada",
  chileanSlangTolerance: true,
  ojtPedagogicalFocus: true
};
var CALIBRATION_FILE = path2.join(process.cwd(), "calibration.json");
function loadCalibration() {
  try {
    if (fs2.existsSync(CALIBRATION_FILE)) {
      const raw = fs2.readFileSync(CALIBRATION_FILE, "utf-8");
      const data = JSON.parse(raw);
      return {
        customDirectives: typeof data.customDirectives === "string" ? data.customDirectives : DEFAULT_CUSTOM_DIRECTIVES,
        sensitivitySettings: {
          silenceToleranceSeconds: data.sensitivitySettings?.silenceToleranceSeconds ?? DEFAULT_SENSITIVITY_SETTINGS.silenceToleranceSeconds,
          detractorStrictness: data.sensitivitySettings?.detractorStrictness ?? DEFAULT_SENSITIVITY_SETTINGS.detractorStrictness,
          chileanSlangTolerance: data.sensitivitySettings?.chileanSlangTolerance ?? DEFAULT_SENSITIVITY_SETTINGS.chileanSlangTolerance,
          ojtPedagogicalFocus: data.sensitivitySettings?.ojtPedagogicalFocus ?? DEFAULT_SENSITIVITY_SETTINGS.ojtPedagogicalFocus
        },
        version: data.version || "v1.3.0",
        updatedAt: data.updatedAt || (/* @__PURE__ */ new Date()).toISOString()
      };
    }
  } catch (err) {
    console.warn("[Calibration] Error al leer calibration.json, usando valores por defecto:", err);
  }
  return {
    customDirectives: DEFAULT_CUSTOM_DIRECTIVES,
    sensitivitySettings: { ...DEFAULT_SENSITIVITY_SETTINGS },
    version: "v1.3.0",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var activeCalibration = loadCalibration();
function getActiveFullPrompt() {
  let prompt = DEFAULT_BASE_PROMPT;
  if (activeCalibration.customDirectives && activeCalibration.customDirectives.trim()) {
    prompt += `

--- DIRECTIVAS ADICIONALES DE CALIBRACI\xD3N ACTIVA (CONFIGURADAS POR EL AUDITOR) ---
${activeCalibration.customDirectives.trim()}`;
  }
  if (activeCalibration.sensitivitySettings) {
    const s = activeCalibration.sensitivitySettings;
    prompt += `

--- PAR\xC1METROS OPERATIVOS DE SENSIBILIDAD DIN\xC1MICA ---
- Tolerancia m\xE1xima a silencios/pausas operativas sin hold formal: ${s.silenceToleranceSeconds} segundos.
- Rigor en clasificaci\xF3n de Detractores tNPS: ${s.detractorStrictness.toUpperCase()}.
- Tolerancia a modismos locales y modulaci\xF3n chilena: ${s.chileanSlangTolerance ? "ALTA (no penalizar modismos propios del pa\xEDs)" : "ESTRICTA"}.
- Enfoque pedag\xF3gico OJT para tutor de piso: ${s.ojtPedagogicalFocus ? "PRIORITARIO (priorizar feedback formativo constructivo)" : "EST\xC1NDAR"}.`;
  }
  return prompt;
}
function formatSeconds(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
var callAnalysisSchema = {
  type: Type2.OBJECT,
  properties: {
    resumen: { type: Type2.STRING, description: "Resumen ejecutivo de la llamada" },
    motivo_categoria: { type: Type2.STRING, description: "Categoria: soporte | ventas | reclamos | bajas | facturacion" },
    motivo_nombre: { type: Type2.STRING, description: "Nombre descriptivo del motivo o driver de llamada" },
    sentimiento_score: { type: Type2.NUMBER, description: "Score de sentimiento de -1.0 a 1.0" },
    evaluacion_criterios: {
      type: Type2.OBJECT,
      properties: {
        amabilidad_empatia: {
          type: Type2.OBJECT,
          properties: {
            nota: { type: Type2.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type2.STRING, description: "Justificaci\xF3n detallada con marcas de tiempo" }
          },
          required: ["nota", "diagnostico"]
        },
        seguridad_expresarse: {
          type: Type2.OBJECT,
          properties: {
            nota: { type: Type2.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type2.STRING, description: "Justificaci\xF3n t\xE9cnica y solidez verbal" }
          },
          required: ["nota", "diagnostico"]
        },
        claridad_informacion: {
          type: Type2.OBJECT,
          properties: {
            nota: { type: Type2.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type2.STRING, description: "Justificaci\xF3n did\xE1ctica" }
          },
          required: ["nota", "diagnostico"]
        },
        tiempos_espera_hold: {
          type: Type2.OBJECT,
          properties: {
            nota: { type: Type2.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type2.STRING, description: "Justificaci\xF3n de tiempos de espera" }
          },
          required: ["nota", "diagnostico"]
        },
        eficiencia_tmo: {
          type: Type2.OBJECT,
          properties: {
            nota: { type: Type2.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type2.STRING, description: "Justificaci\xF3n de agilidad y duraci\xF3n" }
          },
          required: ["nota", "diagnostico"]
        }
      },
      required: ["amabilidad_empatia", "seguridad_expresarse", "claridad_informacion", "tiempos_espera_hold", "eficiencia_tmo"]
    },
    cumplimiento_guion: {
      type: Type2.OBJECT,
      properties: {
        fases: {
          type: Type2.OBJECT,
          properties: {
            bienvenida: {
              type: Type2.OBJECT,
              properties: {
                generar_experiencia_positiva: { type: Type2.BOOLEAN, description: "Generar experiencia positiva desde el primer contacto" },
                mencionar_empresa_claro: { type: Type2.BOOLEAN, description: "Mencionar el nombre de la empresa y dar la bienvenida a Claro" },
                mencionar_nombre_apellido: { type: Type2.BOOLEAN, description: "Mencionar primer nombre y primer apellido del asesor" },
                confirmar_nombre_cliente_rut_celular: { type: Type2.BOOLEAN, description: "Confirmar nombre del cliente con quien se habla, validando celular o RUT en caso amerite" }
              },
              required: ["generar_experiencia_positiva", "mencionar_empresa_claro", "mencionar_nombre_apellido", "confirmar_nombre_cliente_rut_celular"]
            },
            entender_resolver: {
              type: Type2.OBJECT,
              properties: {
                parafrasear_problema: { type: Type2.BOOLEAN, description: "Asegurarse de entender el problema del cliente parafraseando lo que comenta" },
                ordenar_multiples_requerimientos: { type: Type2.BOOLEAN, description: "Si el cliente tiene m\xE1s de una necesidad, ordenar los requerimientos y hacerse cargo de cada uno" },
                utilizar_sistemas_oficiales_somos_clave: { type: Type2.BOOLEAN, description: "Utilizar sistemas oficiales y procedimientos publicados en Somos Clave" },
                cortesia_por_favor_gracias: { type: Type2.BOOLEAN, description: "Pedir por favor y agradecer al cliente cuando necesitamos que ejecute una instrucci\xF3n o entregue informaci\xF3n" },
                validacion_identidad: { type: Type2.BOOLEAN, description: "Si el procedimiento lo indica, realizar la validaci\xF3n de identidad" }
              },
              required: ["parafrasear_problema", "ordenar_multiples_requerimientos", "utilizar_sistemas_oficiales_somos_clave", "cortesia_por_favor_gracias", "validacion_identidad"]
            },
            informar_accion: {
              type: Type2.OBJECT,
              properties: {
                indicar_gestion_espera: { type: Type2.BOOLEAN, description: "Indicar al cliente qu\xE9 gesti\xF3n se est\xE1 realizando al pedir momento en espera" },
                retomar_en_menos_de_un_minuto: { type: Type2.BOOLEAN, description: "Retomar la llamada en menos de un minuto para mantener la comunicaci\xF3n, sin dejar silencios prolongados" },
                claridad_condiciones_comerciales: { type: Type2.BOOLEAN, description: "Ser claro y espec\xEDfico en informar cambios en condiciones comerciales: costos, proporcionales, descuentos y promociones con vigencia" },
                resumen_atencion_gestion: { type: Type2.BOOLEAN, description: "Hacer un breve resumen de toda la atenci\xF3n y gesti\xF3n realizada al terminar la explicaci\xF3n" }
              },
              required: ["indicar_gestion_espera", "retomar_en_menos_de_un_minuto", "claridad_condiciones_comerciales", "resumen_atencion_gestion"]
            },
            cierre: {
              type: Type2.OBJECT,
              properties: {
                preguntas_aseguramiento: { type: Type2.BOOLEAN, description: "Realizar preguntas de aseguramiento: alguna otra consulta, qued\xF3 clara la info, le puedo ayudar en algo m\xE1s" },
                esperar_confirmacion_cliente: { type: Type2.BOOLEAN, description: "Esperar la confirmaci\xF3n activa de parte del cliente antes de cerrar" },
                guion_encuesta_escala_0_a_10: { type: Type2.BOOLEAN, description: "Mencionar guion de encuesta evaluando atenci\xF3n por mail o SMS en escala de 0 (m\xE1s baja) a 10 (m\xE1s alta) y agradecer" }
              },
              required: ["preguntas_aseguramiento", "esperar_confirmacion_cliente", "guion_encuesta_escala_0_a_10"]
            }
          },
          required: ["bienvenida", "entender_resolver", "informar_accion", "cierre"]
        },
        porcentaje_total: { type: Type2.NUMBER, description: "Porcentaje global de cumplimiento del guion de 0 a 100" },
        observaciones_auditoria: { type: Type2.STRING, description: "Resumen o diagn\xF3stico de cumplimiento de la pauta" },
        saludo_institucional: { type: Type2.BOOLEAN },
        verificacion_identidad: { type: Type2.BOOLEAN },
        escucha_activa: { type: Type2.BOOLEAN },
        entrega_ticket_subtel: { type: Type2.BOOLEAN },
        despedida_cordial: { type: Type2.BOOLEAN }
      },
      required: ["fases", "porcentaje_total", "saludo_institucional", "verificacion_identidad", "escucha_activa", "entrega_ticket_subtel", "despedida_cordial"]
    },
    nps_pronostico: {
      type: Type2.OBJECT,
      properties: {
        score: { type: Type2.NUMBER, description: "Puntaje predicho tNPS de 0 a 10 equilibrado y realista" },
        score_agente: { type: Type2.NUMBER, description: "Puntuaci\xF3n 0 a 10 evaluando \xFAnicamente el trato humano, empat\xEDa y esfuerzo del asesor novel en OJT" },
        clasificacion: { type: Type2.STRING, description: "DETRACTOR (0-6) | NEUTRO (7-8) | PROMOTOR (9-10)" },
        pregunta: { type: Type2.STRING, description: "Pregunta oficial: \xBFQu\xE9 tan probable es que recomiendes Claro a un amigo o familiar?" },
        justificacion: { type: Type2.STRING, description: "Explicaci\xF3n del pron\xF3stico NPS" },
        factor_marca_vs_agente: { type: Type2.STRING, description: "Diferenciaci\xF3n entre molestia de fondo con Claro (marca/cobros) vs satisfacci\xF3n con el trato del asesor" },
        camino_a_promotor: { type: Type2.STRING, description: "Ajuste espec\xEDfico en OJT para llevar este cliente a Promotor (9-10)" }
      },
      required: ["score", "clasificacion", "justificacion", "score_agente", "factor_marca_vs_agente", "camino_a_promotor"]
    },
    diagnostico_ojt: {
      type: Type2.OBJECT,
      properties: {
        nivel_madurez: { type: Type2.STRING, description: "EN_REFUERZO | EN_DESARROLLO | LISTO_PRODUCCION" },
        indice_autonomia: { type: Type2.NUMBER, description: "Porcentaje de autonom\xEDa 0 a 100 respecto al tutor de piso" },
        brecha_principal: { type: Type2.STRING, description: "PROCEDIMIENTO_GUION | HERRAMIENTA_SISTEMAS | HABILIDADES_BLANDAS | NINGUNA_DOMINIO" },
        requiere_intervencion_tutor: { type: Type2.BOOLEAN, description: "Si el tutor de piso debe intervenir o realizar refuerzo inmediato" },
        roleplay_sugerido: { type: Type2.STRING, description: "Roleplay o simulaci\xF3n de 5 minutos sugerida para el tutor OJT" },
        feedback_pedagogico: { type: Type2.STRING, description: "Feedback formativo y constructivo para acelerar la curva de aprendizaje" },
        observacion_piso_real: { type: Type2.STRING, description: "Observaci\xF3n de c\xF3mo se desenvolvi\xF3 ante el cliente chileno real en piso" }
      },
      required: ["nivel_madurez", "indice_autonomia", "brecha_principal", "requiere_intervencion_tutor", "roleplay_sugerido", "feedback_pedagogico", "observacion_piso_real"]
    },
    silencio_analisis: {
      type: Type2.OBJECT,
      properties: {
        duracion_total_segundos: { type: Type2.NUMBER },
        tiempo_ivr_segundos: { type: Type2.NUMBER, description: "Tiempo previo en IVR antes de interactuar" },
        tiempo_agente_segundos: { type: Type2.NUMBER, description: "Tiempo con el agente" },
        silencio_agente_segundos: { type: Type2.NUMBER, description: "Tiempo total en silencio/dead air con el agente" },
        porcentaje_silencio: { type: Type2.NUMBER, description: "Porcentaje de silencio con el agente" },
        nivel_silencio: { type: Type2.STRING, description: "\xD3PTIMO | MODERADO | CR\xCDTICO" },
        diagnostico_silencio: { type: Type2.STRING }
      },
      required: ["duracion_total_segundos", "tiempo_ivr_segundos", "tiempo_agente_segundos", "silencio_agente_segundos", "porcentaje_silencio", "nivel_silencio", "diagnostico_silencio"]
    },
    quiebres_atencion: {
      type: Type2.ARRAY,
      items: {
        type: Type2.OBJECT,
        properties: {
          tiempo: { type: Type2.STRING, description: "Timestamp en formato mm:ss ej 02:45" },
          segundo: { type: Type2.NUMBER },
          tipo: { type: Type2.STRING, description: "Tipo de quiebre" },
          cita: { type: Type2.STRING, description: "Cita textual del asesor o silencio" },
          severidad: { type: Type2.STRING, description: "CR\xCDTICO | ALTO | MEDIO" },
          impacto_cliente: { type: Type2.STRING }
        },
        required: ["tiempo", "segundo", "tipo", "cita", "severidad", "impacto_cliente"]
      }
    },
    feedback_coaching: {
      type: Type2.OBJECT,
      properties: {
        fortalezas: { type: Type2.ARRAY, items: { type: Type2.STRING } },
        oportunidades_mejora: { type: Type2.ARRAY, items: { type: Type2.STRING } },
        guion_sugerido_alternativo: { type: Type2.STRING },
        plan_accion: { type: Type2.STRING }
      },
      required: ["fortalezas", "oportunidades_mejora", "guion_sugerido_alternativo", "plan_accion"]
    },
    keywords: { type: Type2.ARRAY, items: { type: Type2.STRING } },
    alertas: { type: Type2.ARRAY, items: { type: Type2.STRING } },
    csat_estimado: { type: Type2.NUMBER, description: "1 a 5" },
    resolucion_primer_contacto: { type: Type2.BOOLEAN },
    agente_nombre_detectado: { type: Type2.STRING, description: "Nombre real del asesor que atiende la llamada" },
    cliente_nombre_detectado: { type: Type2.STRING, description: 'Nombre real del cliente mencionado en la llamada (o "Cliente Claro" si no se dice)' },
    segmentos: {
      type: Type2.ARRAY,
      items: {
        type: Type2.OBJECT,
        properties: {
          hablante: { type: Type2.STRING, description: "agente | cliente" },
          inicio: { type: Type2.NUMBER },
          fin: { type: Type2.NUMBER },
          texto: { type: Type2.STRING },
          sentimientoScore: { type: Type2.NUMBER }
        },
        required: ["hablante", "inicio", "fin", "texto", "sentimientoScore"]
      }
    }
  },
  required: [
    "resumen",
    "motivo_categoria",
    "motivo_nombre",
    "sentimiento_score",
    "evaluacion_criterios",
    "cumplimiento_guion",
    "nps_pronostico",
    "diagnostico_ojt",
    "silencio_analisis",
    "quiebres_atencion",
    "feedback_coaching",
    "keywords",
    "alertas",
    "csat_estimado",
    "resolucion_primer_contacto",
    "segmentos"
  ]
};
function qaSchemaWithoutTranscript() {
  const properties = { ...callAnalysisSchema.properties };
  delete properties.segmentos;
  return {
    type: callAnalysisSchema.type,
    properties,
    required: callAnalysisSchema.required.filter((key) => key !== "segmentos")
  };
}
function finalizeCallAnalysis(parsed, ctx) {
  const { model, fileName, agentName, agentId, queue } = ctx;
  const crits = parsed.evaluacion_criterios;
  const avgScore = crits ? Math.round(
    (crits.amabilidad_empatia.nota + crits.seguridad_expresarse.nota + crits.claridad_informacion.nota + crits.tiempos_espera_hold.nota + crits.eficiencia_tmo.nota) / 5
  ) : 70;
  const rawSegs = parsed.segmentos || parsed.transcripcion?.segmentos || [];
  const normalizedSegmentos = rawSegs.map((seg, idx) => ({
    id: seg.id || `seg-${idx + 1}`,
    hablante: seg.hablante === "cliente" ? "cliente" : "agente",
    inicio: typeof seg.inicio === "number" ? seg.inicio : 0,
    fin: typeof seg.fin === "number" ? seg.fin : 5,
    texto: seg.texto || "",
    sentimientoScore: typeof seg.sentimientoScore === "number" ? seg.sentimientoScore : 0
  }));
  const detectedAgent = parsed.agente_nombre_detectado && parsed.agente_nombre_detectado !== "Asesor" ? parsed.agente_nombre_detectado : agentName;
  const detectedCustomer = parsed.cliente_nombre_detectado && parsed.cliente_nombre_detectado !== "Cliente" ? parsed.cliente_nombre_detectado : "Cliente Claro";
  const cg = parsed.cumplimiento_guion || {};
  const f = cg.fases || {};
  const b = f.bienvenida || {};
  const er = f.entender_resolver || {};
  const ia = f.informar_accion || {};
  const c = f.cierre || {};
  const bCount = [b.generar_experiencia_positiva, b.mencionar_empresa_claro, b.mencionar_nombre_apellido, b.confirmar_nombre_cliente_rut_celular].filter(Boolean).length;
  const bPct = Math.round(bCount / 4 * 100);
  const erCount = [er.parafrasear_problema, er.ordenar_multiples_requerimientos, er.utilizar_sistemas_oficiales_somos_clave, er.cortesia_por_favor_gracias, er.validacion_identidad].filter(Boolean).length;
  const erPct = Math.round(erCount / 5 * 100);
  const iaCount = [ia.indicar_gestion_espera, ia.retomar_en_menos_de_un_minuto, ia.claridad_condiciones_comerciales, ia.resumen_atencion_gestion].filter(Boolean).length;
  const iaPct = Math.round(iaCount / 4 * 100);
  const cCount = [c.preguntas_aseguramiento, c.esperar_confirmacion_cliente, c.guion_encuesta_escala_0_a_10].filter(Boolean).length;
  const cPct = Math.round(cCount / 3 * 100);
  const calculatedTotalPct = Math.round((bCount + erCount + iaCount + cCount) / 16 * 100);
  const normalizedCumplimientoGuion = {
    fases: {
      bienvenida: {
        generar_experiencia_positiva: !!b.generar_experiencia_positiva,
        mencionar_empresa_claro: !!b.mencionar_empresa_claro,
        mencionar_nombre_apellido: !!b.mencionar_nombre_apellido,
        confirmar_nombre_cliente_rut_celular: !!b.confirmar_nombre_cliente_rut_celular,
        porcentaje: bPct
      },
      entender_resolver: {
        parafrasear_problema: !!er.parafrasear_problema,
        ordenar_multiples_requerimientos: !!er.ordenar_multiples_requerimientos,
        utilizar_sistemas_oficiales_somos_clave: !!er.utilizar_sistemas_oficiales_somos_clave,
        cortesia_por_favor_gracias: !!er.cortesia_por_favor_gracias,
        validacion_identidad: !!er.validacion_identidad,
        porcentaje: erPct
      },
      informar_accion: {
        indicar_gestion_espera: !!ia.indicar_gestion_espera,
        retomar_en_menos_de_un_minuto: !!ia.retomar_en_menos_de_un_minuto,
        claridad_condiciones_comerciales: !!ia.claridad_condiciones_comerciales,
        resumen_atencion_gestion: !!ia.resumen_atencion_gestion,
        porcentaje: iaPct
      },
      cierre: {
        preguntas_aseguramiento: !!c.preguntas_aseguramiento,
        esperar_confirmacion_cliente: !!c.esperar_confirmacion_cliente,
        guion_encuesta_escala_0_a_10: !!c.guion_encuesta_escala_0_a_10,
        porcentaje: cPct
      }
    },
    porcentaje_total: typeof cg.porcentaje_total === "number" ? cg.porcentaje_total : calculatedTotalPct,
    observaciones_auditoria: cg.observaciones_auditoria || "",
    saludo_institucional: !!b.mencionar_empresa_claro && !!b.mencionar_nombre_apellido,
    verificacion_identidad: !!b.confirmar_nombre_cliente_rut_celular || !!er.validacion_identidad,
    escucha_activa: !!er.parafrasear_problema,
    entrega_ticket_subtel: typeof cg.entrega_ticket_subtel === "boolean" ? cg.entrega_ticket_subtel : true,
    despedida_cordial: !!c.guion_encuesta_escala_0_a_10 || !!c.preguntas_aseguramiento,
    ofrecimiento_ayuda: !!c.preguntas_aseguramiento,
    politica_privacidad: true
  };
  const rawNps = parsed.nps_pronostico || {};
  let npsScore = typeof rawNps.score === "number" ? Math.round(rawNps.score) : 8;
  const rawClasif = String(rawNps.clasificacion || "").toUpperCase().trim();
  const hasCriticalQuiebres = Array.isArray(parsed.quiebres_atencion) && parsed.quiebres_atencion.some((q) => {
    const level = String(q.severidad || q.gravedad || "").toUpperCase();
    return level.startsWith("CRIT");
  });
  let npsClasif = "NEUTRO";
  if (npsScore >= 9 || rawClasif.includes("PROMOTOR") || rawClasif.includes("PROMOTER") || !hasCriticalQuiebres && avgScore >= 80 && npsScore >= 7) {
    npsClasif = "PROMOTOR";
    if (npsScore < 9) npsScore = 9;
  } else if (npsScore <= 6 || rawClasif.includes("DETRACTOR")) {
    npsClasif = "DETRACTOR";
    if (npsScore > 6) npsScore = 4;
  } else {
    npsClasif = "NEUTRO";
  }
  const normalizedNpsPronostico = {
    score: npsScore,
    score_agente: typeof rawNps.score_agente === "number" ? rawNps.score_agente : npsClasif === "PROMOTOR" ? 10 : 8,
    clasificacion: npsClasif,
    pregunta: rawNps.pregunta || "\xBFQu\xE9 tan probable es que recomiendes Claro a un amigo o familiar?",
    escala: rawNps.escala || 'Escala oficial de 0 a 10 (Donde 0 es "Nada probable" y 10 es "Muy probable")',
    justificacion: rawNps.justificacion || (npsClasif === "PROMOTOR" ? "Atenci\xF3n emp\xE1tica y resolutiva que impulsa la recomendaci\xF3n favorable." : "Evaluaci\xF3n de satisfacci\xF3n tNPS predictiva."),
    factor_marca_vs_agente: rawNps.factor_marca_vs_agente || "",
    camino_a_promotor: rawNps.camino_a_promotor || ""
  };
  const durationSeconds = ctx.durationSeconds || parsed.silencio_analisis?.duracion_total_segundos || 420;
  return {
    id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    codigo_llamada: `REC-2026-CHILE-${Math.floor(1e3 + Math.random() * 9e3)}`,
    fecha_hora: (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").substring(0, 16),
    file_name: fileName,
    agente_nombre: agentName && agentName !== "Asesor Claro" ? agentName : detectedAgent,
    agente_id: agentId || (agentName.toLowerCase().includes("camila") ? "AGT-4821" : `AG-${Math.floor(7e3 + Math.random() * 3e3)}`),
    cliente_nombre: detectedCustomer,
    cliente_telefono: "+56 9 " + Math.floor(6e7 + Math.random() * 39999999),
    cola_atencion: queue,
    duracion_total: formatSeconds(durationSeconds),
    duracion_segundos: durationSeconds,
    sentimiento_label: parsed.sentimiento_score > 0.2 ? "Positivo" : parsed.sentimiento_score < -0.2 ? "Negativo" : "Neutro",
    modelo_procesado: model,
    ...parsed,
    qa_score_global: avgScore,
    nps_pronostico: normalizedNpsPronostico,
    cumplimiento_guion: normalizedCumplimientoGuion,
    segmentos: normalizedSegmentos,
    transcripcion: {
      segmentos: normalizedSegmentos
    }
  };
}

// web/longAudioRoute.ts
var AUDIT_INSTRUCTION = `INSTRUCCI\xD3N DE ESTA EJECUCI\xD3N:
La transcripci\xF3n literal ya fue hecha por completo y viene en el mensaje del usuario.
No la repitas. Eval\xFAa la pauta, el tNPS, los silencios, los quiebres y el coaching sobre ese texto \xEDntegro.`;
function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
function readJson(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    return Promise.resolve(req.body ? JSON.parse(req.body) : {});
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new AnalysisError("El cuerpo de la petici\xF3n no es JSON", 400, "BAD_JSON"));
      }
    });
    req.on("error", reject);
  });
}
function publicMessage(err) {
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  let message = err instanceof Error ? err.message : "No se pudo analizar el audio";
  if (token) message = message.split(token).join("[token]");
  message = message.replace(/Bearer\s+\S+/gi, "Bearer [token]").replace(/https:\/\/\S*blob\.vercel-storage\.com\S*/gi, "https://blob.vercel-storage.com/[audio]");
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error?.message) message = parsed.error.message;
  } catch {
  }
  if (/high demand|UNAVAILABLE|currently experiencing|overloaded/i.test(message)) {
    return "Gemini est\xE1 saturado en este momento. Espera un minuto y vuelve a iniciar la auditor\xEDa.";
  }
  return message.slice(0, 500);
}
function assertBlobUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ""));
  } catch {
    throw new AnalysisError("El audio subido no es v\xE1lido", 400, "BAD_BLOB");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    throw new AnalysisError("El audio subido no es v\xE1lido", 400, "BAD_BLOB");
  }
  return parsed.toString();
}
async function readableAudioUrl(blobUrl) {
  const pathname = decodeURIComponent(new URL(blobUrl).pathname.replace(/^\/+/, ""));
  const validUntil = Date.now() + 10 * 60 * 1e3;
  const signed = await issueSignedToken({
    pathname,
    operations: ["get", "head"],
    validUntil
  });
  const { presignedUrl } = await presignUrl(signed, {
    access: "private",
    operation: "get",
    pathname,
    validUntil
  });
  return presignedUrl;
}
function getAI() {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  if (!key || key === "[SENSITIVE]") {
    throw new AnalysisError("GEMINI_API_KEY no est\xE1 configurada en el servidor", 500, "API_KEY_MISSING");
  }
  return new GoogleGenAI2({ apiKey: key });
}
function isMediaFailure(err) {
  return err instanceof AnalysisError && (err.errorType === "FFMPEG_SPLIT_FAILED" || err.errorType === "DURATION_UNREADABLE" || err.errorType === "FFMPEG_MISSING");
}
async function materializeBlob(url) {
  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new AnalysisError("No se pudo leer el audio subido", 502, "BLOB_READ_FAILED");
  }
  const dest = path3.join(os2.tmpdir(), `gea-src-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  const webStream = result.stream;
  await pipeline(Readable.fromWeb(webStream), fs3.createWriteStream(dest));
  return dest;
}
async function planCall(blobUrl) {
  try {
    const durationSeconds = await probeSourceDuration(await readableAudioUrl(blobUrl));
    return { success: true, durationSeconds, windows: planWindows(durationSeconds) };
  } catch (err) {
    if (!isMediaFailure(err) && err instanceof AnalysisError) throw err;
    const local = await materializeBlob(blobUrl);
    try {
      const durationSeconds = await probeSourceDuration(local);
      return { success: true, durationSeconds, windows: planWindows(durationSeconds) };
    } finally {
      fs3.promises.unlink(local).catch(() => {
      });
    }
  }
}
async function transcribeCall(blobUrl, start, length) {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(length) || length <= 0) {
    throw new AnalysisError("El tramo pedido no es v\xE1lido", 400, "BAD_WINDOW");
  }
  if (length > 200) {
    throw new AnalysisError("El tramo es demasiado largo para transcribirlo de una vez", 422, "SPLIT_REQUIRED");
  }
  const ai = getAI();
  try {
    const segments = await transcribeSourceWindow({
      ai,
      source: await readableAudioUrl(blobUrl),
      start,
      length
    });
    return { success: true, segments };
  } catch (err) {
    if (err instanceof AnalysisError && !isMediaFailure(err)) throw err;
    const local = await materializeBlob(blobUrl);
    try {
      const segments = await transcribeSourceWindow({ ai, source: local, start, length });
      return { success: true, segments };
    } finally {
      fs3.promises.unlink(local).catch(() => {
      });
    }
  }
}
async function auditCall(body) {
  const groups = Array.isArray(body.groups) ? body.groups : [];
  const segmentos = mergeWindowSegments(groups);
  if (segmentos.length === 0) {
    throw new AnalysisError("La transcripci\xF3n lleg\xF3 vac\xEDa. El audio no tiene voz reconocible o el modelo no pudo escucharlo.", 422, "EMPTY_TRANSCRIPT");
  }
  const durationSeconds = Number(body.durationSeconds) || segmentos[segmentos.length - 1]?.fin || 0;
  const agentName = String(body.agentName || "Asesor Claro");
  const agentId = String(body.agentId || "");
  const queue = String(body.queue || "General");
  const fileName = String(body.fileName || "grabacion.wav");
  const { audit, modelUsed } = await auditTranscript({
    ai: getAI(),
    segmentos,
    durationSeconds,
    agentName,
    queue,
    auditSystemPrompt: `${getActiveFullPrompt()}

${AUDIT_INSTRUCTION}`,
    auditSchema: qaSchemaWithoutTranscript()
  });
  const parsed = {
    ...audit,
    segmentos,
    silencio_analisis: {
      ...audit.silencio_analisis || {},
      duracion_total_segundos: durationSeconds
    }
  };
  return {
    success: true,
    data: finalizeCallAnalysis(parsed, {
      model: modelUsed,
      fileName,
      agentName,
      agentId,
      queue,
      durationSeconds
    })
  };
}
async function cleanupCall(blobUrl) {
  await del(blobUrl).catch(() => void 0);
  return { success: true };
}
async function handler(req, res) {
  if (req.method !== "POST") {
    send(res, 405, { success: false, message: "M\xE9todo no permitido" });
    return;
  }
  try {
    const body = await readJson(req);
    const action = String(body.action || "");
    if (action === "plan") {
      send(res, 200, await planCall(assertBlobUrl(body.blobUrl)));
      return;
    }
    if (action === "transcribe") {
      send(res, 200, await transcribeCall(assertBlobUrl(body.blobUrl), Number(body.start), Number(body.length)));
      return;
    }
    if (action === "audit") {
      send(res, 200, await auditCall(body));
      return;
    }
    if (action === "cleanup") {
      send(res, 200, await cleanupCall(assertBlobUrl(body.blobUrl)));
      return;
    }
    send(res, 400, { success: false, message: "Acci\xF3n no reconocida" });
  } catch (err) {
    const status = err instanceof AnalysisError ? err.status : 500;
    send(res, status, {
      success: false,
      message: publicMessage(err),
      errorType: err instanceof AnalysisError ? err.errorType : "SERVER_ERROR"
    });
  }
}
export {
  handler as default
};
