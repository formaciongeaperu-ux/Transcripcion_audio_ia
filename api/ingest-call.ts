import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { callAnalysisSchema, finalizeCallAnalysis, getActiveFullPrompt } from '../qaEngine.ts';
import { readCalibration } from '../calibrationStore.ts';

// Supabase client instance for background persistence
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://givdlqjfnctxvarpybht.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_nNtMZhvN0uPRz4QzVnUyPQ_Rs4yyI0D';
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_SECRET = 'gea_n8n_speech_secret_2026';

function getApiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEYS) {
    process.env.GEMINI_API_KEYS.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .forEach(k => { if (!keys.includes(k)) keys.push(k); });
  }
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY.split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)
      .forEach(k => { if (!keys.includes(k)) keys.push(k); });
  }
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k.trim()) {
      const clean = k.trim();
      if (!keys.includes(clean)) keys.push(clean);
    }
  }
  return keys;
}

const clientCache = new Map<string, GoogleGenAI>();
function getGenAIClient(apiKey: string): GoogleGenAI {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    clientCache.set(apiKey, client);
  }
  return client;
}

function readRawBody(req: any): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function cleanSegments(segments: any[]): any[] {
  if (!Array.isArray(segments)) return [];
  return segments.map((seg, idx) => ({
    id: seg.id || `seg-${idx + 1}`,
    hablante: seg.hablante === 'cliente' ? 'cliente' : 'agente',
    inicio: Number(seg.inicio) || 0,
    fin: Number(seg.fin) || 0,
    texto: String(seg.texto || ''),
    sentimientoScore: Number(seg.sentimientoScore) || 0
  }));
}

function buildWhatsAppMessage(record: any): string {
  const npsClass = record.nps_pronostico?.clasificacion || 'NEUTRO';
  const npsEmoji = npsClass === 'PROMOTOR' ? '🟢' : npsClass === 'DETRACTOR' ? '🔴' : '🟡';
  const qaScore = record.qa_score_global ?? 0;
  const qaEmoji = qaScore >= 85 ? '🌟' : qaScore >= 70 ? '⚖️' : '⚠️';

  let quiebresText = '• Ninguno detectado (Atención conforme)';
  if (record.quiebres_atencion && record.quiebres_atencion.length > 0) {
    quiebresText = record.quiebres_atencion
      .map((q: any) => `• [${q.tiempo || '00:00'}] *${q.tipo || 'Observación'}* (${q.severidad || 'MEDIO'})`)
      .slice(0, 3)
      .join('\n');
  }

  let ojtText = '';
  if (record.diagnostico_ojt) {
    const o = record.diagnostico_ojt;
    ojtText = `\n👨‍🏫 *Diagnóstico OJT (Piso):*\n• Madurez: ${o.nivel_madurez || 'EN_DESARROLLO'} (${o.indice_autonomia ?? 75}%)\n• Brecha: ${o.brecha_principal || 'Ninguna'}`;
  }

  return `📊 *AUDITORÍA AUTOMÁTICA SPEECH ANALYTICS*
━━━━━━━━━━━━━━━━━━━━━━
👤 *Asesor:* ${record.agente_nombre} (ID: ${record.agente_id})
📁 *Archivo:* ${record.file_name}
⏱️ *Duración:* ${record.duracion_total} | Cola: ${record.cola_atencion}

${qaEmoji} *QA Score Global:* ${qaScore}%
${npsEmoji} *tNPS Pronóstico:* ${record.nps_pronostico?.score ?? '-'}/10 (*${npsClass}*)
CSAT Estimado: ${record.csat_estimado ?? 4}/5

🔍 *Quiebres de Atención:*
${quiebresText}${ojtText}

💡 *Plan de Acción Inmediato:*
"${record.feedback_coaching?.plan_accion || 'Refuerzo de protocolo estándar'}"
━━━━━━━━━━━━━━━━━━━━━━
🔗 *Ver análisis completo y audio:*
https://transcripcion-audio-ia.vercel.app`;
}

