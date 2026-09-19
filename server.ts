import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

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
    supportedModels: ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'],
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

// ==========================================
// CALIBRATION & PROMPT GOVERNANCE ENGINE
// ==========================================

const DEFAULT_BASE_PROMPT = `Eres un tutor y auditor experto en Speech Analytics, Aseguramiento de la Calidad (QA) y Aceleración de Curva de Aprendizaje para Contact Centers de Claro en Chile.

CONTEXTO CRÍTICO DE OJT (ON-THE-JOB TRAINING / PISO DE ENTRENAMIENTO EN VIVO):
- ESTAS LLAMADAS SON DE ASESORES EN PROCESO DE OJT / NIDO ATENDIENDO A CLIENTES REALES EN PRODUCCIÓN EN VIVO.
- Los asesores enfrentan doble demanda operativa: atender con cortesía la rapidez y modismos de clientes chilenos reales mientras buscan procedimientos en los sistemas corporativos (Somos Clave, CRM) o consultan a su tutor de piso.
- Tu misión no es punitiva, sino FORMATIVA Y DE ACELERACIÓN:
  * Diferencia los errores actitudinales (graves) de las vacilaciones o pausas por consulta/búsqueda en aplicativos (oportunidades pedagógicas).
  * En 'diagnostico_ojt', entrega un diagnóstico que le sirva al supervisor/formador de piso:
    - 'nivel_madurez': 'EN_REFUERZO' (requiere acompañamiento continuo), 'EN_DESARROLLO' (resuelve pero con dudas de procedimiento), o 'LISTO_PRODUCCION' (autónomo y seguro).
    - 'indice_autonomia': número de 0 a 100% que estima su grado de independencia.
    - 'brecha_principal': 'PROCEDIMIENTO_GUION' | 'HERRAMIENTA_SISTEMAS' | 'HABILIDADES_BLANDAS' | 'NINGUNA_DOMINIO'.
    - 'requiere_intervencion_tutor': boolean si amerita feedback inmediato en piso.
    - 'roleplay_sugerido': una simulación práctica de 5 minutos específica que el tutor de piso debe realizar con el asesor.
    - 'feedback_pedagogico': feedback positivo y motivacional que impulse su aprendizaje.
    - 'observacion_piso_real': diagnóstico de cómo lidió con el cliente chileno real.

CALIBRACIÓN tNPS AMIGABLE, EQUILIBRADA Y JUSTA:
- El tNPS predicho debe ser constructivo, equilibrado y fiel a la satisfacción real del cliente Claro.
- REGLAS OBLIGATORIAS DE CALIBRACIÓN tNPS:
  1. REGLA DE ORO PROMOTORES (9-10): Si la atención fue de calidad alta o sobresaliente (QA Score >= 80%), el problema fue resuelto o gestionado correctamente, y el cliente finaliza satisfecho, tranquilo, o agradeciendo ("gracias", "muy amable", "se pasó", "impecable"), el tNPS global DEBE ser clasificado OBLIGATORIAMENTE como 'PROMOTOR' con nota 9 o 10. ¡Nunca dejes en Neutro una llamada con buen servicio y resolución positiva!
  2. Desacopla la marca del asesor: Si el cliente empezó molesto por un cobro o falla de Claro, pero el asesor novel fue paciente, empático y resolutivo, califica su esfuerzo humano en 'score_agente' (0-10) y explícalo en 'factor_marca_vs_agente'.
  3. Sensibilidad al cierre real: Si el cliente finalizó conforme o agradeciendo la atención, el tNPS global DEBE situarse en PROMOTOR (9-10) o excepcionalmente NEUTRO (7-8) solo si el trámite requiere espera técnica prolongada. ¡Bajo ninguna circunstancia clasifiques a un cliente conforme o agradecido como DETRACTOR!
  4. Zona constructiva en OJT (Neutros 7-8): Un Neutro (7-8) es un "Casi Promotor" donde la gestión quedó inconclusa o el cliente se mostró apático. Explica en 'camino_a_promotor' qué detalle puntual lo convertiría en 9 o 10.
  5. Reserva DETRACTOR (0-6) únicamente cuando hubo un quiebre grave originado directamente por el asesor (maltrato, tono cortante, colgar intencionalmente, desinformación o abandono) o un reclamo no resuelto con frustración explícita.
  6. El campo 'clasificacion' DEBE ser exactamente uno de estos tres valores en mayúsculas: 'PROMOTOR', 'NEUTRO' o 'DETRACTOR'.

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

PAUTA OFICIAL DE ATENCIÓN INSTITUCIONAL CLARO CHILE (4 FASES):
Evalúa rigurosamente el desempeño del asesor según la matriz de 4 fases operativas:

FASE 1: BIENVENIDA
1. Generar experiencia positiva desde el primer contacto: Tono cordial, empático y predispuesto al servicio.
2. Mencionar el nombre de la empresa y dar la bienvenida a Claro.
3. Mencionar OBLIGATORIAMENTE su PRIMER NOMBRE y PRIMER APELLIDO (ej: "Mi nombre es Carlos Muñoz". Si solo menciona su nombre de pila sin apellido, marcar false).
4. Confirmar el nombre de la persona con quien se habla, validando número de celular a consultar o RUT en caso amerite.

FASE 2: ENTENDER Y RESOLVER EL REQUERIMIENTO DEL CLIENTE
1. Parafrasear el problema del cliente: Demostrar comprensión activa reformulando con sus propias palabras la necesidad planteada.
2. Ordenar múltiples requerimientos: Si el cliente expone más de una consulta, organizarlas metódicamente y atender cada una.
3. Utilizar sistemas oficiales y procedimientos publicados en Somos Clave.
4. Cortesía procedimental: Pedir "por favor" y "agradecer" al cliente al requerir datos, documentos o instrucciones.
5. Validación de identidad: Realizar las preguntas de seguridad o verificación de titularidad por RUT según corresponda.

FASE 3: INFORMAR ACCIÓN AL CLIENTE
1. Indicar al cliente qué gestión específica se está realizando al pedir un momento en espera (hold).
2. Retomar la llamada en MENOS DE UN MINUTO para mantener comunicación constante, sin dejar silencios prolongados.
3. Claridad en condiciones comerciales: Explicar con precisión cambios de plan, costos, proporcionales, descuentos, promociones y su vigencia exacta.
4. Resumen de atención: Realizar un breve resumen de toda la gestión efectuada al terminar la explicación de la consulta.

FASE 4: CIERRE
1. Preguntas de aseguramiento: Realizar preguntas de confirmación explícita:
   * "¿Tiene alguna otra consulta adicional?"
   * "¿Quedó clara la información brindada?"
   * "¿Le puedo ayudar en algo más?"
2. Esperar confirmación activa por parte del cliente antes de avanzar.
3. Protocolo normativo de finalización y encuesta (Escala 0 al 10):
   * Indicar que eventualmente podría recibir por Mail o SMS una encuesta de atención.
   * Explicar explícitamente la escala de notas: "con una escala de 0 a 10, donde 0 representa la nota más baja y 10 la más alta".
   * Agradecer su colaboración resaltando la importancia de su opinión.

En 'cumplimiento_guion.fases', evalúa cada booleano fielmente. En 'porcentaje_total' calcula el porcentaje de 0 a 100 de ítems cumplidos. En 'observaciones_auditoria' describe detalladamente cualquier omisión o cumplimiento destacado.

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
3. Pronóstico de NPS con la pregunta oficial: "¿Qué tan probable es que recomiendes Claro a un amigo o familiar? Considerando una escala de 0 a 10, donde 0 es 'Nada probable' y 10 es 'Muy probable'".
4. Tiempo de Silencio Conversacional: Evalúa el silencio considerando ÚNICAMENTE desde que le ingresa la llamada al agente y puede interactuar, separándolo del IVR previo.
5. Plan de coaching y feedback accionable para el asesor, incluyendo guion sugerido alternativo y plan de acción.`;

