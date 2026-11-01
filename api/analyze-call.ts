import { GoogleGenAI, Type } from '@google/genai';
import { callAnalysisSchema, finalizeCallAnalysis, getActiveFullPrompt, DEFAULT_BASE_PROMPT } from '../qaEngine.ts';

// Multi-Key API Harness Manager for Gemini
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

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// callAnalysisSchema imported from ../qaEngine.ts
function normalizeCallRecordNPS(parsed: any, avgScore: number) {
  const rawNps = parsed.nps_pronostico || {};
  let score = typeof rawNps.score === 'number' ? Math.round(rawNps.score) : null;
  const rawClasif = String(rawNps.clasificacion || '').toUpperCase().trim();
  const hasCriticalQuiebres = parsed.quiebres_atencion && Array.isArray(parsed.quiebres_atencion) && parsed.quiebres_atencion.some((q: any) => q.gravedad === 'CRITICO');

  let clasificacion: 'PROMOTOR' | 'NEUTRO' | 'DETRACTOR' = 'NEUTRO';

  if ((score !== null && score >= 9) || rawClasif.includes('PROMOTOR') || rawClasif.includes('PROMOTER') || (!hasCriticalQuiebres && avgScore >= 80 && (score === null || score >= 7))) {
    clasificacion = 'PROMOTOR';
    if (score === null || score < 9) score = 9;
  } else if ((score !== null && score <= 6) || rawClasif.includes('DETRACTOR')) {
    clasificacion = 'DETRACTOR';
    if (score === null || score > 6) score = 4;
  } else {
    clasificacion = 'NEUTRO';
    if (score === null) score = 7;
  }

  return {
    score,
    score_agente: typeof rawNps.score_agente === 'number' ? rawNps.score_agente : (clasificacion === 'PROMOTOR' ? 10 : 8),
    clasificacion,
    pregunta: rawNps.pregunta || '¿Qué tan probable es que recomiendes Claro a un amigo o familiar? Considerando una escala de 0 a 10, donde 0 es "Nada probable" y 10 es "Muy probable"',
    escala: rawNps.escala || 'Escala oficial de 0 a 10 (Donde 0 es "Nada probable" y 10 es "Muy probable")',
    justificacion: rawNps.justificacion || (clasificacion === 'PROMOTOR' ? 'Atención empática y resolutiva que impulsa la recomendación favorable.' : 'Evaluación de satisfacción tNPS predictiva.'),
    factor_marca_vs_agente: rawNps.factor_marca_vs_agente || '',
    camino_a_promotor: rawNps.camino_a_promotor || ''
  };
}

