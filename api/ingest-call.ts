import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { callAnalysisSchema, finalizeCallAnalysis, getActiveFullPrompt } from '../qaEngine.ts';
import { readCalibration } from '../calibrationStore.ts';

// Supabase client instance for background persistence
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://givdlqjfnctxvarpybht.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
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

/**
 * Repara automáticamente un JSON de Gemini si fue truncado al final del arreglo "segmentos"
 * en llamadas muy largas (ej. > 10 MB / > 20 min), conservando el 100% de la auditoría y todos los turnos completos.
 */
function parseOrRepairGeminiJson(rawText: string): any {
  let clean = rawText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  try {
    return JSON.parse(clean);
  } catch (firstErr) {
    // Si se truncó dentro de "segmentos": [ ... { ... }, { incompleto
    const segIdx = clean.lastIndexOf('"segmentos"');
    if (segIdx !== -1) {
      let cursor = clean.length;
      while (cursor > segIdx) {
        const lastBrace = clean.lastIndexOf('}', cursor - 1);
        if (lastBrace === -1 || lastBrace <= segIdx) break;
        const candidate = clean.slice(0, lastBrace + 1) + ']}';
        try {
          const recovered = JSON.parse(candidate);
          console.log(`[Ingest Call] JSON largo auto-reparado con éxito (${recovered.segmentos?.length || 0} segmentos conservados).`);
          return recovered;
        } catch {
          cursor = lastBrace;
        }
      }
      // Si ningún segmento cerró, cerrar arreglo vacío
      const bracketIdx = clean.indexOf('[', segIdx);
      if (bracketIdx !== -1) {
        try {
          return JSON.parse(clean.slice(0, bracketIdx + 1) + ']}');
        } catch {}
      }
    }
    throw firstErr;
  }
}

function buildWhatsAppMessage(record: any): string {
  const npsClass = record.nps_pronostico?.clasificacion || 'NEUTRO';
  const npsEmoji = npsClass === 'PROMOTOR' ? '🟢' : npsClass === 'DETRACTOR' ? '🔴' : '🟡';
  const qaScore = record.qa_score_global ?? 0;
  const qaEmoji = qaScore >= 85 ? '🌟' : qaScore >= 70 ? '⚖️' : '⚠️';

  let quiebresText = '• Ninguno detectado (Atención conforme)';
  if (record.quiebres_atencion && record.quiebres_atencion.length > 0) {
    quiebresText = record.quiebres_atencion
      .map((q: any) => `• [${q.tiempo || '00:00'}] *${q.tipo || 'Observación'}* (${q.severidad || 'MEDIO'}): _"${(q.cita || '').slice(0, 75)}"_`)
      .slice(0, 3)
      .join('\n');
  }

  const resumenReal = record.resumen
    ? `\n📝 *Resumen de la Llamada:*\n${record.resumen}\n🎯 *Motivo:* ${record.motivo_nombre || record.motivo_categoria || 'Consulta'}`
    : '';

  let ojtText = '';
  if (record.diagnostico_ojt) {
    const o = record.diagnostico_ojt;
    ojtText = `\n\n👨‍🏫 *Diagnóstico OJT (Piso):*\n• Madurez: ${o.nivel_madurez || 'EN_DESARROLLO'} (${o.indice_autonomia ?? 75}%)\n• Brecha: ${o.brecha_principal || 'Ninguna'}`;
  }

  const opsText = record.diagnostico_operaciones?.es_detractor
    ? `\n\n⚙️ *Alerta Operaciones (Causa Raíz Detracción):*\n• Causa: *${record.diagnostico_operaciones.causa_raiz_nombre}*\n• Responsable: *${record.diagnostico_operaciones.responsabilidad}*\n• Riesgo Fuga: *${record.diagnostico_operaciones.riesgo_churn.toUpperCase()}*\n• Acción: _"${record.diagnostico_operaciones.plan_accion_cliente}"_`
    : '';

  return `📊 *AUDITORÍA AUTOMÁTICA SPEECH ANALYTICS*
━━━━━━━━━━━━━━━━━━━━━━
🔖 *Código:* ${record.codigo_llamada}
👤 *Asesor:* ${record.agente_nombre} (ID: ${record.agente_id})
🧑 *Cliente:* ${record.cliente_nombre || 'Cliente Claro'}
📁 *Archivo:* ${record.file_name}
⏱️ *Duración:* ${record.duracion_total} | Silencio: ${record.silencio_analisis?.porcentaje_silencio ?? 0}%

${qaEmoji} *QA Score Global:* ${qaScore}%
${npsEmoji} *tNPS Pronóstico:* ${record.nps_pronostico?.score ?? '-'}/10 (*${npsClass}*)
CSAT Estimado: ${record.csat_estimado ?? 4}/5 | Sentimiento: ${record.sentimiento_label || 'Neutro'}${resumenReal}

🔍 *Quiebres de Atención:*
${quiebresText}${ojtText}${opsText}

💡 *Plan de Acción Inmediato:*
"${record.feedback_coaching?.plan_accion || 'Refuerzo de protocolo estándar'}"
━━━━━━━━━━━━━━━━━━━━━━
🔗 *Ver análisis completo y audio:*
https://transcripcion-audio-ia.vercel.app`;
}

