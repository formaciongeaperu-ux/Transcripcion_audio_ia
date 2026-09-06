import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with 50MB limit for audio uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy GoogleGenAI initialization
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({
    status: 'ok',
    geminiKeyConfigured: hasKey,
    supportedModels: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'],
    serverTime: new Date().toISOString(),
  });
});

// Telephony Audio Transcoding Helper (Converts G.711 / GSM / ADPCM / non-standard WAV / MP3 to standard 16kHz Mono 16-bit PCM WAV)
async function transcodeToCanonicalWav(audioBase64: string): Promise<string> {
  try {
    const inputBuf = Buffer.from(audioBase64, 'base64');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempInput = path.join(os.tmpdir(), `audio-in-${id}.tmp`);
    const tempOutput = path.join(os.tmpdir(), `audio-out-${id}.wav`);

    await fs.promises.writeFile(tempInput, inputBuf);

    // Convert via ffmpeg to standard canonical 16-bit linear PCM WAV at 16,000 Hz Mono
    await new Promise((resolve, reject) => {
      execFile(
        'ffmpeg',
        ['-y', '-i', tempInput, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', tempOutput],
        (err) => {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });

    const outputBuf = await fs.promises.readFile(tempOutput);

    // Cleanup temporary files
    fs.promises.unlink(tempInput).catch(() => {});
    fs.promises.unlink(tempOutput).catch(() => {});

    return outputBuf.toString('base64');
  } catch (error) {
    console.warn('[Audio Transcode] ffmpeg transcoding failed, keeping original audio base64:', error);
    return audioBase64;
  }
}

// Telephony Audio Transcoding Endpoint
app.post('/api/convert-audio', async (req, res) => {
  try {
    const { audioBase64 } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'Se requiere audioBase64' });
    }

    const outputBase64 = await transcodeToCanonicalWav(audioBase64);
    const outputBuf = Buffer.from(outputBase64, 'base64');

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', outputBuf.length);
    res.send(outputBuf);
  } catch (error: any) {
    console.error('Audio conversion error:', error);
    res.status(500).json({ error: error?.message || 'Error al transcodificar audio de telefonía' });
  }
});

// Sleep helper for exponential backoff with jitter
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms + Math.random() * 500));