const DEFAULT_CUSTOM_DIRECTIVES = `# DIRECTIVAS ADICIONALES DE CALIBRACIÓN ACTIVA (OPERACIÓN CLARO CHILE)
# Estas directivas tienen prioridad y adaptan el juicio del motor de IA para la operación diaria.

1. TOLERANCIA A PAUSAS EN SISTEMAS INTERNOS (SOMOS CLAVE / CRM):
- Si el asesor pide tiempo para validar en el sistema ("Permítame un momento mientras abro el sistema", "Deme un instante en línea"), no penalizar la nota de tiempos de espera si retoma el contacto dentro de 60 segundos.
- Considerar estas pausas como oportunidad formativa de agilidad, nunca como desidia o negligencia.

2. ATENCIÓN DE CLIENTES DETRACTORES POR COBROS O CAÍDA DE SEÑAL:
- Si el cliente ingresa enfurecido por fallas de facturación o caída masiva de red, evaluar el 'score_agente' independientemente de la queja hacia Claro. Si el asesor mantuvo la calma y empatizó, su nota de amabilidad debe ser >= 85.

3. REGLA DE CIERRE Y ENCUESTA DE SERVICIO:
- Si el cliente apura la despedida diciendo "muchas gracias, que esté bien" e interrumpe antes de que el asesor termine de explicar la escala 0-10, calificar 'cierre.esperar_confirmacion_cliente' como cumplido y no castigar severamente el cumplimiento global.`;

const DEFAULT_SENSITIVITY_SETTINGS = {
  silenceToleranceSeconds: 30,
  detractorStrictness: 'equilibrada' as 'flexible' | 'equilibrada' | 'estricta',
  chileanSlangTolerance: true,
  ojtPedagogicalFocus: true,
};

const CALIBRATION_FILE = path.join(process.cwd(), 'calibration.json');

function loadCalibration(): {
  customDirectives: string;
  sensitivitySettings: typeof DEFAULT_SENSITIVITY_SETTINGS;
  version: string;
  updatedAt: string;
} {
  try {
    if (fs.existsSync(CALIBRATION_FILE)) {
      const raw = fs.readFileSync(CALIBRATION_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return {
        customDirectives: typeof data.customDirectives === 'string' ? data.customDirectives : DEFAULT_CUSTOM_DIRECTIVES,
        sensitivitySettings: {
          silenceToleranceSeconds: data.sensitivitySettings?.silenceToleranceSeconds ?? DEFAULT_SENSITIVITY_SETTINGS.silenceToleranceSeconds,
          detractorStrictness: data.sensitivitySettings?.detractorStrictness ?? DEFAULT_SENSITIVITY_SETTINGS.detractorStrictness,
          chileanSlangTolerance: data.sensitivitySettings?.chileanSlangTolerance ?? DEFAULT_SENSITIVITY_SETTINGS.chileanSlangTolerance,
          ojtPedagogicalFocus: data.sensitivitySettings?.ojtPedagogicalFocus ?? DEFAULT_SENSITIVITY_SETTINGS.ojtPedagogicalFocus,
        },
        version: data.version || 'v1.3.0',
        updatedAt: data.updatedAt || new Date().toISOString()
      };
    }
  } catch (err) {
    console.warn('[Calibration] Error al leer calibration.json, usando valores por defecto:', err);
  }
  return {
    customDirectives: DEFAULT_CUSTOM_DIRECTIVES,
    sensitivitySettings: { ...DEFAULT_SENSITIVITY_SETTINGS },
    version: 'v1.3.0',
    updatedAt: new Date().toISOString()
  };
}

let activeCalibration = loadCalibration();

function saveCalibration(customDirectives: string, sensitivitySettings: typeof DEFAULT_SENSITIVITY_SETTINGS) {
  activeCalibration = {
    customDirectives,
    sensitivitySettings,
    version: 'v1.3.0',
    updatedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(activeCalibration, null, 2), 'utf-8');
    console.log('[Calibration] Configuración guardada en calibration.json');
  } catch (err) {
    console.error('[Calibration] Error guardando calibration.json:', err);
  }
}

function getActiveFullPrompt(): string {
  let prompt = DEFAULT_BASE_PROMPT;

  if (activeCalibration.customDirectives && activeCalibration.customDirectives.trim()) {
    prompt += `\n\n--- DIRECTIVAS ADICIONALES DE CALIBRACIÓN ACTIVA (CONFIGURADAS POR EL AUDITOR) ---\n${activeCalibration.customDirectives.trim()}`;
  }

  if (activeCalibration.sensitivitySettings) {
    const s = activeCalibration.sensitivitySettings;
    prompt += `\n\n--- PARÁMETROS OPERATIVOS DE SENSIBILIDAD DINÁMICA ---
- Tolerancia máxima a silencios/pausas operativas sin hold formal: ${s.silenceToleranceSeconds} segundos.
- Rigor en clasificación de Detractores tNPS: ${s.detractorStrictness.toUpperCase()}.
- Tolerancia a modismos locales y modulación chilena: ${s.chileanSlangTolerance ? 'ALTA (no penalizar modismos propios del país)' : 'ESTRICTA'}.
- Enfoque pedagógico OJT para tutor de piso: ${s.ojtPedagogicalFocus ? 'PRIORITARIO (priorizar feedback formativo constructivo)' : 'ESTÁNDAR'}.`;
  }

  return prompt;
}

