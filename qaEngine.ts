import fs from 'fs';
import path from 'path';
import { Type } from '@google/genai';

export const DEFAULT_BASE_PROMPT = `Eres un tutor y auditor experto en Speech Analytics, Aseguramiento de la Calidad (QA) y Aceleración de Curva de Aprendizaje para Contact Centers de Claro en Chile.

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

export const DEFAULT_CUSTOM_DIRECTIVES = `# DIRECTIVAS ADICIONALES DE CALIBRACIÓN ACTIVA (OPERACIÓN CLARO CHILE)
# Estas directivas tienen prioridad y adaptan el juicio del motor de IA para la operación diaria.

1. TOLERANCIA A PAUSAS EN SISTEMAS INTERNOS (SOMOS CLAVE / CRM):
- Si el asesor pide tiempo para validar en el sistema ("Permítame un momento mientras abro el sistema", "Deme un instante en línea"), no penalizar la nota de tiempos de espera si retoma el contacto dentro de 60 segundos.
- Considerar estas pausas como oportunidad formativa de agilidad, nunca como desidia o negligencia.

2. ATENCIÓN DE CLIENTES DETRACTORES POR COBROS O CAÍDA DE SEÑAL:
- Si el cliente ingresa enfurecido por fallas de facturación o caída masiva de red, evaluar el 'score_agente' independientemente de la queja hacia Claro. Si el asesor mantuvo la calma y empatizó, su nota de amabilidad debe ser >= 85.

3. REGLA DE CIERRE Y ENCUESTA DE SERVICIO:
- Si el cliente apura la despedida diciendo "muchas gracias, que esté bien" e interrumpe antes de que el asesor termine de explicar la escala 0-10, calificar 'cierre.esperar_confirmacion_cliente' como cumplido y no castigar severamente el cumplimiento global.`;

export const DEFAULT_SENSITIVITY_SETTINGS = {
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

export let activeCalibration = loadCalibration();

export function saveCalibration(customDirectives: string, sensitivitySettings: typeof DEFAULT_SENSITIVITY_SETTINGS) {
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

export function getActiveFullPrompt(source: {
  customDirectives?: string;
  sensitivitySettings?: typeof DEFAULT_SENSITIVITY_SETTINGS;
} = activeCalibration): string {
  let prompt = DEFAULT_BASE_PROMPT;

  if (source.customDirectives && source.customDirectives.trim()) {
    prompt += `\n\n--- DIRECTIVAS ADICIONALES DE CALIBRACIÓN ACTIVA (CONFIGURADAS POR EL AUDITOR) ---\n${source.customDirectives.trim()}`;
  }

  if (source.sensitivitySettings) {
    const s = source.sensitivitySettings;
    prompt += `\n\n--- PARÁMETROS OPERATIVOS DE SENSIBILIDAD DINÁMICA ---
- Tolerancia máxima a silencios/pausas operativas sin hold formal: ${s.silenceToleranceSeconds} segundos.
- Rigor en clasificación de Detractores tNPS: ${s.detractorStrictness.toUpperCase()}.
- Tolerancia a modismos locales y modulación chilena: ${s.chileanSlangTolerance ? 'ALTA (no penalizar modismos propios del país)' : 'ESTRICTA'}.
- Enfoque pedagógico OJT para tutor de piso: ${s.ojtPedagogicalFocus ? 'PRIORITARIO (priorizar feedback formativo constructivo)' : 'ESTÁNDAR'}.`;
  }

  return prompt;
}

export function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Schema for Gemini call analysis
export const callAnalysisSchema = {
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

export function qaSchemaWithoutTranscript() {
  const properties = { ...callAnalysisSchema.properties } as Record<string, unknown>;
  delete properties.segmentos;
  return {
    type: callAnalysisSchema.type,
    properties,
    required: callAnalysisSchema.required.filter((key: string) => key !== 'segmentos'),
  };
}

export function finalizeCallAnalysis(parsed: any, ctx: {
  model: string;
  fileName: string;
  agentName: string;
  agentId: string;
  queue: string;
  durationSeconds?: number;
}) {
  const { model, fileName, agentName, agentId, queue } = ctx;
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
  const calculatedTotalPct = Math.round(((bCount + erCount + iaCount + cCount) / 16) * 100);

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

  const rawNps = parsed.nps_pronostico || {};
  let npsScore = typeof rawNps.score === 'number' ? Math.round(rawNps.score) : 8;
  const rawClasif = String(rawNps.clasificacion || '').toUpperCase().trim();
  const hasCriticalQuiebres = Array.isArray(parsed.quiebres_atencion) && parsed.quiebres_atencion.some((q: any) => {
    const level = String(q.severidad || q.gravedad || '').toUpperCase();
    return level.startsWith('CRIT');
  });

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

  const durationSeconds = ctx.durationSeconds || parsed.silencio_analisis?.duracion_total_segundos || 420;

  return {
    ...parsed,
    id: `call-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    codigo_llamada: `REC-2026-CHILE-${Math.floor(1000 + Math.random() * 9000)}`,
    fecha_hora: new Date().toISOString().replace('T', ' ').substring(0, 16),
    file_name: fileName,
    agente_nombre: agentName && agentName !== 'Asesor Claro' ? agentName : detectedAgent,
    agente_id: agentId || (agentName.toLowerCase().includes('camila') ? 'AGT-4821' : `AG-${Math.floor(7000 + Math.random() * 3000)}`),
    cliente_nombre: detectedCustomer,
    cliente_telefono: '+56 9 ' + Math.floor(60000000 + Math.random() * 39999999),
    cola_atencion: queue,
    duracion_total: formatSeconds(durationSeconds),
    duracion_segundos: Math.round(Number(durationSeconds) || 0),
    sentimiento_label: parsed.sentimiento_score > 0.2 ? 'Positivo' : parsed.sentimiento_score < -0.2 ? 'Negativo' : 'Neutro',
    modelo_procesado: model,
    qa_score_global: avgScore,
    nps_pronostico: normalizedNpsPronostico,
    cumplimiento_guion: normalizedCumplimientoGuion,
    segmentos: normalizedSegmentos,
    transcripcion: {
      segmentos: normalizedSegmentos
    }
  };
}