/**
 * Construye el texto estructurado (chunk rico) y los metadatos para la base vectorial (documentos_qa)
 */
export function buildVectorDocumentPayload(record: any) {
  const segs = Array.isArray(record.segmentos) ? record.segmentos : [];
  const transcriptSnippet = segs
    .slice(0, 25)
    .map((s: any) => `${s.hablante === 'agente' ? 'ASESOR' : 'CLIENTE'}: ${s.texto}`)
    .join('\n');

  const quiebresStr = (record.quiebres_atencion || [])
    .map((q: any) => `[${q.tiempo}] ${q.tipo} (${q.severidad}): "${q.cita}" -> Impacto: ${q.impacto_cliente}`)
    .join(' | ');

  const content = [
    `LLAMADA AUDITADA: ${record.codigo_llamada} | ARCHIVO: ${record.file_name || 'audio.wav'} | FECHA: ${record.fecha_hora}`,
    `ASESOR: ${record.agente_nombre} (ID: ${record.agente_id}) | CLIENTE: ${record.cliente_nombre} | COLA: ${record.cola_atencion}`,
    `MÉTRICAS QA: QA Global ${record.qa_score_global}% | tNPS: ${record.nps_pronostico?.score ?? 8}/10 (${record.nps_pronostico?.clasificacion || 'NEUTRO'}) | Sentimiento: ${record.sentimiento_label} (${record.sentimiento_score}) | Silencio: ${record.silencio_analisis?.porcentaje_silencio ?? 0}%`,
    `MOTIVO / DRIVER: [${record.motivo_categoria}] ${record.motivo_nombre}`,
    `RESUMEN EJECUTIVO: ${record.resumen}`,
    `CAUSA RAÍZ OPERACIONES: ${record.diagnostico_operaciones?.causa_raiz_nombre || 'N/A'} | Responsabilidad: ${record.diagnostico_operaciones?.responsabilidad || 'N/A'} | Riesgo Churn: ${record.diagnostico_operaciones?.riesgo_churn || 'bajo'}`,
    `DIAGNÓSTICO OJT: Madurez ${record.diagnostico_ojt?.nivel_madurez || 'EN_DESARROLLO'} | Brecha: ${record.diagnostico_ojt?.brecha_principal || 'NINGUNA'} | Feedback: ${record.diagnostico_ojt?.feedback_pedagogico || ''}`,
    `QUIEBRES DETECTADOS: ${quiebresStr || 'Sin quiebres'}`,
    `EXTRACTO DE TRANSCRIPCIÓN:\n${transcriptSnippet}`
  ].join('\n');

  const metadata = {
    source: 'call_audit',
    call_id: record.id,
    codigo_llamada: record.codigo_llamada,
    file_name: record.file_name,
    fecha_hora: record.fecha_hora,
    agente_id: record.agente_id,
    agente_nombre: record.agente_nombre,
    cola_atencion: record.cola_atencion,
    motivo_categoria: record.motivo_categoria,
    motivo_nombre: record.motivo_nombre,
    qa_score_global: record.qa_score_global,
    nps_score: record.nps_pronostico?.score ?? 8,
    nps_clasificacion: record.nps_pronostico?.clasificacion || 'NEUTRO',
    sentimiento_label: record.sentimiento_label,
    sentimiento_score: record.sentimiento_score,
    porcentaje_silencio: record.silencio_analisis?.porcentaje_silencio ?? 0,
    riesgo_churn: record.diagnostico_operaciones?.riesgo_churn || 'bajo',
    responsabilidad: record.diagnostico_operaciones?.responsabilidad || 'externa_cliente',
    quiebres_count: (record.quiebres_atencion || []).length
  };

  return { content, metadata };
}