// Simulated QA Consultant when no Gemini API key is configured
function generateSimulatedConsultantReply(question: string, currentDirectives: string, ragContext?: any) {
  const q = question.toLowerCase();

  // 1. General call quality improvement / coaching / OJT development
  if (
    q.includes('mejoro la calidad') ||
    q.includes('mejorar la calidad') ||
    q.includes('subir nota') ||
    q.includes('capacit') ||
    q.includes('coaching') ||
    q.includes('como mejorar') ||
    q.includes('cómo mejorar') ||
    q.includes('buenas practicas') ||
    q.includes('buenas prácticas') ||
    q.includes('estrategia de calidad')
  ) {
    const statsText = ragContext?.totalCalls
      ? `\n\n📊 **Diagnóstico según nuestra base de datos activa (${ragContext.totalCalls} llamadas analizadas):**\n- **Puntuación promedio de calidad:** ${ragContext.avgScore || 78}/100\n- **Distribución tNPS:** ${ragContext.detractorsPct || 25}% Detractores | ${ragContext.promotersPct || 45}% Promotores\n- **Brechas operativas detectadas:** ${ragContext.topQuiebres || 'Pausas en sistemas sin hold, validación de RUT y omisión de escala en encuesta'}`
      : '';

    return {
      reply: `¡Excelente consulta! Para mejorar de forma integral la calidad de las llamadas en la operación de Claro Chile / GEA Perú, debes trabajar en 4 pilares fundamentales:${statsText}

### 1. Dominio del Protocolo de 4 Fases (Pauta Oficial):
* **Fase 1 - Bienvenida Impecable:** Saludar mencionando nombre, apellido y empresa (*"Claro Chile, le habla [Nombre], ¿con quién tengo el gusto?"*). Confirmar la titularidad por RUT al tiro.
* **Fase 2 - Escucha Activa & Parafraseo:** Antes de abrir sistemas, resumir la duda del cliente (*"Entiendo perfectamente, don Juan, usted necesita revisar el detalle del cobro de su última boleta"*). Esto baja la ansiedad del cliente en un 40%.
* **Fase 3 - Gestión Transparente de Esperas:** Nunca dejar al cliente en silencio muerto. Avisar siempre: *"Voy a verificar en Somos Clave, permítame 30 segundos en línea"*, y retomar el contacto antes del minuto.
* **Fase 4 - Aseguramiento y Encuesta 0 a 10:** No cortar abruptamente. Preguntar *"¿Pude resolver todas sus dudas?"* y explicar la escala de encuesta formal: *"don Juan, podría recibir una encuesta donde 0 es la nota más baja y 10 la máxima"*.

### 2. Aceleración Formativa en OJT (Piso de Entrenamiento):
* **Micro-Roleplays de 5 minutos:** Practicar con los tutores antes del turno las 3 objeciones más duras de clientes chilenos (cobros no reconocidos, corte de fibra y bloqueo de IMEI).
* **Foco en Feedback Pedagógico:** Corregir una sola conducta crítica por sesión en lugar de abrumar al asesor con toda la pauta.

### 3. Reducción de Quiebres y Detractores:
* Separar la molestia hacia la marca del trato humano. Aunque el cliente venga indignado, si el asesor mantiene la calma, empatiza y da alternativas claras, el tNPS sube a Neutro/Promotor.

💡 *Si deseas que el motor de IA sea más formativo o flexibilice algún criterio específico en las evaluaciones, puedes calibrarlo directamente con una regla de excepción.*`,
      suggestedDirective: undefined
    };
  }

  // 2. Questions about system data / RAG statistics
  if (q.includes('datos') || q.includes('estadistica') || q.includes('estadística') || q.includes('como vamos') || q.includes('cómo vamos') || q.includes('resumen')) {
    if (ragContext?.totalCalls) {
      return {
        reply: `📈 **Resumen Ejecutivo de Speech Analytics (RAG en Vivo):**\n\n- **Volumen Total:** ${ragContext.totalCalls} llamadas evaluadas en la plataforma.\n- **Nota Media Operativa:** ${ragContext.avgScore || 78}/100 en QA Global.\n- **Clasificación tNPS:** ${ragContext.promotersPct || 40}% Promotores, ${ragContext.neutralsPct || 35}% Neutros y ${ragContext.detractorsPct || 25}% Detractores.\n- **Fases con mayor oportunidad:** Cierre y encuesta de satisfacción (omisión recurrente de la escala 0-10) y retención en hold prolongado durante consultas en Somos Clave.\n- **Estado OJT Asesores:** Asesores en curva de aprendizaje requieren refuerzo en habilidades blandas y empatía ante reclamos de boleta.\n\n¿Deseas profundizar en algún asesor específico o calibrar un umbral de evaluación?`,
        suggestedDirective: undefined
      };
    }
  }

  // 3. Specific calibration topics
  if (q.includes('silencio') || q.includes('pausa') || q.includes('hold') || q.includes('espera')) {
    return {
      reply: `Para calibrar la detección de silencios en piso OJT, es fundamental distinguir entre **dead air por desconexión** y **pausas legítimas de navegación en Somos Clave / CRM**.\n\nEn llamadas de asesores noveles, los tiempos de consulta suelen rondar entre 20 y 45 segundos mientras buscan los procedimientos corporativos. Para evitar que la IA castigue injustamente el indicador de eficiencia TMO o tiempos de espera, te recomiendo agregar la siguiente directiva al prompt:`,
      suggestedDirective: `- Tolerancia en Búsqueda de Sistemas: Si el asesor anuncia al cliente que está verificando en Somos Clave o en el CRM, no clasificar las pausas de hasta 45 segundos como silencio crítico o quiebre de atención.`
    };
  }

  if (q.includes('detractor') || q.includes('nps') || q.includes('molest') || q.includes('enojad') || q.includes('reclamo') || q.includes('boleta') || q.includes('cobro')) {
    return {
      reply: `En los contact centers de Claro Chile, los clientes a menudo se comunican molestos por cobros en su boleta o problemas de facturación. La IA tiende a veces a calificar la llamada como DETRACTOR (0-6) basándose únicamente en el malestar del cliente hacia la empresa, descuidando el esfuerzo y empatía del asesor.\n\nPara evitar que se marque detractor injusto en quejas de boleta Claro y proteger la calificación del asesor, te recomiendo incorporar esta directiva oficial:`,
      suggestedDirective: `- Blindaje tNPS en Reclamos de Boleta: Cuando el cliente manifieste hostilidad o frustración con la facturación o cobros de Claro, pero el asesor explique los ítems con calma, valide su reclamo y ofrezca alternativas cordialmente, priorizar score_agente >= 8.5 y clasificar el pronóstico global en NEUTRO (7-8), sin penalizar la evaluación del asesor.`
    };
  }

  if (q.includes('saludo') || q.includes('bienvenida') || q.includes('nombre') || q.includes('apellido') || q.includes('interrump')) {
    return {
      reply: `En el contexto chileno, es muy común que los clientes con urgencia comiencen a explicar su problema de inmediato ("Hola, mire sabe que se me cortó la línea"), impidiendo que el asesor recite completo su nombre, apellido y bienvenida institucional.\n\nPara que la IA no marque la Fase 1 como incumplida en estos escenarios, te sugiero esta directiva de calibración:`,
      suggestedDirective: `- Flexibilidad en Bienvenida por Interrupción: Si el cliente interrumpe el saludo inicial explicando de golpe su requerimiento, considerar la bienvenida como cumplida si el asesor se presentó al menos con su nombre y retomó cordialmente el protocolo.`
    };
  }

  if (q.includes('rut') || q.includes('seguridad') || q.includes('titular') || q.includes('identidad')) {
    return {
      reply: `La validación de titularidad por RUT es una exigencia legal y de seguridad de Claro Chile. Si deseas calibrar una exigencia más rigurosa para evitar fraudes y asegurar el cumplimiento de la política de protección de datos:`,
      suggestedDirective: `- Validación Obligatoria de RUT y Titularidad: Exigir de manera obligatoria que el asesor verifique el RUT completo y al menos un dato secundario de validación antes de entregar información de saldos o tráfico. Si no se realiza, marcar quiebre de atención de severidad ALTO.`
    };
  }

  if (q.includes('cierre') || q.includes('encuesta') || q.includes('escala') || q.includes('0 a 10') || q.includes('sms')) {
    return {
      reply: `La pauta de Claro exige explicar la encuesta con la escala del 0 al 10. Sin embargo, en llamadas rápidas el cliente a veces cuelga abruptamente. Esta directiva calibra el criterio:`,
      suggestedDirective: `- Transferencia o Explicación de Encuesta: Si el asesor menciona la encuesta de satisfacción por SMS o llamada pero el cliente finaliza la llamada antes de escuchar la escala 0-10, calificar el protocolo de cierre como PARCIALMENTE CUMPLIDO (80%) sin considerarlo quiebre de servicio.`
    };
  }

  return {
    reply: `Entendido tu planteamiento sobre la operación de Claro Chile / GEA Perú. Como consultor de Speech Analytics y aseguramiento de calidad, puedo ayudarte tanto a diagnosticar el desempeño de tus asesores como a ajustar las reglas del motor de IA.\n\nPara profundizar, ¿deseas que revisemos técnicas pedagógicas para los asesores, analicemos las llamadas del sistema o prefieres formular una regla de calibración para el modelo?`,
    suggestedDirective: undefined
  };
}