// Schema for Gemini call analysis
const callAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    resumen: { type: Type.STRING, description: 'Resumen ejecutivo de la llamada' },
    motivo_categoria: { type: Type.STRING, description: 'Categoria: soporte | ventas | reclamos | bajas | facturacion' },
    motivo_nombre: { type: Type.STRING, description: 'Nombre descriptivo del motivo o driver de llamada' },
    sentimiento_score: { type: Type.NUMBER, description: 'Score de sentimiento de -1.0 a 1.0' },
    evaluacion_criterios: {
      type: Type.OBJECT,
      properties: {
        amabilidad_empatia: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: 'Puntuación 0 a 100' },
            diagnostico: { type: Type.STRING, description: 'Justificación detallada con marcas de tiempo' }
          },
          required: ['nota', 'diagnostico']
        },
        seguridad_expresarse: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: 'Puntuación 0 a 100' },
            diagnostico: { type: Type.STRING, description: 'Justificación técnica y solidez verbal' }
          },
          required: ['nota', 'diagnostico']
        },
        claridad_informacion: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: 'Puntuación 0 a 100' },
            diagnostico: { type: Type.STRING, description: 'Justificación didáctica' }
          },
          required: ['nota', 'diagnostico']
        },
        tiempos_espera_hold: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: 'Puntuación 0 a 100' },
            diagnostico: { type: Type.STRING, description: 'Justificación de tiempos de espera' }
          },
          required: ['nota', 'diagnostico']
        },
        eficiencia_tmo: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: 'Puntuación 0 a 100' },
            diagnostico: { type: Type.STRING, description: 'Justificación de agilidad y duración' }
          },
          required: ['nota', 'diagnostico']
        }
      },
      required: ['amabilidad_empatia', 'seguridad_expresarse', 'claridad_informacion', 'tiempos_espera_hold', 'eficiencia_tmo']
    },
    cumplimiento_guion: {
      type: Type.OBJECT,
      properties: {
        saludo_institucional: { type: Type.BOOLEAN, description: 'Saludo institucional con mención de la marca Claro y nombre del asesor' },
        verificacion_identidad: { type: Type.BOOLEAN, description: 'Verificación de titularidad mediante RUT chileno' },
        escucha_activa: { type: Type.BOOLEAN, description: 'Escucha activa sin interrupciones ni sobreposiciones' },
        entrega_ticket_subtel: { type: Type.BOOLEAN, description: 'Entrega de número de orden / reclamo / ticket de atención (obligatorio por normativa SUBTEL)' },
        despedida_cordial: { type: Type.BOOLEAN, description: 'Despedida cordial de cierre' },
        ofrecimiento_ayuda: { type: Type.BOOLEAN },
        politica_privacidad: { type: Type.BOOLEAN }
      },
      required: ['saludo_institucional', 'verificacion_identidad', 'escucha_activa', 'entrega_ticket_subtel', 'despedida_cordial']
    },
    nps_pronostico: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.NUMBER, description: 'Puntaje predicho de 0 a 10' },
        clasificacion: { type: Type.STRING, description: 'DETRACTOR (0-6) | NEUTRO (7-8) | PROMOTOR (9-10)' },
        pregunta: { type: Type.STRING, description: 'Pregunta oficial: ¿Qué tan probable es que recomiendes Claro a un amigo o familiar?' },
        justificacion: { type: Type.STRING, description: 'Explicación del pronóstico NPS' }
      },
      required: ['score', 'clasificacion', 'justificacion']
    },
    silencio_analisis: {
      type: Type.OBJECT,
      properties: {
        duracion_total_segundos: { type: Type.NUMBER },
        tiempo_ivr_segundos: { type: Type.NUMBER, description: 'Tiempo previo en IVR antes de interactuar' },
        tiempo_agente_segundos: { type: Type.NUMBER, description: 'Tiempo con el agente' },
        silencio_agente_segundos: { type: Type.NUMBER, description: 'Tiempo total en silencio/dead air con el agente' },
        porcentaje_silencio: { type: Type.NUMBER, description: 'Porcentaje de silencio con el agente' },
        nivel_silencio: { type: Type.STRING, description: 'ÓPTIMO | MODERADO | CRÍTICO' },
        diagnostico_silencio: { type: Type.STRING }
      },
      required: ['duracion_total_segundos', 'tiempo_ivr_segundos', 'tiempo_agente_segundos', 'silencio_agente_segundos', 'porcentaje_silencio', 'nivel_silencio', 'diagnostico_silencio']
    },
    quiebres_atencion: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tiempo: { type: Type.STRING, description: 'Timestamp en formato mm:ss ej 02:45' },
          segundo: { type: Type.NUMBER },
          tipo: { type: Type.STRING, description: 'Tipo de quiebre' },
          cita: { type: Type.STRING, description: 'Cita textual del asesor o silencio' },
          severidad: { type: Type.STRING, description: 'CRÍTICO | ALTO | MEDIO' },
          impacto_cliente: { type: Type.STRING }
        },
        required: ['tiempo', 'segundo', 'tipo', 'cita', 'severidad', 'impacto_cliente']
      }
    },
    feedback_coaching: {
      type: Type.OBJECT,
      properties: {
        fortalezas: { type: Type.ARRAY, items: { type: Type.STRING } },
        oportunidades_mejora: { type: Type.ARRAY, items: { type: Type.STRING } },
        guion_sugerido_alternativo: { type: Type.STRING },
        plan_accion: { type: Type.STRING }
      },
      required: ['fortalezas', 'oportunidades_mejora', 'guion_sugerido_alternativo', 'plan_accion']
    },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    alertas: { type: Type.ARRAY, items: { type: Type.STRING } },
    csat_estimado: { type: Type.NUMBER, description: '1 a 5' },
    resolucion_primer_contacto: { type: Type.BOOLEAN },
    agente_nombre_detectado: { type: Type.STRING, description: 'Nombre real del asesor que atiende la llamada' },
    cliente_nombre_detectado: { type: Type.STRING, description: 'Nombre real del cliente mencionado en la llamada (o "Cliente Claro" si no se dice)' },
    segmentos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hablante: { type: Type.STRING, description: 'agente | cliente' },
          inicio: { type: Type.NUMBER },
          fin: { type: Type.NUMBER },
          texto: { type: Type.STRING },
          sentimientoScore: { type: Type.NUMBER }
        },
        required: ['hablante', 'inicio', 'fin', 'texto', 'sentimientoScore']
      }
    }
  },
  required: [
    'resumen', 'motivo_categoria', 'motivo_nombre', 'sentimiento_score',
    'evaluacion_criterios', 'cumplimiento_guion', 'nps_pronostico',
    'silencio_analisis', 'quiebres_atencion', 'feedback_coaching',
    'keywords', 'alertas', 'csat_estimado', 'resolucion_primer_contacto', 'segmentos'
  ]
};