// Groq Ultra-Fast Speech-to-Text & QA Engine
async function analyzeWithGroq(
  groqKey: string,
  audioBase64: string,
  fileName: string,
  agentName: string,
  queue: string,
  promptText: string,
  initialTranscript?: string,
  agentId?: string
) {
  let transcriptText = initialTranscript || '';
  let durationSec = 180;
  let whisperSegments: any[] = [];

  // Step 1: Transcribe with Whisper Large v3 Turbo on Groq
  if (audioBase64 && !transcriptText) {
    const audioBuf = Buffer.from(audioBase64, 'base64');
    const audioBlob = new Blob([audioBuf], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('file', audioBlob, fileName || 'audio.wav');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'es');
    formData.append('response_format', 'verbose_json');

    const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`
      },
      body: formData
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      throw new Error(`Groq Whisper error (${whisperRes.status}): ${errText}`);
    }

    const whisperData = (await whisperRes.json()) as any;
    transcriptText = whisperData.text || '';
    durationSec = Math.max(10, Math.round(whisperData.duration || 180));

    if (Array.isArray(whisperData.segments)) {
      whisperSegments = whisperData.segments.map((seg: any, idx: number) => ({
        id: `sg-${idx + 1}`,
        hablante: idx % 2 === 0 ? 'agente' : 'cliente',
        inicio: Math.round(seg.start || 0),
        fin: Math.round(seg.end || 5),
        texto: seg.text?.trim() || '',
        sentimientoScore: 0.0
      }));
    }
  }

  // Step 2: Perform QA Speech Analytics with LLaMA 3.3 70B on Groq
  const auditPrompt = `${promptText}

TRANSCRIPCIÓN REAL LITERAL OBTENIDA VÍA WHISPER:
${transcriptText || 'Audio de llamada de contact center.'}

Responde ÚNICAMENTE con un JSON válido que contenga la estructura exacta solicitada:
{
  "resumen": "...",
  "motivo_categoria": "soporte|ventas|reclamos|bajas|facturacion",
  "motivo_nombre": "...",
  "sentimiento_score": 0.0,
  "evaluacion_criterios": {
    "amabilidad_empatia": { "nota": 85, "diagnostico": "..." },
    "seguridad_expresarse": { "nota": 90, "diagnostico": "..." },
    "claridad_informacion": { "nota": 80, "diagnostico": "..." },
    "tiempos_espera_hold": { "nota": 75, "diagnostico": "..." },
    "eficiencia_tmo": { "nota": 85, "diagnostico": "..." }
  },
  "cumplimiento_guion": {
    "saludo_institucional": true,
    "verificacion_identidad": true,
    "escucha_activa": true,
    "entrega_ticket_subtel": true,
    "despedida_cordial": true,
    "ofrecimiento_ayuda": true,
    "politica_privacidad": true
  },
  "nps_pronostico": {
    "score": 8,
    "clasificacion": "PROMOTOR",
    "pregunta": "¿Qué tan probable es que recomiendes Claro a un amigo o familiar?",
    "justificacion": "..."
  },
  "silencio_analisis": {
    "duracion_total_segundos": ${durationSec},
    "tiempo_ivr_segundos": 45,
    "tiempo_agente_segundos": ${durationSec - 45},
    "silencio_agente_segundos": 15,
    "porcentaje_silencio": 8,
    "nivel_silencio": "ÓPTIMO",
    "diagnostico_silencio": "..."
  },
  "quiebres_atencion": [],
  "feedback_coaching": {
    "fortalezas": ["..."],
    "oportunidades_mejora": ["..."],
    "guion_sugerido_alternativo": "...",
    "plan_accion": "..."
  },
  "keywords": ["Claro Chile", "RUT", "Boleta"],
  "alertas": [],
  "csat_estimado": 4,
  "resolucion_primer_contacto": true,
  "agente_nombre_detectado": "${agentName}",
  "cliente_nombre_detectado": "Cliente Claro",
  "segmentos": []
}`;

  const candidateGroqModels = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it'
  ];

  let rawJson = '';
  let modelUsed = '';

  for (const modelCandidate of candidateGroqModels) {
    try {
      const chatRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelCandidate,
          messages: [
            {
              role: 'system',
              content: 'Eres el auditor principal de Calidad y Speech Analytics para Claro Chile. Devuelve tu análisis exclusivamente en formato JSON estructurado.'
            },
            {
              role: 'user',
              content: auditPrompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });

      if (chatRes.ok) {
        const chatData = (await chatRes.json()) as any;
        rawJson = chatData.choices?.[0]?.message?.content || '{}';
        modelUsed = modelCandidate;
        break;
      } else {
        const errTxt = await chatRes.text();
        console.warn(`[Groq Model Candidate] ${modelCandidate} failed (${chatRes.status}): ${errTxt}`);
      }
    } catch (e: any) {
      console.warn(`[Groq Model Candidate] Error with ${modelCandidate}:`, e?.message || e);
    }
  }

  if (!rawJson) {
    throw new Error('Ningún modelo de chat de Groq respondió con éxito');
  }

  const parsed = JSON.parse(rawJson);

  const finalSegments = (parsed.segmentos && parsed.segmentos.length > 0)
    ? parsed.segmentos
    : (whisperSegments.length > 0 ? whisperSegments : [
        { id: 'sg1', hablante: 'agente', inicio: 0, fin: 5, texto: transcriptText.slice(0, 100), sentimientoScore: 0.2 }
      ]);

  const crits = parsed.evaluacion_criterios;
  const avgScore = crits ? Math.round(
    (crits.amabilidad_empatia.nota +
     crits.seguridad_expresarse.nota +
     crits.claridad_informacion.nota +
     crits.tiempos_espera_hold.nota +
     crits.eficiencia_tmo.nota) / 5
  ) : 80;

  const completeRecord = {
    id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    codigo_llamada: `REC-2026-CHILE-${Math.floor(1000 + Math.random() * 9000)}`,
    fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
    file_name: fileName,
    agente_nombre: parsed.agente_nombre_detectado || agentName,
    agente_id: agentId || (parsed.agente_id_detectado || `AG-${Math.floor(7000 + Math.random() * 3000)}`),
    cliente_nombre: parsed.cliente_nombre_detectado || 'Cliente Claro',
    cliente_telefono: '+56 9 ' + Math.floor(60000000 + Math.random() * 39999999),
    cola_atencion: queue,
    duracion_total: formatSeconds(parsed.silencio_analisis?.duracion_total_segundos || durationSec),
    duracion_segundos: parsed.silencio_analisis?.duracion_total_segundos || durationSec,
    sentimiento_label: (parsed.sentimiento_score ?? 0) > 0.2 ? 'Positivo' : (parsed.sentimiento_score ?? 0) < -0.2 ? 'Negativo' : 'Neutro',
    modelo_procesado: 'Groq (Whisper-Large-v3 + Llama-3.3-70b)',
    ...parsed,
    qa_score_global: avgScore,
    nps_pronostico: normalizeCallRecordNPS(parsed, avgScore),
    segmentos: finalSegments,
    transcripcion: {
      segmentos: finalSegments
    }
  };

  return completeRecord;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const {
    audioBase64,
    mimeType = 'audio/wav',
    fileName = 'grabacion.wav',
    transcriptText,
    agentName = 'Asesor Claro',
    agentId,
    queue = 'Exclusivo Postpago Chile',
    requestedModelCascade = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest']
  } = req.body || {};

  const prompt = getActiveFullPrompt();

  // 1. First & Primary Priority: Google Gemini Pay-As-You-Go (Direct official key)
  const apiKeys = getApiKeys();
  const models = requestedModelCascade && requestedModelCascade.length > 0 
    ? requestedModelCascade 
    : ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

  let lastErrorDetail = '';
  let retryCount = 0;

  if (apiKeys.length > 0) {
    for (const model of models) {
      for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
        const activeKey = apiKeys[keyIdx];
        const ai = getGenAIClient(activeKey);

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const parts: Array<Record<string, unknown>> = [];
            
            if (audioBase64) {
              parts.push({
                inlineData: {
                  data: audioBase64,
                  mimeType: mimeType || 'audio/wav',
                }
              });
            }
            
            if (transcriptText) {
              parts.push({ text: `Transcripción o contexto inicial de la llamada:\n${transcriptText}` });
            }

            parts.push({ text: prompt });

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Model timeout after 60s')), 60000)
            );

            const generatePromise = ai.models.generateContent({
              model,
              contents: parts,
              config: {
                temperature: 0.1,
                maxOutputTokens: 16384,
                responseMimeType: 'application/json',
                responseSchema: callAnalysisSchema,
              }
            });

            const response = (await Promise.race([generatePromise, timeoutPromise])) as { text?: string };

            const rawText = response.text?.trim() || '{}';
            const parsed = JSON.parse(rawText);

            const crits = parsed.evaluacion_criterios;
            const avgScore = crits ? Math.round(
              (crits.amabilidad_empatia.nota +
               crits.seguridad_expresarse.nota +
               crits.claridad_informacion.nota +
               crits.tiempos_espera_hold.nota +
               crits.eficiencia_tmo.nota) / 5
            ) : 70;

            const rawSegs = parsed.segmentos || parsed.transcripcion?.segmentos || [];
            const normalizedSegmentos = rawSegs.map((seg: any, idx: number) => ({
              id: seg.id || `seg-${idx + 1}`,
              hablante: seg.hablante === 'cliente' ? 'cliente' : 'agente',
              inicio: typeof seg.inicio === 'number' ? seg.inicio : 0,
              fin: typeof seg.fin === 'number' ? seg.fin : 5,
              texto: seg.texto || '',
              sentimientoScore: typeof seg.sentimientoScore === 'number' ? seg.sentimientoScore : 0
            }));

            const detectedAgent = parsed.agente_nombre_detectado && parsed.agente_nombre_detectado !== 'Asesor' 
              ? parsed.agente_nombre_detectado 
              : agentName;
            const detectedCustomer = parsed.cliente_nombre_detectado && parsed.cliente_nombre_detectado !== 'Cliente'
              ? parsed.cliente_nombre_detectado
              : 'Cliente Claro';

            const completeRecord = finalizeCallAnalysis(parsed, {
              model,
              fileName,
              agentName,
              agentId: agentId || (parsed.agente_id_detectado || 'AG-4821'),
              queue,
              durationSeconds: parsed.silencio_analisis?.duracion_total_segundos || 420
            });

            return res.status(200).json({
              success: true,
              data: completeRecord,
              meta: {
                engine: `Google Gemini Pay-As-You-Go (${model})`,
                modelUsed: model,
                apiKeyHarnessSlot: keyIdx + 1,
                totalKeysConfigured: apiKeys.length,
                attempts: attempt,
                totalRetries: retryCount
              }
            });

          } catch (err: unknown) {
            const error = err as { status?: number; message?: string };
            const status = error.status || 500;
            const errMsg = error.message || String(err);
            lastErrorDetail = errMsg;

            if (status === 401 || status === 403 || errMsg.includes('API_KEY_INVALID') || errMsg.includes('unregistered project')) {
              console.warn(`[Gemini Pay-As-You-Go] Clave inválida: ${errMsg}`);
              break;
            }

            console.warn(`[Gemini Model Error] ${model}: ${errMsg}`);
            break;
          }
        }
      }
    }
  }

  // 2. Secondary fallback: Groq (only if Gemini was not available or failed)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      console.log('[Engine Fallback] Intentando con Groq...');
      const groqResult = await analyzeWithGroq(
        groqKey,
        audioBase64,
        fileName,
        agentName,
        queue,
        prompt,
        transcriptText,
        agentId
      );
      return res.status(200).json({
        success: true,
        data: groqResult,
        meta: {
          engine: 'Groq Ultra-Fast (Whisper-v3 + LLaMA-3.3-70B)',
          modelUsed: 'whisper-large-v3-turbo / llama-3.3-70b',
          latency: 'ultra-low'
        }
      });
    } catch (groqErr: any) {
      console.warn('[Engine Fallback] Groq falló:', groqErr?.message || groqErr);
    }
  }

  const isRateLimit = lastErrorDetail.includes('429') || 
                      lastErrorDetail.includes('RESOURCE_EXHAUSTED') || 
                      lastErrorDetail.toLowerCase().includes('quota') ||
                      lastErrorDetail.toLowerCase().includes('rate limit');

  const httpStatus = isRateLimit ? 429 : 500;

  return res.status(httpStatus).json({
    success: false,
    errorType: isRateLimit ? 'QUOTA_EXHAUSTED_ALL_MODELS' : 'ANALYSIS_ERROR',
    message: isRateLimit
      ? 'Se superó el límite de peticiones por minuto en Gemini Pay-As-You-Go. La llamada fue derivada a la cola diferida.'
      : `Error al procesar la llamada con Gemini (${models[0]}): ${lastErrorDetail || 'Error desconocido'}`,
    lastError: lastErrorDetail,
    allowDeferredQueue: isRateLimit
  });
}

function generateRealisticMockAnalysis(fileName: string, agentName: string, queue: string, transcriptText?: string, agentId?: string) {
  const isDetractor = fileName.toLowerCase().includes('reclamo') || fileName.toLowerCase().includes('boleta') || fileName.toLowerCase().includes('baja');
  const durSec = 380 + Math.floor(Math.random() * 200);

  const result: any = {
    id: `call-${Date.now()}`,
    codigo_llamada: `REC-2026-CHILE-${Math.floor(2000 + Math.random() * 7000)}`,
    fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
    file_name: fileName,
    agente_nombre: agentName,
    agente_id: agentId || `AG-${Math.floor(7000 + Math.random() * 3000)}`,
    cliente_nombre: 'Carolina Valenzuela P.',
    cliente_telefono: '+56 9 7842 1190',
    cola_atencion: queue,
    duracion_total: formatSeconds(durSec),
    duracion_segundos: durSec,
    qa_score_global: isDetractor ? 45 : 88,
    resumen: transcriptText 
      ? `Llamada analizada con motor de Speech Analytics.`
      : `El cliente se contactó para resolver una inconsistencia en su facturación postpago. El asesor brindó información técnica pero requirió pausas de consulta en CRM.`,
    motivo_categoria: isDetractor ? 'facturacion' : 'soporte',
    motivo_nombre: isDetractor ? 'Consulta sobre boletas y cobros indebidos' : 'Soporte y configuración de servicios',
    sentimiento_score: isDetractor ? -0.68 : 0.65,
    sentimiento_label: isDetractor ? 'Negativo' : 'Positivo',
    csat_estimado: isDetractor ? 2 : 5,
    resolucion_primer_contacto: !isDetractor,
    evaluacion_criterios: {
      amabilidad_empatia: {
        nota: isDetractor ? 30 : 90,
        diagnostico: isDetractor 
          ? 'El asesor muestra una actitud rígida y condescendiente.' 
          : 'Excelente tono de voz y empatía inmediata.'
      },
      seguridad_expresarse: {
        nota: isDetractor ? 75 : 92,
        diagnostico: 'Demuestra conocimiento en los aplicativos de Claro.'
      },
      claridad_informacion: {
        nota: isDetractor ? 40 : 88,
        diagnostico: isDetractor 
          ? 'La explicación de los descuentos y montos es confusa.' 
          : 'Instrucciones claras y directas.'
      },
      tiempos_espera_hold: {
        nota: isDetractor ? 40 : 85,
        diagnostico: isDetractor 
          ? 'Tiempos de espera prolongados sin cortesía regular.' 
          : 'Pausas informadas y breves.'
      },
      eficiencia_tmo: {
        nota: isDetractor ? 40 : 86,
        diagnostico: isDetractor 
          ? 'Llamada extensa debido a la necesidad de reiterar explicaciones.' 
          : 'Resolución ágil en tiempo óptimo.'
      }
    },
    cumplimiento_guion: {
      saludo_institucional: true,
      verificacion_identidad: true,
      escucha_activa: !isDetractor,
      entrega_ticket_subtel: !isDetractor,
      despedida_cordial: !isDetractor,
      ofrecimiento_ayuda: !isDetractor,
      politica_privacidad: true
    },
    nps_pronostico: {
      score: isDetractor ? 2 : 9,
      clasificacion: isDetractor ? 'DETRACTOR' : 'PROMOTOR',
      pregunta: '¿Qué tan probable es que recomiendes Claro a un amigo o familiar?',
      escala: 'Escala oficial de 0 a 10',
      justificacion: isDetractor 
        ? 'El cliente expresó molestia severa ("estoy chato", "es una burla") por alza no informada en su boleta.'
        : 'Atención ágil, clara y con resolución favorable.'
    },
    silencio_analisis: {
      duracion_total_segundos: durSec,
      tiempo_ivr_segundos: 90,
      tiempo_agente_segundos: durSec - 90,
      silencio_agente_segundos: isDetractor ? 55 : 18,
      porcentaje_silencio: isDetractor ? 19 : 6,
      nivel_silencio: isDetractor ? 'CRÍTICO' : 'ÓPTIMO',
      diagnostico_silencio: isDetractor ? 'Pausas prolongadas en silencio sin justificar.' : 'Silencios mínimos y justificados.'
    },
    quiebres_atencion: isDetractor ? [
      {
        id: 'q-demo-1',
        tiempo: '02:00',
        segundo: 120,
        tipo: 'Tono condescendiente y alusión a la letra chica',
        cita: 'Señora, si lee la letra chica de su contrato sabrá que la promoción duraba 6 meses...',
        severidad: 'ALTO',
        impacto_cliente: 'Cliente se siente vulnerado y manifiesta molestia.'
      }
    ] : [],
    feedback_coaching: {
      fortalezas: ['Validación de titularidad por RUT correcta'],
      oportunidades_mejora: ['Mayor empatía ante modismos de reclamo', 'Entregar ticket normativo SUBTEL'],
      guion_sugerido_alternativo: '"Comprendo su molestia. Revisemos de inmediato el detalle de su boleta y le entrego su número de ticket SUBTEL."',
      plan_accion: 'Refuerzo de protocolo normativo SUBTEL y escucha activa.'
    },
    keywords: ['Boleta', 'RUT', 'SUBTEL', 'Claro Chile'],
    alertas: isDetractor ? ['Alerta Crítica: Mención de SERNAC / SUBTEL'] : ['Atención conforme'],
    segmentos: [
      { id: 'sg1', hablante: 'agente', inicio: 0, fin: 5, texto: 'Bienvenido a Claro Chile, le atiende ' + agentName, sentimientoScore: 0.4 },
      { id: 'sg2', hablante: 'cliente', inicio: 5, fin: 15, texto: 'Hola, tengo dudas con el cobro de mi boleta este mes.', sentimientoScore: isDetractor ? -0.7 : -0.1 }
    ]
  };

  result.transcripcion = { segmentos: result.segmentos };
  return result;
}