// Calibration API Endpoints
app.get('/api/calibration', (req, res) => {
  res.json({
    success: true,
    data: {
      basePrompt: DEFAULT_BASE_PROMPT,
      customDirectives: activeCalibration.customDirectives,
      sensitivitySettings: activeCalibration.sensitivitySettings,
      version: activeCalibration.version,
      updatedAt: activeCalibration.updatedAt
    }
  });
});

app.post('/api/calibration', (req, res) => {
  try {
    const { customDirectives, sensitivitySettings } = req.body;
    if (typeof customDirectives !== 'string') {
      return res.status(400).json({ success: false, error: 'customDirectives debe ser un string' });
    }
    const mergedSettings = {
      ...activeCalibration.sensitivitySettings,
      ...(sensitivitySettings || {})
    };
    saveCalibration(customDirectives, mergedSettings);
    res.json({
      success: true,
      message: 'Directivas de calibración guardadas y activas en el motor de IA.',
      data: {
        basePrompt: DEFAULT_BASE_PROMPT,
        customDirectives: activeCalibration.customDirectives,
        sensitivitySettings: activeCalibration.sensitivitySettings,
        version: activeCalibration.version,
        updatedAt: activeCalibration.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error al guardar calibración' });
  }
});

app.post('/api/calibration/reset', (req, res) => {
  try {
    saveCalibration(DEFAULT_CUSTOM_DIRECTIVES, { ...DEFAULT_SENSITIVITY_SETTINGS });
    res.json({
      success: true,
      message: 'Calibración restablecida a los valores oficiales de fábrica.',
      data: {
        basePrompt: DEFAULT_BASE_PROMPT,
        customDirectives: activeCalibration.customDirectives,
        sensitivitySettings: activeCalibration.sensitivitySettings,
        version: activeCalibration.version,
        updatedAt: activeCalibration.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Error al restablecer calibración' });
  }
});

app.post('/api/calibration/chat', async (req, res) => {
  try {
    const { message, history = [], customDirectives, ragContext } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Mensaje requerido' });
    }

    const currentDirectivesToUse = typeof customDirectives === 'string' 
      ? customDirectives 
      : activeCalibration.customDirectives;

    let ragSection = '';
    if (ragContext && typeof ragContext === 'object') {
      ragSection = `
CONTEXTO OPERATIVO EN VIVO (RAG DE LLAMADAS REALES DEL SISTEMA):
- Volumen total de llamadas auditadas en plataforma: ${ragContext.totalCalls || 'N/D'}
- Calificación QA Promedio actual: ${ragContext.avgScore || 'N/D'}/100
- Pronóstico tNPS: ${ragContext.promotersPct || 0}% Promotores, ${ragContext.neutralsPct || 0}% Neutros, ${ragContext.detractorsPct || 0}% Detractores
- Quiebres operativos más recurrentes: ${ragContext.topQuiebres || 'Pausas prolongadas en Somos Clave, omisión de escala 0-10 en encuesta, validación de RUT'}
- Motivos de llamadas frecuentes: ${ragContext.commonDrivers || 'Reclamos de cobro en boleta, problemas técnicos de fibra/red, cambio de plan'}
- Estado de madurez de asesores en OJT: ${ragContext.ojtSummary || 'Asesores en entrenamiento en vivo con soporte de tutores de piso'}`;
    }

    const systemInstruction = `Eres el Consultor Senior de Speech Analytics, Calidad Operativa y Coaching (QA & OJT) para GEA Perú / Claro Chile.
Cuentas con la capacidad analítica y los billones de parámetros de un modelo de lenguaje de última generación, y además estás enterado de la información operativa en tiempo real mediante RAG.
${ragSection}

PAUTA BASE OFICIAL CLARO CHILE:
- 4 Fases operativas:
  1. Bienvenida (nombre, apellido, empresa Claro, confirmación cliente/RUT).
  2. Entender y Resolver (parafrasear, sistemas Somos Clave, por favor/gracias, validación de identidad).
  3. Informar Acción (avisar espera/hold, retomar en <1 min, claridad en condiciones comerciales y valores proporcionales, resumen).
  4. Cierre (preguntas aseguramiento, confirmación activa, protocolo de encuesta en escala explicada de 0 a 10).
- Diagnóstico OJT: Madurez (EN_REFUERZO, EN_DESARROLLO, LISTO_PRODUCCION), índice de autonomía %, brecha principal, roleplay de 5 min y feedback pedagógico constructivo.
- Predicción tNPS Amigable: Desacoplar la molestia hacia la marca del trato humano del asesor novel (score_agente).
- Detección de alertas: SERNAC, SUBTEL, demandas, fuga a Entel/WOM/Movistar.
- Contexto cultural chileno: Modismos (boleta, RUT, al tiro, cachái, chato, caleta).

DIRECTIVAS ADICIONALES ACTUALMENTE ACTIVAS:
${currentDirectivesToUse}

DIRECTIVAS Y DIRECTRICES DE RESPUESTA:
1. NO te limites únicamente a crear directivas técnicas. Puedes y debes responder CUALQUIER consulta del usuario sobre: cómo mejorar la calidad de las llamadas, cómo capacitar asesores noveles, cómo dar retroalimentación constructiva, análisis de tendencias y causas raíz de llamadas, interpretación de métricas de Speech Analytics, etc.
2. Utiliza tu vasto conocimiento y el contexto RAG de las llamadas reales para ofrecer explicaciones detalladas, pedagógicas, prácticas y ejecutivas.
3. Si el usuario te pide específicamente calibrar el modelo, modificar una regla de evaluación, O si de tu respuesta se deriva una recomendación concreta para ajustar el prompt de la IA, proporciónala al final dentro de un bloque \`\`\`directive:
\`\`\`directive
- [Nombre de la Regla]: [Texto conciso y claro de la directiva lista para incorporar en el motor]
\`\`\`
De esta forma, la interfaz habilitará automáticamente un botón para incorporar la directiva con un solo clic.
4. Mantén un tono profesional, motivador, empático y orientado a la excelencia operativa.`;

    const groqKey = process.env.GROQ_API_KEY;
    const ai = getGenAI();

    // If Gemini is not set but Groq is available, use Groq
    if (!ai && groqKey) {
      try {
        const groqMessages = [
          { role: 'system', content: systemInstruction },
          ...(Array.isArray(history) ? history.map((h: any) => ({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.text || ''
          })) : []),
          { role: 'user', content: message }
        ];

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: groqMessages,
            temperature: 0.4,
            max_tokens: 1500
          })
        });

        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const replyText = groqData.choices?.[0]?.message?.content?.trim();
          if (replyText) {
            const directiveMatch = replyText.match(/```(?:directive)?\s*([\s\S]*?)```/i);
            const suggestedDirective = directiveMatch ? directiveMatch[1].trim() : undefined;
            return res.json({
              success: true,
              reply: replyText,
              suggestedDirective,
              meta: { modelUsed: 'Groq LLaMA 3.3 70B (RAG)' }
            });
          }
        }
      } catch (groqErr) {
        console.warn('[Server Calibration Chat] Groq error:', groqErr);
      }
    }

    // Fallback if no Gemini API Key is configured in environment
    if (!ai) {
      const simulated = generateSimulatedConsultantReply(message, currentDirectivesToUse, ragContext);
      return res.json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: {
          engine: 'Consultor Experto Local con RAG (Configura GEMINI_API_KEY o GROQ_API_KEY para motor en vivo)'
        }
      });
    }

    // Format and normalize chat history strictly for Gemini
    // 1. Must start with role: 'user'
    // 2. Roles must strictly alternate: user -> model -> user -> model
    // 3. Last turn must be the current user message
    const validHistory: Array<{ role: 'user' | 'model'; text: string }> = [];
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string' && h.text.trim()) {
          validHistory.push({ role: h.role, text: h.text.trim() });
        }
      }
    }

    // Drop leading 'model' turns so contents strictly starts with 'user'
    while (validHistory.length > 0 && validHistory[0].role === 'model') {
      validHistory.shift();
    }

    // Build alternating contents
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const item of validHistory) {
      if (contents.length === 0) {
        if (item.role === 'user') {
          contents.push({ role: 'user', parts: [{ text: item.text }] });
        }
      } else {
        const lastTurn = contents[contents.length - 1];
        if (lastTurn.role === item.role) {
          lastTurn.parts[0].text += `\n\n${item.text}`;
        } else {
          contents.push({ role: item.role, parts: [{ text: item.text }] });
        }
      }
    }

    // Append current user message
    if (contents.length === 0 || contents[contents.length - 1].role === 'model') {
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });
    } else {
      contents[contents.length - 1].parts[0].text += `\n\n${message}`;
    }

    let rawReply = '';
    let modelUsed = '';
    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'];
    let lastModelError: any = null;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            temperature: 0.3,
            maxOutputTokens: 2048,
          }
        });
        const replyText = response.text?.trim();
        if (replyText) {
          rawReply = replyText;
          modelUsed = modelName;
          break;
        }
      } catch (err: any) {
        lastModelError = err;
        console.warn(`[Consultor Calibración] Fallo con ${modelName}:`, err?.message || err);
      }
    }

    // If all models failed or encountered quota/network limits, provide expert response
    if (!rawReply) {
      console.warn('[Consultor Calibración] Activando generador experto de respaldo:', lastModelError?.message);
      const simulated = generateSimulatedConsultantReply(message, currentDirectivesToUse, ragContext);
      return res.json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: {
          engine: 'Consultor Experto Claro Chile (Modo Seguro con RAG)',
          notice: lastModelError?.message || 'Activado por resiliencia'
        }
      });
    }
    
    // Extract directive block if present
    const directiveMatch = rawReply.match(/```(?:directive)?\s*([\s\S]*?)```/i);
    const suggestedDirective = directiveMatch ? directiveMatch[1].trim() : undefined;

    res.json({
      success: true,
      reply: rawReply,
      suggestedDirective,
      meta: {
        modelUsed
      }
    });

  } catch (err: any) {
    console.error('Error en /api/calibration/chat:', err);
    const simulated = generateSimulatedConsultantReply(
      req.body?.message || '', 
      activeCalibration.customDirectives
    );
    res.json({
      success: true,
      reply: simulated.reply,
      suggestedDirective: simulated.suggestedDirective,
      meta: {
        fallback: true,
        error: err?.message
      }
    });
  }
});

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
        fases: {
          type: Type.OBJECT,
          properties: {
            bienvenida: {
              type: Type.OBJECT,
              properties: {
                generar_experiencia_positiva: { type: Type.BOOLEAN, description: 'Generar experiencia positiva desde el primer contacto' },
                mencionar_empresa_claro: { type: Type.BOOLEAN, description: 'Mencionar el nombre de la empresa y dar la bienvenida a Claro' },
                mencionar_nombre_apellido: { type: Type.BOOLEAN, description: 'Mencionar primer nombre y primer apellido del asesor' },
                confirmar_nombre_cliente_rut_celular: { type: Type.BOOLEAN, description: 'Confirmar nombre del cliente con quien se habla, validando celular o RUT en caso amerite' }
              },
              required: ['generar_experiencia_positiva', 'mencionar_empresa_claro', 'mencionar_nombre_apellido', 'confirmar_nombre_cliente_rut_celular']
            },
            entender_resolver: {
              type: Type.OBJECT,
              properties: {
                parafrasear_problema: { type: Type.BOOLEAN, description: 'Asegurarse de entender el problema del cliente parafraseando lo que comenta' },
                ordenar_multiples_requerimientos: { type: Type.BOOLEAN, description: 'Si el cliente tiene más de una necesidad, ordenar los requerimientos y hacerse cargo de cada uno' },
                utilizar_sistemas_oficiales_somos_clave: { type: Type.BOOLEAN, description: 'Utilizar sistemas oficiales y procedimientos publicados en Somos Clave' },
                cortesia_por_favor_gracias: { type: Type.BOOLEAN, description: 'Pedir por favor y agradecer al cliente cuando necesitamos que ejecute una instrucción o entregue información' },
                validacion_identidad: { type: Type.BOOLEAN, description: 'Si el procedimiento lo indica, realizar la validación de identidad' }
              },
              required: ['parafrasear_problema', 'ordenar_multiples_requerimientos', 'utilizar_sistemas_oficiales_somos_clave', 'cortesia_por_favor_gracias', 'validacion_identidad']
            },
            informar_accion: {
              type: Type.OBJECT,
              properties: {
                indicar_gestion_espera: { type: Type.BOOLEAN, description: 'Indicar al cliente qué gestión se está realizando al pedir momento en espera' },
                retomar_en_menos_de_un_minuto: { type: Type.BOOLEAN, description: 'Retomar la llamada en menos de un minuto para mantener la comunicación, sin dejar silencios prolongados' },
                claridad_condiciones_comerciales: { type: Type.BOOLEAN, description: 'Ser claro y específico en informar cambios en condiciones comerciales: costos, proporcionales, descuentos y promociones con vigencia' },
                resumen_atencion_gestion: { type: Type.BOOLEAN, description: 'Hacer un breve resumen de toda la atención y gestión realizada al terminar la explicación' }
              },
              required: ['indicar_gestion_espera', 'retomar_en_menos_de_un_minuto', 'claridad_condiciones_comerciales', 'resumen_atencion_gestion']
            },
            cierre: {
              type: Type.OBJECT,
              properties: {
                preguntas_aseguramiento: { type: Type.BOOLEAN, description: 'Realizar preguntas de aseguramiento: alguna otra consulta, quedó clara la info, le puedo ayudar en algo más' },
                esperar_confirmacion_cliente: { type: Type.BOOLEAN, description: 'Esperar la confirmación activa de parte del cliente antes de cerrar' },
                guion_encuesta_escala_0_a_10: { type: Type.BOOLEAN, description: 'Mencionar guion de encuesta evaluando atención por mail o SMS en escala de 0 (más baja) a 10 (más alta) y agradecer' }
              },
              required: ['preguntas_aseguramiento', 'esperar_confirmacion_cliente', 'guion_encuesta_escala_0_a_10']
            }
          },
          required: ['bienvenida', 'entender_resolver', 'informar_accion', 'cierre']
        },
        porcentaje_total: { type: Type.NUMBER, description: 'Porcentaje global de cumplimiento del guion de 0 a 100' },
        observaciones_auditoria: { type: Type.STRING, description: 'Resumen o diagnóstico de cumplimiento de la pauta' },
        saludo_institucional: { type: Type.BOOLEAN },
        verificacion_identidad: { type: Type.BOOLEAN },
        escucha_activa: { type: Type.BOOLEAN },
        entrega_ticket_subtel: { type: Type.BOOLEAN },
        despedida_cordial: { type: Type.BOOLEAN }
      },
      required: ['fases', 'porcentaje_total', 'saludo_institucional', 'verificacion_identidad', 'escucha_activa', 'entrega_ticket_subtel', 'despedida_cordial']
    },
    nps_pronostico: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.NUMBER, description: 'Puntaje predicho tNPS de 0 a 10 equilibrado y realista' },
        score_agente: { type: Type.NUMBER, description: 'Puntuación 0 a 10 evaluando únicamente el trato humano, empatía y esfuerzo del asesor novel en OJT' },
        clasificacion: { type: Type.STRING, description: 'DETRACTOR (0-6) | NEUTRO (7-8) | PROMOTOR (9-10)' },
        pregunta: { type: Type.STRING, description: 'Pregunta oficial: ¿Qué tan probable es que recomiendes Claro a un amigo o familiar?' },
        justificacion: { type: Type.STRING, description: 'Explicación del pronóstico NPS' },
        factor_marca_vs_agente: { type: Type.STRING, description: 'Diferenciación entre molestia de fondo con Claro (marca/cobros) vs satisfacción con el trato del asesor' },
        camino_a_promotor: { type: Type.STRING, description: 'Ajuste específico en OJT para llevar este cliente a Promotor (9-10)' }
      },
      required: ['score', 'clasificacion', 'justificacion', 'score_agente', 'factor_marca_vs_agente', 'camino_a_promotor']
    },
    diagnostico_ojt: {
      type: Type.OBJECT,
      properties: {
        nivel_madurez: { type: Type.STRING, description: 'EN_REFUERZO | EN_DESARROLLO | LISTO_PRODUCCION' },
        indice_autonomia: { type: Type.NUMBER, description: 'Porcentaje de autonomía 0 a 100 respecto al tutor de piso' },
        brecha_principal: { type: Type.STRING, description: 'PROCEDIMIENTO_GUION | HERRAMIENTA_SISTEMAS | HABILIDADES_BLANDAS | NINGUNA_DOMINIO' },
        requiere_intervencion_tutor: { type: Type.BOOLEAN, description: 'Si el tutor de piso debe intervenir o realizar refuerzo inmediato' },
        roleplay_sugerido: { type: Type.STRING, description: 'Roleplay o simulación de 5 minutos sugerida para el tutor OJT' },
        feedback_pedagogico: { type: Type.STRING, description: 'Feedback formativo y constructivo para acelerar la curva de aprendizaje' },
        observacion_piso_real: { type: Type.STRING, description: 'Observación de cómo se desenvolvió ante el cliente chileno real en piso' }
      },
      required: ['nivel_madurez', 'indice_autonomia', 'brecha_principal', 'requiere_intervencion_tutor', 'roleplay_sugerido', 'feedback_pedagogico', 'observacion_piso_real']
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
    'evaluacion_criterios', 'cumplimiento_guion', 'nps_pronostico', 'diagnostico_ojt',
    'silencio_analisis', 'quiebres_atencion', 'feedback_coaching',
    'keywords', 'alertas', 'csat_estimado', 'resolucion_primer_contacto', 'segmentos'
  ]
};