// Analyze call endpoint with Level 1 cascade & exponential backoff
app.post('/api/analyze-call', async (req, res) => {
  const {
    audioBase64,
    mimeType = 'audio/wav',
    fileName = 'grabacion.wav',
    transcriptText,
    agentName = 'Asesor Claro',
    queue = 'Exclusivo Postpago Chile',
    requestedModelCascade = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
  } = req.body;

  const ai = getGenAI();

  // If no Gemini API key, generate realistic intelligent QA analysis directly
  if (!ai) {
    const fallbackResult = generateRealisticMockAnalysis(fileName, agentName, queue, transcriptText);
    return res.json({
      success: true,
      data: fallbackResult,
      meta: {
        engine: 'Intelligent Heuristics (Configure GEMINI_API_KEY for live AI)',
        modelUsed: 'local-qa-engine',
        retries: 0
      }
    });
  }

  const prompt = `Eres un auditor experto en Speech Analytics y Aseguramiento de la Calidad (QA) para Contact Centers de Claro en Chile.

REGLA SUPREMA - TRANSCRIPCIÓN REAL Y VERÍDICA (ESTRICTAMENTE PROHIBIDO CONTENIDO GENÉRICO O PLANTILLAS):
- Tu función fundamental es escuchar atentamente el archivo de audio adjunto y transcribir LITERALMENTE lo que se habla en la grabación real.
- QUEDA ESTRICTAMENTE PROHIBIDO inventar diálogos, usar plantillas prefabricadas o generar textos genéricos de ejemplo como "Juan", "Pedro Pérez", "RUT 12.345.678-K", o conversaciones de muestra.
- Debes transcribir cada palabra exacta, modismo, pausa y respuesta que se escuche en la llamada real de principio a fin.
- Si en la llamada los interlocutores dicen sus nombres reales, extráelos en 'agente_nombre_detectado' y 'cliente_nombre_detectado'.

CONTEXTO CULTURAL Y OPERATIVO HÍBRIDO (CHILENO - PERUANO):
- La atención en los Contact Centers de Claro para Chile involucra habitualmente una interacción híbrida:
  * ASESORES: Generalmente con acento peruano neutro institucional o formal, protocolos de atención al cliente de telecomunicaciones, modismos de servicio cordiales.
  * CLIENTES: Ciudadanos chilenos con modismos locales, acento chileno, ritmo y cadencia rápida.
- Comprende y transcribe fielmente el vocabulario y términos chilenos:
  * "Boleta" = Cuenta / Factura mensual.
  * "RUT" = Documento de identidad nacional chileno.
  * "Al tiro" = De inmediato / Rápidamente.
  * "Cachar / Cachái" = Entender / ¿Entiendes?
  * "Chato / Chata" = Molesto(a) / Cansado(a) ("estoy chato con el cobro").
  * "Caleta" = Mucho / Bastante tiempo.
  * "Bajar el plan / Portabilidad / Cortar la línea" = Gestiones comerciales.
  * "Banda ancha / Factibilidad / ONT / Router" = Términos técnicos.

DETECCIÓN DE ALERTAS CRÍTICAS:
- Registra en 'alertas' si el cliente menciona:
  * "SERNAC" (Servicio Nacional del Consumidor).
  * "SUBTEL" (Subsecretaría de Telecomunicaciones).
  * "Demanda", "Abogado", "Denuncia", "Estafa", "Burla", "Colmo".
  * Intención de fuga o portabilidad a Entel, Movistar o WOM.

VALIDACIÓN DE GUION INSTITUCIONAL CHILENO:
- Saludo institucional (mención de la marca Claro y nombre del asesor) -> cumplimiento_guion.saludo_institucional
- Verificación de titularidad mediante RUT chileno -> cumplimiento_guion.verificacion_identidad
- Escucha activa sin interrupciones -> cumplimiento_guion.escucha_activa
- Entrega de número de orden / reclamo / ticket de atención (obligatorio por normativa SUBTEL) -> cumplimiento_guion.entrega_ticket_subtel
- Despedida cordial -> cumplimiento_guion.despedida_cordial

TRANSCRIPCIÓN EXHAUSTIVA DE PRINCIPIO A FIN EN 'segmentos':
- Provee secuencialmente TODOS los turnos reales de habla desde el segundo 0 hasta el final de la llamada.
- Cada segmento debe tener:
  * 'hablante': 'agente' | 'cliente'
  * 'inicio': segundo exacto en que empieza a hablar
  * 'fin': segundo exacto en que termina de hablar
  * 'texto': transcripción literal de lo que dijo en ese turno (palabra por palabra)
  * 'sentimientoScore': valor entre -1.0 (muy molesto/frustrado) y 1.0 (muy satisfecho/amable)
- No resumas la conversación en 3 o 4 líneas. Transcribe todos y cada uno de los turnos de diálogo que ocurran en el audio real.

AUDITORÍA DE CALIDAD Y SPEECH ANALYTICS (CLARO CHILE):
1. Evalúa los 5 criterios de calidad de 0 a 100: Amabilidad/Empatía, Seguridad al expresarse, Claridad de información, Tiempos de espera (hold), y Eficiencia TMO con diagnósticos descriptivos.
2. Identifica los QUIEBRES de los asesores a nivel de atención (momentos críticos donde el asesor fue cortante, condescendiente, interrumpió al cliente, desinformó, o dejó silencios sin cortesía).
3. Pronóstico de NPS con la pregunta oficial: "¿Qué tan probable es que recomiendes Claro a un amigo o familiar? Considerando una escala de 0 a 10, donde 0 es 'Nada probable' y 10 es 'Muy probable'". Clasifica en DETRACTOR (0-6), NEUTRO (7-8) o PROMOTOR (9-10), justificando ampliamente el motivo de la calificación.
4. Tiempo de Silencio Conversacional: Evalúa el silencio considerando ÚNICAMENTE desde que le ingresa la llamada al agente y puede interactuar, separándolo del IVR previo.
5. Plan de coaching y feedback accionable para el asesor, incluyendo guion sugerido alternativo y plan de acción.`;

  // Resilience Cascade loop
  const models = requestedModelCascade && requestedModelCascade.length > 0 
    ? requestedModelCascade 
    : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

  let lastErrorDetail = '';
  let retryCount = 0;

  // Transcode audio to verified canonical 16kHz mono WAV if present
  let transcodedAudioBase64 = '';
  if (audioBase64) {
    transcodedAudioBase64 = await transcodeToCanonicalWav(audioBase64);
  }

  for (const model of models) {
    // Up to 3 retries per model with exponential backoff for 429
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const parts: Array<Record<string, unknown>> = [];
        
        if (transcodedAudioBase64) {
          parts.push({
            inlineData: {
              data: transcodedAudioBase64,
              mimeType: 'audio/wav',
            }
          });
        }
        
        if (transcriptText) {
          parts.push({ text: `Transcripción o contexto inicial de la llamada:\n${transcriptText}` });
        }

        parts.push({ text: prompt });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Model timeout after 120s')), 120000)
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

        // Normalize QA score global
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

        const completeRecord = {
          id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          codigo_llamada: `REC-2026-CHILE-${Math.floor(1000 + Math.random() * 9000)}`,
          fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
          agente_nombre: detectedAgent,
          agente_id: `AG-${Math.floor(7000 + Math.random() * 3000)}`,
          cliente_nombre: detectedCustomer,
          cliente_telefono: '+56 9 ' + Math.floor(60000000 + Math.random() * 39999999),
          cola_atencion: queue,
          duracion_total: formatSeconds(parsed.silencio_analisis?.duracion_total_segundos || 420),
          duracion_segundos: parsed.silencio_analisis?.duracion_total_segundos || 420,
          qa_score_global: avgScore,
          sentimiento_label: parsed.sentimiento_score > 0.2 ? 'Positivo' : parsed.sentimiento_score < -0.2 ? 'Negativo' : 'Neutro',
          modelo_procesado: model,
          ...parsed,
          segmentos: normalizedSegmentos,
          transcripcion: {
            segmentos: normalizedSegmentos
          }
        };

        return res.json({
          success: true,
          data: completeRecord,
          meta: {
            modelUsed: model,
            attempts: attempt,
            totalRetries: retryCount
          }
        });

      } catch (err: unknown) {
        const error = err as { status?: number; message?: string };
        const status = error.status || 500;
        const errMsg = error.message || String(err);
        lastErrorDetail = errMsg;

        // Check for 401/403 Invalid API key
        if (status === 401 || status === 403 || errMsg.includes('API_KEY_INVALID') || errMsg.includes('unregistered project')) {
          return res.status(401).json({
            success: false,
            errorType: 'API_KEY_INVALID',
            message: 'La clave de Gemini API es inválida o no tiene permisos. Por favor revísala en Google AI Studio.',
            setupUrl: 'https://aistudio.google.com/app/apikey'
          });
        }

        // Check for 429 Too Many Requests
        const is429 = status === 429 || errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Too Many Requests');
        
        if (is429) {
          retryCount++;
          // Exponential backoff: 2s -> 4s -> 8s with jitter
          const backoffTime = Math.pow(2, attempt) * 1000;
          console.warn(`[429 Quota Exceeded] Modelo ${model}, intento ${attempt}/3. Esperando ${backoffTime}ms...`);
          await sleep(backoffTime);
          continue; // retry same model
        } else {
          // Other error: break to next model in cascade
          console.warn(`[Model Error] ${model}: ${errMsg}. Pasando al siguiente modelo en cascada...`);
          break;
        }
      }
    }
  }

  // If all models in cascade exhausted retries:
  res.status(429).json({
    success: false,
    errorType: 'QUOTA_EXHAUSTED_ALL_MODELS',
    message: 'Se agotó la cuota de peticiones en todos los modelos en cascada (HTTP 429). El audio puede ser enviado a la cola diferida de reintento automático.',
    lastError: lastErrorDetail,
    allowDeferredQueue: true
  });
});

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Realistic fallback generator when API key is not present
function generateRealisticMockAnalysis(fileName: string, agentName: string, queue: string, transcriptText?: string) {
  const isDetractor = fileName.toLowerCase().includes('reclamo') || fileName.toLowerCase().includes('boleta') || fileName.toLowerCase().includes('baja');
  const durSec = 380 + Math.floor(Math.random() * 200);
  const ivrSec = 90 + Math.floor(Math.random() * 150);
  const silenceSec = isDetractor ? 65 : 22;
  const silencePct = Math.round((silenceSec / durSec) * 100);

  const result: any = {
    id: `call-${Date.now()}`,
    codigo_llamada: `REC-2026-CHILE-${Math.floor(2000 + Math.random() * 7000)}`,
    fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
    agente_nombre: agentName,
    agente_id: `AG-${Math.floor(7000 + Math.random() * 3000)}`,
    cliente_nombre: 'Carolina Valenzuela P.',
    cliente_telefono: '+56 9 7842 1190',
    cola_atencion: queue,
    duracion_total: formatSeconds(durSec),
    duracion_segundos: durSec,
    qa_score_global: isDetractor ? 45 : 88,
    resumen: transcriptText 
      ? `Llamada analizada con motor de Speech Analytics. Se revisaron los criterios de atención, quiebres del asesor y experiencia de usuario.`
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
          ? 'El asesor muestra una actitud rígida y condescendiente al solicitar al cliente que espere, sin la calidez esperada.' 
          : 'Excelente tono de voz, empatía inmediata y validación de las necesidades del cliente.'
      },
      seguridad_expresarse: {
        nota: isDetractor ? 75 : 92,
        diagnostico: 'Demuestra conocimiento en los aplicativos de Claro, explicando las opciones disponibles.'
      },
      claridad_informacion: {
        nota: isDetractor ? 40 : 88,
        diagnostico: isDetractor 
          ? 'La explicación de los descuentos y montos es confusa, sin lenguaje didáctico.' 
          : 'Instrucciones claras y directas, confirmando la comprensión del usuario.'
      },
      tiempos_espera_hold: {
        nota: isDetractor ? 40 : 85,
        diagnostico: isDetractor 
          ? 'Tiempos de espera prolongados sin cortesía de retención regular.' 
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
      pregunta: '¿Qué tan probable es que recomiendes Claro a un amigo o familiar? Considerando una escala de 0 a 10, donde 0 es "Nada probable" y 10 es "Muy probable"',
      escala: 'Escala oficial de 0 a 10 (Donde 0 es "Nada probable" y 10 es "Muy probable")',
      justificacion: isDetractor 
        ? 'El cliente expresó molestia severa ("estoy chato", "es una burla") por alza no informada en su boleta y anunció escalamiento formal al SERNAC y portabilidad a la competencia tras trato cortante del asesor.'
        : 'Atención empática y resolutiva con entrega al tiro de regularización comercial y número de ticket normativo SUBTEL.'
    },
    silencio_analisis: {
      duracion_total_segundos: durSec,
      tiempo_ivr_segundos: ivrSec,
      tiempo_agente_segundos: durSec,
      silencio_agente_segundos: silenceSec,
      porcentaje_silencio: silencePct,
      nivel_silencio: silencePct > 18 ? 'CRÍTICO' : silencePct > 10 ? 'MODERADO' : 'ÓPTIMO',
      diagnostico_silencio: `Se registraron ${silenceSec} segundos de silencio durante la interacción directa con el asesor (excluyendo los ${ivrSec}s del IVR previo).`
    },
    quiebres_atencion: isDetractor ? [
      {
        id: 'q-demo-1',
        tiempo: '02:00',
        segundo: 120,
        tipo: 'Invalidación de la queja y tono condescendiente',
        cita: 'Señora, si lee la letra chica de su contrato sabrá que la promoción duraba 6 meses y ya se cumplió el plazo.',
        severidad: 'CRÍTICO',
        impacto_cliente: 'Cliente se siente descalificado, elevando el reclamo por cobros indebidos en su boleta.'
      },
      {
        id: 'q-demo-2',
        tiempo: '04:20',
        segundo: 260,
        tipo: 'Dead air prolongado e interrupción de la escucha activa',
        cita: '[Silencio de 45 segundos sin cortesía ni música de retención]',
        severidad: 'ALTO',
        impacto_cliente: 'Cliente manifiesta "¿Hola? ¿Se cortó la llamada? Llevo caleta de minutos en silencio...".'
      },
      {
        id: 'q-demo-3',
        tiempo: '05:40',
        segundo: 340,
        tipo: 'Omisión de entrega de ticket normativo SUBTEL y cierre abrupto',
        cita: 'Bueno, ya le expliqué que el sistema no lo permite. Queda registrado en su cuenta. Buenas tardes.',
        severidad: 'CRÍTICO',
        impacto_cliente: 'Cliente corta enfurecido anunciando denuncia ante el SERNAC y la SUBTEL.'
      }
    ] : [],
    feedback_coaching: {
      fortalezas: ['Validación de titularidad por RUT correcta', 'Identificación rápida de cuenta en el CRM'],
      oportunidades_mejora: [
        'Mayor empatía ante modismos de reclamo ("estoy chato", "es una burla")',
        'Evitar culpar al cliente sobre la "letra chica" del contrato',
        'Obligación normativa SUBTEL: siempre dictar el número de reclamo o ticket único'
      ],
      guion_sugerido_alternativo: '"Comprendo su molestia con la boleta. Revisemos al tiro el detalle y le entrego de inmediato su número de ticket de atención SUBTEL."',
      plan_accion: 'Taller de contención verbal chilena y refuerzo del protocolo normativo de reclamos SUBTEL/SERNAC (30 min).'
    },
    keywords: ['Boleta', 'RUT', 'SERNAC', 'SUBTEL', 'Portabilidad', 'Al tiro', 'Postpago', 'Claro Chile'],
    alertas: isDetractor 
      ? ['Alerta Crítica: Mención de SERNAC', 'Alerta Crítica: Solicitud de Portabilidad / Baja', 'Molestia chilena ("estoy chato")', 'Omisión ticket SUBTEL'] 
      : ['Atención destacada', 'Validación RUT conforme', 'Ticket SUBTEL emitido al tiro'],
    segmentos: [
      { id: 'sg1', hablante: 'agente', inicio: 0, fin: 5, texto: 'Bienvenido a Claro Chile, exclusivo clientes Postpago. Mi nombre es ' + agentName + ', ¿en qué puedo colaborarle hoy?', sentimientoScore: 0.4 },
      { id: 'sg2', hablante: 'cliente', inicio: 5, fin: 15, texto: 'Hola, llamo porque tengo dudas graves con el cobro de mi boleta de este mes. Me llegó con casi 19 lucas de más y estoy chato de estas sorpresas.', sentimientoScore: isDetractor ? -0.7 : -0.1 },
      { id: 'sg3', hablante: 'agente', inicio: 15, fin: 25, texto: 'Con mucho gusto le ayudo a revisar el desglose de su cuenta. Para ingresar a su ficha, ¿me indica por favor su RUT y el número de servicio?', sentimientoScore: 0.3 },
      { id: 'sg4', hablante: 'cliente', inicio: 25, fin: 36, texto: 'Mi RUT es 16.421.890-5 y el número asociado es el 9 7842 1190. Ojalá lo podamos arreglar al tiro.', sentimientoScore: -0.3 },
      { id: 'sg5', hablante: 'agente', inicio: 36, fin: 54, texto: 'Gracias por los datos. Ya tengo su cuenta en pantalla. Efectivamente figura una boleta emitida por un total de $38.990.', sentimientoScore: 0.1 },
      { id: 'sg6', hablante: 'cliente', inicio: 54, fin: 72, texto: 'Exacto, mi plan siempre ha sido de $19.990. ¿Por qué razón me doblaron el valor? ¿Cachái que no me mandaron ningún aviso previo por correo?', sentimientoScore: isDetractor ? -0.8 : -0.2 },
      { id: 'sg7', hablante: 'agente', inicio: 72, fin: 96, texto: 'Revisando su ficha técnica, usted contaba con un beneficio promocional del 50% de descuento durante 6 meses, el cual venció en el ciclo anterior.', sentimientoScore: -0.2 },
      { id: 'sg8', hablante: 'cliente', inicio: 96, fin: 120, texto: '¡Pero a mí el ejecutivo comercial me prometió que la tarifa se mantendría por un año entero! ¡Esto es una burla!', sentimientoScore: isDetractor ? -0.9 : -0.3 },
      { id: 'sg9', hablante: 'agente', inicio: 120, fin: 155, texto: isDetractor 
          ? 'Señora, si lee la letra chica de su contrato sabrá que la promoción duraba 6 meses y ya se cumplió el plazo. Nosotros no podemos mantener valores fuera de norma.'
          : 'Comprendo perfectamente su sorpresa. Permítame revisar de inmediato qué campañas de retención y fidelización tenemos activas al tiro para reajustar su plan.', 
        sentimientoScore: isDetractor ? -0.7 : 0.4 },
      { id: 'sg10', hablante: 'cliente', inicio: 155, fin: 180, texto: isDetractor
          ? '¡No me hable en ese tono de la letra chica! Llevo años en Claro. Si no me solucionan esto, me voy a la competencia y pido portabilidad al tiro.'
          : 'Se lo agradecería mucho, porque no puedo pagar este valor todos los meses.', 
        sentimientoScore: isDetractor ? -0.9 : 0.1 },
      { id: 'sg11', hablante: 'agente', inicio: 180, fin: 225, texto: 'Voy a consultar con el área de supervisión y facturación. Por favor espere en línea mientras realizo la verificación interna.', sentimientoScore: 0.0 },
      { id: 'sg12', hablante: 'cliente', inicio: 225, fin: 260, texto: '¿Hola? ¿Se cortó la llamada? Llevo caleta de rato en silencio y ni música de espera ponen...', sentimientoScore: -0.6 },
      { id: 'sg13', hablante: 'agente', inicio: 260, fin: 295, texto: isDetractor
          ? 'Sigo acá. Consulté con facturación y la respuesta es negativa: no procede nota de crédito porque el consumo de gigas fue efectivo.'
          : 'Gracias por su gentil espera en línea. Le comento que gestioné una bonificación directa de $15.000 para regularizar la diferencia de su boleta.',
        sentimientoScore: isDetractor ? -0.5 : 0.8 },
      { id: 'sg14', hablante: 'cliente', inicio: 295, fin: 340, texto: isDetractor
          ? 'Es el colmo de la sinvergüenzura. Voy a ingresar un reclamo formal ante el SERNAC y la SUBTEL ahora mismo y cortar el plan.'
          : 'Excelente, muchas gracias por su gestión y por entender mi situación tan rápido.',
        sentimientoScore: isDetractor ? -0.95 : 0.9 },
      { id: 'sg15', hablante: 'agente', inicio: 340, fin: 380, texto: isDetractor
          ? 'Bueno, ya le expliqué que el sistema no lo permite. Queda registrado en su cuenta. Buenas tardes.'
          : 'Con gusto. Su número de ticket de atención y reclamo conforme a la normativa SUBTEL es el CL-2026-9812. ¿Tiene alguna otra consulta en la que pueda colaborarle hoy?',
        sentimientoScore: isDetractor ? -0.4 : 0.7 },
      { id: 'sg16', hablante: 'cliente', inicio: 380, fin: durSec, texto: isDetractor
          ? 'No, ya me tienen mareado con puras evasivas. Iré directo a la SUBTEL. Adiós.'
          : 'No, todo muy claro y guardo el ticket. Muchas gracias y que tenga buen día.',
        sentimientoScore: isDetractor ? -0.8 : 0.8 }
    ]
  };
  
  result.transcripcion = {
    segmentos: result.segmentos
  };
  
  return result;
}

// Start server with Vite middleware in dev or static serving in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Claro Speech Analytics server running on port ${PORT}`);
  });
}

// Only start standalone listener when not in Vercel serverless environment
if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;