export default async function handler(req: any, res: any) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Secret, X-File-Name, X-Agent-Name, X-Agent-Id, X-Queue, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Utiliza POST.' });
  }

  // 1. Authorization check
  const providedSecret = req.headers['x-api-secret'] || 
                         req.headers['authorization']?.replace(/^Bearer\s+/i, '') || 
                         req.query?.secret;

  const validSecret = process.env.INGEST_API_SECRET || DEFAULT_SECRET;
  if (!providedSecret || providedSecret !== validSecret) {
    return res.status(401).json({
      success: false,
      error: 'No autorizado. Proporciona una clave válida en el header X-API-Secret o parámetro ?secret=...'
    });
  }

  try {
    let audioBase64 = '';
    let mimeType = 'audio/wav';
    let fileName = (req.headers['x-file-name'] ? decodeURIComponent(String(req.headers['x-file-name'])) : '') || 'llamada_n8n.wav';
    let agentName = (req.headers['x-agent-name'] ? decodeURIComponent(String(req.headers['x-agent-name'])) : '') || 'Asesor Claro';
    let agentId = (req.headers['x-agent-id'] ? decodeURIComponent(String(req.headers['x-agent-id'])) : '') || 'AGT-4821';
    let queue = (req.headers['x-queue'] ? decodeURIComponent(String(req.headers['x-queue'])) : '') || 'Exclusivo Postpago Chile';
    let driveUrl = (req.headers['x-drive-url'] ? decodeURIComponent(String(req.headers['x-drive-url'])) : '');

    const contentType = String(req.headers['content-type'] || '');

    // Case A: JSON Payload (Base64 audio or direct URL)
    if (contentType.includes('application/json') && req.body && typeof req.body === 'object') {
      audioBase64 = req.body.audioBase64 || '';
      mimeType = req.body.mimeType || mimeType;
      fileName = req.body.fileName || fileName;
      agentName = req.body.agentName || agentName;
      agentId = req.body.agentId || agentId;
      queue = req.body.queue || queue;
      driveUrl = req.body.driveUrl || driveUrl;

      // If audioUrl provided in JSON, fetch it
      if (!audioBase64 && req.body.audioUrl) {
        const audioFetch = await fetch(req.body.audioUrl);
        if (!audioFetch.ok) throw new Error(`No se pudo descargar el audio desde la URL proporcionada (${audioFetch.status})`);
        const arrayBuf = await audioFetch.arrayBuffer();
        audioBase64 = Buffer.from(arrayBuf).toString('base64');
        mimeType = audioFetch.headers.get('content-type') || mimeType;
      }
    } 
    // Case B: Raw Binary stream from n8n
    else {
      const rawBuf = await readRawBody(req);
      if (rawBuf && rawBuf.length > 0) {
        audioBase64 = rawBuf.toString('base64');
        if (contentType.startsWith('audio/')) {
          mimeType = contentType.split(';')[0];
        } else if (fileName.endsWith('.mp3')) {
          mimeType = 'audio/mp3';
        } else if (fileName.endsWith('.m4a')) {
          mimeType = 'audio/mp4';
        }
      }
    }

    if (!audioBase64) {
      return res.status(400).json({
        success: false,
        error: 'No se recibió archivo de audio (debe enviarse en binario, audioBase64 o audioUrl).'
      });
    }

    // 2. Load active calibration directives from Admin Panel
    const calibration = await readCalibration().catch(() => null);
    const prompt = getActiveFullPrompt(calibration);

    // 3. Process with Gemini
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY no está configurada en el servidor. Configura la clave en Vercel o en las variables de entorno.'
      });
    }

    const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.1-pro-preview'];
    let parsed: any = null;
    let modelUsed = '';
    let lastError = '';

    for (const model of models) {
      for (const key of apiKeys) {
        try {
          const ai = getGenAIClient(key);
          const parts: Array<Record<string, unknown>> = [
            {
              inlineData: {
                data: audioBase64,
                mimeType,
              }
            },
            { text: prompt }
          ];

          const response = await ai.models.generateContent({
            model,
            contents: parts,
            config: {
              temperature: 0.1,
              maxOutputTokens: 16384,
              responseMimeType: 'application/json',
              responseSchema: callAnalysisSchema,
            }
          });

          const rawText = response.text?.trim() || '{}';
          parsed = JSON.parse(rawText);
          modelUsed = model;
          break;
        } catch (err: any) {
          lastError = err?.message || String(err);
          console.warn(`[Ingest Call] Error con ${model}:`, lastError);
        }
      }
      if (parsed) break;
    }

    if (!parsed) {
      return res.status(502).json({
        success: false,
        error: `No se pudo analizar el audio con Gemini: ${lastError}`
      });
    }

    // 4. Finalize call record according to Claro Chile standards
    const completeRecord = finalizeCallAnalysis(parsed, {
      model: modelUsed,
      fileName,
      agentName,
      agentId,
      queue,
      durationSeconds: parsed.silencio_analisis?.duracion_total_segundos || 240
    });

    if (driveUrl) {
      completeRecord.audio_url = driveUrl;
    }

    // 5. Direct persistence to Supabase call_records
    const dbPayload = {
      id: completeRecord.id,
      codigo_llamada: completeRecord.codigo_llamada,
      fecha_hora: completeRecord.fecha_hora,
      agente_nombre: completeRecord.agente_nombre,
      agente_id: completeRecord.agente_id,
      cliente_nombre: completeRecord.cliente_nombre,
      cliente_telefono: completeRecord.cliente_telefono,
      cola_atencion: completeRecord.cola_atencion,
      duracion_total: completeRecord.duracion_total,
      duracion_segundos: Math.round(Number(completeRecord.duracion_segundos) || 0),
      qa_score_global: Math.round(Number(completeRecord.qa_score_global) || 0),
      resumen: completeRecord.resumen,
      motivo_categoria: completeRecord.motivo_categoria,
      motivo_nombre: completeRecord.motivo_nombre,
      sentimiento_score: Number(completeRecord.sentimiento_score) || 0,
      sentimiento_label: completeRecord.sentimiento_label,
      csat_estimado: Math.round(Number(completeRecord.csat_estimado) || 4),
      resolucion_primer_contacto: completeRecord.resolucion_primer_contacto,
      evaluacion_criterios: completeRecord.evaluacion_criterios,
      cumplimiento_guion: completeRecord.cumplimiento_guion,
      nps_pronostico: completeRecord.nps_pronostico,
      diagnostico_ojt: completeRecord.diagnostico_ojt || null,
      silencio_analisis: completeRecord.silencio_analisis,
      quiebres_atencion: completeRecord.quiebres_atencion || [],
      feedback_coaching: completeRecord.feedback_coaching,
      keywords: completeRecord.keywords || [],
      alertas: completeRecord.alertas || [],
      segmentos: cleanSegments(completeRecord.segmentos || completeRecord.transcripcion?.segmentos),
      audio_url: completeRecord.audio_url || null,
      file_name: fileName,
      modelo_procesado: `Ingest n8n (${modelUsed})`,
      updated_at: new Date().toISOString()
    };

    const { error: dbError } = await supabase.from('call_records').insert(dbPayload);
    if (dbError && dbError.code !== '23505') {
      console.warn('[Ingest Call] Advertencia al guardar en Supabase:', dbError.message);
    }

    // 6. Generate ready-to-send WhatsApp summary string
    const whatsappMessage = buildWhatsAppMessage(completeRecord);

    return res.status(200).json({
      success: true,
      callId: completeRecord.id,
      codigoLlamada: completeRecord.codigo_llamada,
      fileName,
      agent: {
        id: completeRecord.agente_id,
        name: completeRecord.agente_nombre,
      },
      metrics: {
        qaScore: completeRecord.qa_score_global,
        npsScore: completeRecord.nps_pronostico?.score,
        npsClassification: completeRecord.nps_pronostico?.clasificacion,
        csat: completeRecord.csat_estimado,
        duration: completeRecord.duracion_total,
        durationSeconds: completeRecord.duracion_segundos
      },
      quiebresCount: (completeRecord.quiebres_atencion || []).length,
      quiebres: completeRecord.quiebres_atencion || [],
      alertas: completeRecord.alertas || [],
      diagnosticoOjt: completeRecord.diagnostico_ojt || null,
      feedback: completeRecord.feedback_coaching,
      whatsappSummary: whatsappMessage,
      data: completeRecord
    });

  } catch (error: any) {
    console.error('[Ingest Call Error]:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Error interno al procesar e ingestar la llamada'
    });
  }
}