// Token efficiency cache and metrics tracking
const callAnalysisCache = new Map<string, any>();
const tokenMetrics = {
  totalCallsAudited: 0,
  cachedCallsServed: 0,
  promptTokensUsed: 0,
  candidateTokensUsed: 0,
  totalTokensUsed: 0,
  cachedTokensSaved: 0,
};

// Endpoint to monitor token optimization metrics
app.get('/api/token-metrics', (_req, res) => {
  res.json({
    success: true,
    data: tokenMetrics
  });
});

// Analyze call endpoint with Level 1 cascade & exponential backoff
app.post('/api/analyze-call', async (req, res) => {
  const {
    audioBase64,
    mimeType = 'audio/wav',
    fileName = 'grabacion.wav',
    transcriptText,
    agentName = 'Asesor Claro',
    agentId = '',
    queue = 'Exclusivo Postpago Chile',
    requestedModelCascade = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview']
  } = req.body;

  // 1. Deduplication Cache: Avoid calling Gemini and spending 100% of tokens if call was already evaluated
  const cacheKey = audioBase64 
    ? `${fileName}_len${audioBase64.length}_${audioBase64.slice(0, 60)}_${audioBase64.slice(-60)}` 
    : (transcriptText ? `transcript_${transcriptText.length}_${transcriptText.slice(0, 100)}` : '');

  if (cacheKey && callAnalysisCache.has(cacheKey)) {
    tokenMetrics.cachedCallsServed++;
    tokenMetrics.cachedTokensSaved += 4500; // Estimated average saved tokens per cached call
    const cached = callAnalysisCache.get(cacheKey);
    return res.json({
      success: true,
      data: {
        ...cached,
        id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        codigo_llamada: cached.codigo_llamada || `REC-2026-CHILE-${Math.floor(1000 + Math.random() * 9000)}`,
        fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
        agente_id: agentId || cached.agente_id || 'AG-4821',
        agente_nombre: agentName || cached.agente_nombre || 'Asesor Claro',
        file_name: fileName || cached.file_name || 'grabacion.wav',
      },
      meta: {
        modelUsed: cached.modelo_procesado || 'gemini-3.8-flash',
        cached: true,
        tokensSaved: true,
        tokenUsage: {
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0,
          cachedContentTokenCount: 4500
        }
      }
    });
  }

  const ai = getGenAI();

  // If no Gemini API key, generate realistic intelligent QA analysis directly
  if (!ai) {
    const fallbackResult = generateRealisticMockAnalysis(fileName, agentName, queue, transcriptText, agentId);
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

  const prompt = getActiveFullPrompt();

  // Resilience Cascade loop
  const models = requestedModelCascade && requestedModelCascade.length > 0 
    ? requestedModelCascade 
    : ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-pro-preview'];

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

        // Focused user-turn instruction (prompt separated into systemInstruction for automatic caching)
        parts.push({ 
          text: `Audita la llamada de Claro Chile para el asesor "${agentName}" en la cola "${queue}". Evalúa minuciosamente las 4 fases normativas y entrega el resultado JSON según el responseSchema.` 
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Model timeout after 120s')), 120000)
        );

        // Optimized token generation config:
        // - systemInstruction separates static directives enabling Gemini prefix caching
        // - maxOutputTokens bounded to 8192 to prevent runaway token inflation
        const generatePromise = ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction: prompt,
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: callAnalysisSchema,
          }
        });

        const response = (await Promise.race([generatePromise, timeoutPromise])) as { 
          text?: string;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            totalTokenCount?: number;
            cachedContentTokenCount?: number;
          };
        };

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

        // Normalize 4-phase compliance scoring
        const cg = parsed.cumplimiento_guion || {};
        const f = cg.fases || {};
        const b = f.bienvenida || {};
        const er = f.entender_resolver || {};
        const ia = f.informar_accion || {};
        const c = f.cierre || {};

        const bCount = [b.generar_experiencia_positiva, b.mencionar_empresa_claro, b.mencionar_nombre_apellido, b.confirmar_nombre_cliente_rut_celular].filter(Boolean).length;
        const bPct = Math.round((bCount / 4) * 100);

        const erCount = [er.parafrasear_problema, er.ordenar_multiples_requerimientos, er.utilizar_sistemas_oficiales_somos_clave, er.cortesia_por_favor_gracias, er.validacion_identidad].filter(Boolean).length;
        const erPct = Math.round((erCount / 5) * 100);

        const iaCount = [ia.indicar_gestion_espera, ia.retomar_en_menos_de_un_minuto, ia.claridad_condiciones_comerciales, ia.resumen_atencion_gestion].filter(Boolean).length;
        const iaPct = Math.round((iaCount / 4) * 100);

        const cCount = [c.preguntas_aseguramiento, c.esperar_confirmacion_cliente, c.guion_encuesta_escala_0_a_10].filter(Boolean).length;
        const cPct = Math.round((cCount / 3) * 100);

        const totalItems = 16;
        const totalChecked = bCount + erCount + iaCount + cCount;
        const calculatedTotalPct = Math.round((totalChecked / totalItems) * 100);

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
          porcentaje_total: typeof cg.porcentaje_total === 'number' ? cg.porcentaje_total : calculatedTotalPct,
          observaciones_auditoria: cg.observaciones_auditoria || '',
          saludo_institucional: !!b.mencionar_empresa_claro && !!b.mencionar_nombre_apellido,
          verificacion_identidad: !!b.confirmar_nombre_cliente_rut_celular || !!er.validacion_identidad,
          escucha_activa: !!er.parafrasear_problema,
          entrega_ticket_subtel: typeof cg.entrega_ticket_subtel === 'boolean' ? cg.entrega_ticket_subtel : true,
          despedida_cordial: !!c.guion_encuesta_escala_0_a_10 || !!c.preguntas_aseguramiento,
          ofrecimiento_ayuda: !!c.preguntas_aseguramiento,
          politica_privacidad: true
        };

        // Normalize tNPS Predictivo
        const rawNps = parsed.nps_pronostico || {};
        let npsScore = typeof rawNps.score === 'number' ? Math.round(rawNps.score) : 8;
        const rawClasif = String(rawNps.clasificacion || '').toUpperCase().trim();
        const hasCriticalQuiebres = parsed.quiebres_atencion && Array.isArray(parsed.quiebres_atencion) && parsed.quiebres_atencion.some((q: any) => q.gravedad === 'CRITICO');

        let npsClasif: 'PROMOTOR' | 'NEUTRO' | 'DETRACTOR' = 'NEUTRO';
        if (npsScore >= 9 || rawClasif.includes('PROMOTOR') || rawClasif.includes('PROMOTER') || (!hasCriticalQuiebres && avgScore >= 80 && npsScore >= 7)) {
          npsClasif = 'PROMOTOR';
          if (npsScore < 9) npsScore = 9;
        } else if (npsScore <= 6 || rawClasif.includes('DETRACTOR')) {
          npsClasif = 'DETRACTOR';
          if (npsScore > 6) npsScore = 4;
        } else {
          npsClasif = 'NEUTRO';
        }

        const normalizedNpsPronostico = {
          score: npsScore,
          score_agente: typeof rawNps.score_agente === 'number' ? rawNps.score_agente : (npsClasif === 'PROMOTOR' ? 10 : 8),
          clasificacion: npsClasif,
          pregunta: rawNps.pregunta || '¿Qué tan probable es que recomiendes Claro a un amigo o familiar?',
          escala: rawNps.escala || 'Escala oficial de 0 a 10 (Donde 0 es "Nada probable" y 10 es "Muy probable")',
          justificacion: rawNps.justificacion || (npsClasif === 'PROMOTOR' ? 'Atención empática y resolutiva que impulsa la recomendación favorable.' : 'Evaluación de satisfacción tNPS predictiva.'),
          factor_marca_vs_agente: rawNps.factor_marca_vs_agente || '',
          camino_a_promotor: rawNps.camino_a_promotor || ''
        };

        const completeRecord = {
          id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          codigo_llamada: `REC-2026-CHILE-${Math.floor(1000 + Math.random() * 9000)}`,
          fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
          file_name: fileName,
          agente_nombre: agentName && agentName !== 'Asesor Claro' ? agentName : detectedAgent,
          agente_id: agentId || (agentName.toLowerCase().includes('camila') ? 'AGT-4821' : `AG-${Math.floor(7000 + Math.random() * 3000)}`),
          cliente_nombre: detectedCustomer,
          cliente_telefono: '+56 9 ' + Math.floor(60000000 + Math.random() * 39999999),
          cola_atencion: queue,
          duracion_total: formatSeconds(parsed.silencio_analisis?.duracion_total_segundos || 420),
          duracion_segundos: parsed.silencio_analisis?.duracion_total_segundos || 420,
          sentimiento_label: parsed.sentimiento_score > 0.2 ? 'Positivo' : parsed.sentimiento_score < -0.2 ? 'Negativo' : 'Neutro',
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

        if (cacheKey) {
          callAnalysisCache.set(cacheKey, completeRecord);
        }

        const u = response.usageMetadata;
        if (u) {
          tokenMetrics.totalCallsAudited++;
          tokenMetrics.promptTokensUsed += u.promptTokenCount || 0;
          tokenMetrics.candidateTokensUsed += u.candidatesTokenCount || 0;
          tokenMetrics.totalTokensUsed += u.totalTokenCount || 0;
          tokenMetrics.cachedTokensSaved += u.cachedContentTokenCount || 0;
        }

        return res.json({
          success: true,
          data: completeRecord,
          meta: {
            modelUsed: model,
            attempts: attempt,
            totalRetries: retryCount,
            tokenUsage: u || null,
            cached: false
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
function generateRealisticMockAnalysis(fileName: string, agentName: string, queue: string, transcriptText?: string, agentId?: string) {
  const isDetractor = fileName.toLowerCase().includes('reclamo') || fileName.toLowerCase().includes('boleta') || fileName.toLowerCase().includes('baja');
  const durSec = 380 + Math.floor(Math.random() * 200);
  const ivrSec = 90 + Math.floor(Math.random() * 150);
  const silenceSec = isDetractor ? 65 : 22;
  const silencePct = Math.round((silenceSec / durSec) * 100);

  const result: any = {
    id: `call-${Date.now()}`,
    codigo_llamada: `REC-2026-CHILE-${Math.floor(2000 + Math.random() * 7000)}`,
    fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
    file_name: fileName,
    agente_nombre: agentName,
    agente_id: agentId || (agentName.toLowerCase().includes('camila') ? 'AGT-4821' : `AG-${Math.floor(7000 + Math.random() * 3000)}`),
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
      fases: {
        bienvenida: {
          generar_experiencia_positiva: true,
          mencionar_empresa_claro: true,
          mencionar_nombre_apellido: !isDetractor,
          confirmar_nombre_cliente_rut_celular: true,
          porcentaje: !isDetractor ? 100 : 75
        },
        entender_resolver: {
          parafrasear_problema: !isDetractor,
          ordenar_multiples_requerimientos: true,
          utilizar_sistemas_oficiales_somos_clave: true,
          cortesia_por_favor_gracias: !isDetractor,
          validacion_identidad: true,
          porcentaje: !isDetractor ? 100 : 60
        },
        informar_accion: {
          indicar_gestion_espera: !isDetractor,
          retomar_en_menos_de_un_minuto: !isDetractor,
          claridad_condiciones_comerciales: !isDetractor,
          resumen_atencion_gestion: !isDetractor,
          porcentaje: !isDetractor ? 100 : 25
        },
        cierre: {
          preguntas_aseguramiento: !isDetractor,
          esperar_confirmacion_cliente: !isDetractor,
          guion_encuesta_escala_0_a_10: !isDetractor,
          porcentaje: !isDetractor ? 100 : 33
        }
      },
      porcentaje_total: !isDetractor ? 95 : 52,
      observaciones_auditoria: !isDetractor 
        ? 'Excelente aplicación de la pauta de atención institucional Claro Chile en sus 4 fases operativas.'
        : 'Quiebres detectados en fases de Informar Acción (esperas sin justificación) y Cierre (omisión del guion normativo de encuesta 0 a 10).',
      saludo_institucional: true,
      verificacion_identidad: true,
      escucha_activa: !isDetractor,
      entrega_ticket_subtel: !isDetractor,
      despedida_cordial: !isDetractor,
      ofrecimiento_ayuda: !isDetractor,
      politica_privacidad: true
    },
    nps_pronostico: {
      score: isDetractor ? 6 : 9, // Calibración amigable: no castigar con 2 si hubo esfuerzo humano
      score_agente: isDetractor ? 7 : 10, // Percepción del trato humano del asesor OJT
      clasificacion: isDetractor ? 'DETRACTOR' : 'PROMOTOR',
      pregunta: '¿Qué tan probable es que recomiendes Claro a un amigo o familiar? Considerando una escala de 0 a 10, donde 0 es "Nada probable" y 10 es "Muy probable"',
      escala: 'Escala oficial de 0 a 10 (Donde 0 es "Nada probable" y 10 es "Muy probable")',
      justificacion: isDetractor 
        ? 'El cliente presentó frustración por alza en su boleta de Claro. Aunque el asesor en OJT mantuvo el respeto, la demora en CRM y falta de explicación del proporcional afectaron la nota final.'
        : 'Atención empática, fluida y resolutiva con entrega al tiro de regularización comercial y número de ticket normativo SUBTEL.',
      factor_marca_vs_agente: isDetractor
        ? 'Fricción originada en políticas de facturación de Claro (alza no notificada). El asesor novel mostró paciencia pero titubeó en la respuesta.'
        : 'Total alineación positiva: cliente satisfecho con la respuesta y con el trato cercano del asesor.',
      camino_a_promotor: isDetractor
        ? 'Explicar el cálculo de cobro proporcional de inmediato sin pausas largas para elevar la percepción de dominio y cerrar en Promotor (9-10).'
        : 'Mantener la calidez actual y asegurar siempre la mención de la encuesta de 0 a 10.'
    },
    diagnostico_ojt: {
      nivel_madurez: isDetractor ? 'EN_DESARROLLO' : 'LISTO_PRODUCCION',
      indice_autonomia: isDetractor ? 68 : 94,
      brecha_principal: isDetractor ? 'HERRAMIENTA_SISTEMAS' : 'NINGUNA_DOMINIO',
      requiere_intervencion_tutor: isDetractor,
      roleplay_sugerido: isDetractor
        ? 'Roleplay de 5 minutos: Simulación de cliente chileno con reclamo de boleta, practicando consulta rápida en Somos Clave y explicación de costo proporcional sin silencios prolongados.'
        : 'Felicitación y refuerzo positivo en feedback de piso. Asesor listo para operar con autonomía completa.',
      feedback_pedagogico: isDetractor
        ? 'Muy buena compostura ante un cliente real en vivo. El asesor no perdió la calma; solo necesita más soltura en la navegación del CRM para evitar pausas que generen ansiedad en el usuario.'
        : 'Desempeño sobresaliente en piso real. Excelente dicción, empatía con modismos chilenos y cumplimiento riguroso de la pauta Claro.',
      observacion_piso_real: isDetractor
        ? 'En piso real se observa concentración pero lentitud al buscar la cuenta en el sistema. Con 2 prácticas asistidas superará la brecha.'
        : 'Interacción ágil con cliente real, logrando resolver el motivo de contacto en el primer contacto.'
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
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist'))
      ? path.join(process.cwd(), 'dist')
      : __dirname;
    const indexPath = path.join(distPath, 'index.html');

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Endpoint API no encontrado' });
      }
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Claro Speech Analytics server running on port ${PORT}`);
  });
}

if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;