/**
 * Genera el embedding de 3072 dimensiones con Gemini (gemini-embedding-001) y lo guarda en documentos_qa
 */
export async function upsertCallVectorInSupabase(record: any, apiKeys: string[]): Promise<{ synced: boolean; docId?: number; error?: string }> {
  const { content, metadata } = buildVectorDocumentPayload(record);

  if (!apiKeys || apiKeys.length === 0) {
    return { synced: false, error: 'Sin GEMINI_API_KEY para generar embedding' };
  }

  let embeddingValues: number[] | null = null;
  let lastEmbedErr = '';

  const embedModels = ['gemini-embedding-001', 'text-embedding-004'];
  for (const modelName of embedModels) {
    for (const key of apiKeys) {
      try {
        const ai = getGenAIClient(key);
        const embedRes: any = await ai.models.embedContent({
          model: modelName,
          contents: content,
        });
        const vals = embedRes?.embeddings?.[0]?.values || embedRes?.embedding?.values;
        if (Array.isArray(vals) && vals.length === 3072) {
          embeddingValues = vals;
          break;
        }
      } catch (err: any) {
        lastEmbedErr = err?.message || String(err);
      }
    }
    if (embeddingValues) break;
  }

  if (!embeddingValues) {
    return { synced: false, error: `No se obtuvo vector de 3072 dims: ${lastEmbedErr}` };
  }

  try {
    // Evitar duplicados si la misma llamada se re-procesa
    if (record.codigo_llamada) {
      await supabase
        .from('documentos_qa')
        .delete()
        .contains('metadata', { codigo_llamada: record.codigo_llamada });
    }

    const { data, error } = await supabase
      .from('documentos_qa')
      .insert({
        content,
        metadata,
        embedding: JSON.stringify(embeddingValues)
      })
      .select('id')
      .single();

    if (error) {
      return { synced: false, error: error.message };
    }
    return { synced: true, docId: data?.id };
  } catch (e: any) {
    return { synced: false, error: e?.message || String(e) };
  }
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
    let agentName = (req.headers['x-agent-name'] ? decodeURIComponent(String(req.headers['x-agent-name'])) : '') || '';
    let agentId = (req.headers['x-agent-id'] ? decodeURIComponent(String(req.headers['x-agent-id'])) : '') || '';
    let queue = (req.headers['x-queue'] ? decodeURIComponent(String(req.headers['x-queue'])) : '') || 'Exclusivo Postpago Chile';
    let driveUrl = (req.headers['x-drive-url'] ? decodeURIComponent(String(req.headers['x-drive-url'])) : '');

    // Extraer DNI / ID de asesor automáticamente desde el nombre del archivo si viene vacío (ej. "2026.10.30 48590390@geaperu.pe 2.MP3" -> "48590390")
    if (!agentId && fileName) {
      const emailMatch = fileName.match(/([0-9]{7,9})@/i);
      const codeMatch = fileName.match(/\b(AGT[-_]?[0-9A-Za-z]+|AG[-_]?[0-9A-Za-z]+|[0-9]{7,8}[-kK0-9]?)\b/i);
      if (emailMatch) {
        agentId = emailMatch[1];
      } else if (codeMatch) {
        agentId = codeMatch[1].replace('_', '-');
      }
    }

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

    const models = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-pro-preview'];
    let parsed: any = null;
    let modelUsed = '';
    let lastError = '';

    const ingestPrompt = `${prompt}\n\nNOTA TÉCNICA DE SALIDA: Si la grabación supera los 10 minutos de duración, agrupa las intervenciones consecutivas en 'segmentos' en un máximo de 60 turnos representativos para no exceder el límite de tokens del JSON.`;

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
            { text: ingestPrompt }
          ];

          const response = await ai.models.generateContent({
            model,
            contents: parts,
            config: {
              temperature: 0.1,
              maxOutputTokens: 65536,
              responseMimeType: 'application/json',
              responseSchema: callAnalysisSchema,
            }
          });

          const rawText = response.text?.trim() || '{}';
          parsed = parseOrRepairGeminiJson(rawText);
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

    // 5. Direct persistence to Supabase (call_records o operaciones_call_records)
    const targetTable = (req.query.targetTable === 'operaciones_call_records' || req.query.area === 'operaciones')
      ? 'operaciones_call_records'
      : 'call_records';

    let dbPayload: any;
    if (targetTable === 'operaciones_call_records') {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(completeRecord.id);
      const validId = isUuid
        ? completeRecord.id
        : (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : completeRecord.id);
      completeRecord.id = validId;

      dbPayload = {
        id: validId,
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
        csat_estimado: Math.round(Number(completeRecord.csat_estimado) || 4),
        nps_pronostico: completeRecord.nps_pronostico,
        resolucion_primer_contacto: completeRecord.resolucion_primer_contacto,
        sentimiento_score: Number(completeRecord.sentimiento_score) || 0,
        sentimiento_label: completeRecord.sentimiento_label,
        resumen: completeRecord.resumen,
        motivo_categoria: completeRecord.motivo_categoria,
        motivo_nombre: completeRecord.motivo_nombre,
        causa_raiz_categoria: completeRecord.diagnostico_operaciones?.causa_raiz_categoria || 'falla_servicio_red',
        causa_raiz_nombre: completeRecord.diagnostico_operaciones?.causa_raiz_nombre || 'Falla Técnica / Red & Fibra',
        causa_raiz_detalle: completeRecord.diagnostico_operaciones?.causa_raiz_detalle || completeRecord.resumen || '',
        responsabilidad: completeRecord.diagnostico_operaciones?.responsabilidad || 'claro_empresa',
        responsabilidad_justificacion: completeRecord.diagnostico_operaciones?.responsabilidad_justificacion || '',
        riesgo_churn: completeRecord.diagnostico_operaciones?.riesgo_churn || 'medio',
        amenaza_subtel_sernac: Boolean(completeRecord.diagnostico_operaciones?.amenaza_subtel_sernac),
        llamada_reiterada: Boolean(completeRecord.diagnostico_operaciones?.llamada_reiterada),
        citas_quiebre_cliente: completeRecord.diagnostico_operaciones?.citas_quiebre_cliente || [],
        estado_gestion: 'pendiente',
        segmentos: cleanSegments(completeRecord.segmentos || completeRecord.transcripcion?.segmentos),
        alertas: completeRecord.alertas || [],
        quiebres_atencion: completeRecord.quiebres_atencion || [],
        file_name: fileName,
        updated_at: new Date().toISOString()
      };
    } else {
      dbPayload = {
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
        nps_pronostico: completeRecord.diagnostico_operaciones
          ? { ...completeRecord.nps_pronostico, diagnostico_operaciones: completeRecord.diagnostico_operaciones }
          : completeRecord.nps_pronostico,
        diagnostico_ojt: completeRecord.diagnostico_ojt || null,
        diagnostico_operaciones: completeRecord.diagnostico_operaciones || null,
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
    }

    let { error: dbError } = await supabase.from(targetTable).insert(dbPayload);
    if (dbError && targetTable === 'call_records' && /diagnostico_operaciones/i.test(dbError.message)) {
      const { diagnostico_operaciones: _ops, ...withoutOps } = dbPayload;
      const retry = await supabase.from('call_records').insert(withoutOps);
      dbError = retry.error;
    }
    if (dbError && dbError.code !== '23505') {
      console.warn(`[Ingest Call] Advertencia al guardar en Supabase (${targetTable}):`, dbError.message);
    }

    // 6. Auto-vectorize and save in documentos_qa unless skipVector=true (so n8n can either let backend do it or use its own Supabase Vector Store node)
    const skipAutoVector = req.query?.skipVector === 'true' || req.body?.skipVector === true;
    const vectorPayload = buildVectorDocumentPayload(completeRecord);
    let vectorSyncResult: { synced: boolean; docId?: number; error?: string } = { synced: false };
    if (!skipAutoVector) {
      vectorSyncResult = await upsertCallVectorInSupabase(completeRecord, apiKeys);
    }

    // 7. Generate ready-to-send WhatsApp summary string
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
      vectorDocument: {
        table: 'documentos_qa',
        autoSynced: vectorSyncResult.synced,
        docId: vectorSyncResult.docId || null,
        content: vectorPayload.content,
        metadata: vectorPayload.metadata,
      },
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

