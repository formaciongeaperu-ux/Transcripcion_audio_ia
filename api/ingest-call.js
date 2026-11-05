// api/ingest-call.ts
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// qaEngine.ts
import fs from "fs";
import path from "path";
import { Type } from "@google/genai";
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
var CALIBRATION_FILE = path.join(process.cwd(), "calibration.json");
function loadCalibration() {
  try {
    if (fs.existsSync(CALIBRATION_FILE)) {
      const raw = fs.readFileSync(CALIBRATION_FILE, "utf-8");
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
function getActiveFullPrompt(source = activeCalibration) {
  let prompt = DEFAULT_BASE_PROMPT;
  if (source.customDirectives && source.customDirectives.trim()) {
    prompt += `

--- DIRECTIVAS ADICIONALES DE CALIBRACI\xD3N ACTIVA (CONFIGURADAS POR EL AUDITOR) ---
${source.customDirectives.trim()}`;
  }
  if (source.sensitivitySettings) {
    const s = source.sensitivitySettings;
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
  type: Type.OBJECT,
  properties: {
    resumen: { type: Type.STRING, description: "Resumen ejecutivo de la llamada" },
    motivo_categoria: { type: Type.STRING, description: "Categoria: soporte | ventas | reclamos | bajas | facturacion" },
    motivo_nombre: { type: Type.STRING, description: "Nombre descriptivo del motivo o driver de llamada" },
    sentimiento_score: { type: Type.NUMBER, description: "Score de sentimiento de -1.0 a 1.0" },
    evaluacion_criterios: {
      type: Type.OBJECT,
      properties: {
        amabilidad_empatia: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type.STRING, description: "Justificaci\xF3n detallada con marcas de tiempo" }
          },
          required: ["nota", "diagnostico"]
        },
        seguridad_expresarse: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type.STRING, description: "Justificaci\xF3n t\xE9cnica y solidez verbal" }
          },
          required: ["nota", "diagnostico"]
        },
        claridad_informacion: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type.STRING, description: "Justificaci\xF3n did\xE1ctica" }
          },
          required: ["nota", "diagnostico"]
        },
        tiempos_espera_hold: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type.STRING, description: "Justificaci\xF3n de tiempos de espera" }
          },
          required: ["nota", "diagnostico"]
        },
        eficiencia_tmo: {
          type: Type.OBJECT,
          properties: {
            nota: { type: Type.NUMBER, description: "Puntuaci\xF3n 0 a 100" },
            diagnostico: { type: Type.STRING, description: "Justificaci\xF3n de agilidad y duraci\xF3n" }
          },
          required: ["nota", "diagnostico"]
        }
      },
      required: ["amabilidad_empatia", "seguridad_expresarse", "claridad_informacion", "tiempos_espera_hold", "eficiencia_tmo"]
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
                generar_experiencia_positiva: { type: Type.BOOLEAN, description: "Generar experiencia positiva desde el primer contacto" },
                mencionar_empresa_claro: { type: Type.BOOLEAN, description: "Mencionar el nombre de la empresa y dar la bienvenida a Claro" },
                mencionar_nombre_apellido: { type: Type.BOOLEAN, description: "Mencionar primer nombre y primer apellido del asesor" },
                confirmar_nombre_cliente_rut_celular: { type: Type.BOOLEAN, description: "Confirmar nombre del cliente con quien se habla, validando celular o RUT en caso amerite" }
              },
              required: ["generar_experiencia_positiva", "mencionar_empresa_claro", "mencionar_nombre_apellido", "confirmar_nombre_cliente_rut_celular"]
            },
            entender_resolver: {
              type: Type.OBJECT,
              properties: {
                parafrasear_problema: { type: Type.BOOLEAN, description: "Asegurarse de entender el problema del cliente parafraseando lo que comenta" },
                ordenar_multiples_requerimientos: { type: Type.BOOLEAN, description: "Si el cliente tiene m\xE1s de una necesidad, ordenar los requerimientos y hacerse cargo de cada uno" },
                utilizar_sistemas_oficiales_somos_clave: { type: Type.BOOLEAN, description: "Utilizar sistemas oficiales y procedimientos publicados en Somos Clave" },
                cortesia_por_favor_gracias: { type: Type.BOOLEAN, description: "Pedir por favor y agradecer al cliente cuando necesitamos que ejecute una instrucci\xF3n o entregue informaci\xF3n" },
                validacion_identidad: { type: Type.BOOLEAN, description: "Si el procedimiento lo indica, realizar la validaci\xF3n de identidad" }
              },
              required: ["parafrasear_problema", "ordenar_multiples_requerimientos", "utilizar_sistemas_oficiales_somos_clave", "cortesia_por_favor_gracias", "validacion_identidad"]
            },
            informar_accion: {
              type: Type.OBJECT,
              properties: {
                indicar_gestion_espera: { type: Type.BOOLEAN, description: "Indicar al cliente qu\xE9 gesti\xF3n se est\xE1 realizando al pedir momento en espera" },
                retomar_en_menos_de_un_minuto: { type: Type.BOOLEAN, description: "Retomar la llamada en menos de un minuto para mantener la comunicaci\xF3n, sin dejar silencios prolongados" },
                claridad_condiciones_comerciales: { type: Type.BOOLEAN, description: "Ser claro y espec\xEDfico en informar cambios en condiciones comerciales: costos, proporcionales, descuentos y promociones con vigencia" },
                resumen_atencion_gestion: { type: Type.BOOLEAN, description: "Hacer un breve resumen de toda la atenci\xF3n y gesti\xF3n realizada al terminar la explicaci\xF3n" }
              },
              required: ["indicar_gestion_espera", "retomar_en_menos_de_un_minuto", "claridad_condiciones_comerciales", "resumen_atencion_gestion"]
            },
            cierre: {
              type: Type.OBJECT,
              properties: {
                preguntas_aseguramiento: { type: Type.BOOLEAN, description: "Realizar preguntas de aseguramiento: alguna otra consulta, qued\xF3 clara la info, le puedo ayudar en algo m\xE1s" },
                esperar_confirmacion_cliente: { type: Type.BOOLEAN, description: "Esperar la confirmaci\xF3n activa de parte del cliente antes de cerrar" },
                guion_encuesta_escala_0_a_10: { type: Type.BOOLEAN, description: "Mencionar guion de encuesta evaluando atenci\xF3n por mail o SMS en escala de 0 (m\xE1s baja) a 10 (m\xE1s alta) y agradecer" }
              },
              required: ["preguntas_aseguramiento", "esperar_confirmacion_cliente", "guion_encuesta_escala_0_a_10"]
            }
          },
          required: ["bienvenida", "entender_resolver", "informar_accion", "cierre"]
        },
        porcentaje_total: { type: Type.NUMBER, description: "Porcentaje global de cumplimiento del guion de 0 a 100" },
        observaciones_auditoria: { type: Type.STRING, description: "Resumen o diagn\xF3stico de cumplimiento de la pauta" },
        saludo_institucional: { type: Type.BOOLEAN },
        verificacion_identidad: { type: Type.BOOLEAN },
        escucha_activa: { type: Type.BOOLEAN },
        entrega_ticket_subtel: { type: Type.BOOLEAN },
        despedida_cordial: { type: Type.BOOLEAN }
      },
      required: ["fases", "porcentaje_total", "saludo_institucional", "verificacion_identidad", "escucha_activa", "entrega_ticket_subtel", "despedida_cordial"]
    },
    nps_pronostico: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.NUMBER, description: "Puntaje predicho tNPS de 0 a 10 equilibrado y realista" },
        score_agente: { type: Type.NUMBER, description: "Puntuaci\xF3n 0 a 10 evaluando \xFAnicamente el trato humano, empat\xEDa y esfuerzo del asesor novel en OJT" },
        clasificacion: { type: Type.STRING, description: "DETRACTOR (0-6) | NEUTRO (7-8) | PROMOTOR (9-10)" },
        pregunta: { type: Type.STRING, description: "Pregunta oficial: \xBFQu\xE9 tan probable es que recomiendes Claro a un amigo o familiar?" },
        justificacion: { type: Type.STRING, description: "Explicaci\xF3n del pron\xF3stico NPS" },
        factor_marca_vs_agente: { type: Type.STRING, description: "Diferenciaci\xF3n entre molestia de fondo con Claro (marca/cobros) vs satisfacci\xF3n con el trato del asesor" },
        camino_a_promotor: { type: Type.STRING, description: "Ajuste espec\xEDfico en OJT para llevar este cliente a Promotor (9-10)" }
      },
      required: ["score", "clasificacion", "justificacion", "score_agente", "factor_marca_vs_agente", "camino_a_promotor"]
    },
    diagnostico_ojt: {
      type: Type.OBJECT,
      properties: {
        nivel_madurez: { type: Type.STRING, description: "EN_REFUERZO | EN_DESARROLLO | LISTO_PRODUCCION" },
        indice_autonomia: { type: Type.NUMBER, description: "Porcentaje de autonom\xEDa 0 a 100 respecto al tutor de piso" },
        brecha_principal: { type: Type.STRING, description: "PROCEDIMIENTO_GUION | HERRAMIENTA_SISTEMAS | HABILIDADES_BLANDAS | NINGUNA_DOMINIO" },
        requiere_intervencion_tutor: { type: Type.BOOLEAN, description: "Si el tutor de piso debe intervenir o realizar refuerzo inmediato" },
        roleplay_sugerido: { type: Type.STRING, description: "Roleplay o simulaci\xF3n de 5 minutos sugerida para el tutor OJT" },
        feedback_pedagogico: { type: Type.STRING, description: "Feedback formativo y constructivo para acelerar la curva de aprendizaje" },
        observacion_piso_real: { type: Type.STRING, description: "Observaci\xF3n de c\xF3mo se desenvolvi\xF3 ante el cliente chileno real en piso" }
      },
      required: ["nivel_madurez", "indice_autonomia", "brecha_principal", "requiere_intervencion_tutor", "roleplay_sugerido", "feedback_pedagogico", "observacion_piso_real"]
    },
    silencio_analisis: {
      type: Type.OBJECT,
      properties: {
        duracion_total_segundos: { type: Type.NUMBER },
        tiempo_ivr_segundos: { type: Type.NUMBER, description: "Tiempo previo en IVR antes de interactuar" },
        tiempo_agente_segundos: { type: Type.NUMBER, description: "Tiempo con el agente" },
        silencio_agente_segundos: { type: Type.NUMBER, description: "Tiempo total en silencio/dead air con el agente" },
        porcentaje_silencio: { type: Type.NUMBER, description: "Porcentaje de silencio con el agente" },
        nivel_silencio: { type: Type.STRING, description: "\xD3PTIMO | MODERADO | CR\xCDTICO" },
        diagnostico_silencio: { type: Type.STRING }
      },
      required: ["duracion_total_segundos", "tiempo_ivr_segundos", "tiempo_agente_segundos", "silencio_agente_segundos", "porcentaje_silencio", "nivel_silencio", "diagnostico_silencio"]
    },
    quiebres_atencion: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tiempo: { type: Type.STRING, description: "Timestamp en formato mm:ss ej 02:45" },
          segundo: { type: Type.NUMBER },
          tipo: { type: Type.STRING, description: "Tipo de quiebre" },
          cita: { type: Type.STRING, description: "Cita textual del asesor o silencio" },
          severidad: { type: Type.STRING, description: "CR\xCDTICO | ALTO | MEDIO" },
          impacto_cliente: { type: Type.STRING }
        },
        required: ["tiempo", "segundo", "tipo", "cita", "severidad", "impacto_cliente"]
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
      required: ["fortalezas", "oportunidades_mejora", "guion_sugerido_alternativo", "plan_accion"]
    },
    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    alertas: { type: Type.ARRAY, items: { type: Type.STRING } },
    csat_estimado: { type: Type.NUMBER, description: "1 a 5" },
    resolucion_primer_contacto: { type: Type.BOOLEAN },
    agente_nombre_detectado: { type: Type.STRING, description: "Nombre real del asesor que atiende la llamada" },
    cliente_nombre_detectado: { type: Type.STRING, description: 'Nombre real del cliente mencionado en la llamada (o "Cliente Claro" si no se dice)' },
    segmentos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hablante: { type: Type.STRING, description: "agente | cliente" },
          inicio: { type: Type.NUMBER },
          fin: { type: Type.NUMBER },
          texto: { type: Type.STRING },
          sentimientoScore: { type: Type.NUMBER }
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
    ...parsed,
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
    duracion_segundos: Math.round(Number(durationSeconds) || 0),
    sentimiento_label: parsed.sentimiento_score > 0.2 ? "Positivo" : parsed.sentimiento_score < -0.2 ? "Negativo" : "Neutro",
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

// calibrationStore.ts
import fs2 from "fs";
import os from "os";
import path2 from "path";
import { Readable } from "node:stream";
import { text as readStreamText } from "node:stream/consumers";
import { get, put } from "@vercel/blob";
var BLOB_NAME = "gea-calibration.json";
var TMP_FILE = path2.join(os.tmpdir(), BLOB_NAME);
function blobToken() {
  const value = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
  return value && value !== "[SENSITIVE]" ? value : "";
}
function defaultCalibration() {
  return {
    customDirectives: DEFAULT_CUSTOM_DIRECTIVES,
    sensitivitySettings: { ...DEFAULT_SENSITIVITY_SETTINGS },
    version: "v1.3.0",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function normalize(raw) {
  const base = defaultCalibration();
  const strictness = String(raw?.sensitivitySettings?.detractorStrictness || "");
  const allowed = ["flexible", "equilibrada", "estricta", "moderado"];
  const mapped = strictness === "moderado" ? "equilibrada" : strictness;
  return {
    customDirectives: typeof raw?.customDirectives === "string" ? raw.customDirectives : base.customDirectives,
    sensitivitySettings: {
      silenceToleranceSeconds: Number(raw?.sensitivitySettings?.silenceToleranceSeconds ?? base.sensitivitySettings.silenceToleranceSeconds) || 30,
      detractorStrictness: allowed.includes(strictness) ? mapped : base.sensitivitySettings.detractorStrictness,
      chileanSlangTolerance: Boolean(raw?.sensitivitySettings?.chileanSlangTolerance ?? base.sensitivitySettings.chileanSlangTolerance),
      ojtPedagogicalFocus: Boolean(raw?.sensitivitySettings?.ojtPedagogicalFocus ?? base.sensitivitySettings.ojtPedagogicalFocus)
    },
    version: "v1.3.0",
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function readBlob() {
  const token = blobToken();
  if (!token) return null;
  const result = await get(BLOB_NAME, { access: "private", token, useCache: false });
  if (!result || !("stream" in result) || !result.stream) return null;
  const raw = await readStreamText(Readable.fromWeb(result.stream));
  return raw ? normalize(JSON.parse(raw)) : null;
}
async function readCalibration() {
  if (!process.env.VERCEL) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const webRes = await fetch("https://transcripcion-audio-ia.vercel.app/api/calibration", { signal: controller.signal });
      clearTimeout(timeout);
      if (webRes.ok) {
        const json = await webRes.json();
        if (json?.data?.customDirectives) {
          const synced = normalize(json.data);
          try {
            fs2.writeFileSync(path2.join(process.cwd(), "calibration.json"), JSON.stringify(synced, null, 2), "utf8");
          } catch {
          }
          return synced;
        }
      }
    } catch {
    }
  }
  try {
    const stored = await readBlob();
    if (stored) return stored;
  } catch (err) {
    console.warn("[Calibration] No se pudo leer la calibraci\xF3n guardada:", err);
  }
  for (const file of [TMP_FILE, path2.join(process.cwd(), "calibration.json")]) {
    try {
      if (fs2.existsSync(file)) return normalize(JSON.parse(fs2.readFileSync(file, "utf8")));
    } catch {
    }
  }
  return defaultCalibration();
}

// api/ingest-call.ts
var supabaseUrl = process.env.VITE_SUPABASE_URL || "https://givdlqjfnctxvarpybht.supabase.co";
var supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_nNtMZhvN0uPRz4QzVnUyPQ_Rs4yyI0D";
var supabase = createClient(supabaseUrl, supabaseKey);
var DEFAULT_SECRET = "gea_n8n_speech_secret_2026";
function getApiKeys() {
  const keys = [];
  if (process.env.GEMINI_API_KEYS) {
    process.env.GEMINI_API_KEYS.split(",").map((k) => k.trim()).filter((k) => k.length > 0).forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
  }
  if (process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY.split(",").map((k) => k.trim()).filter((k) => k.length > 0).forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
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
var clientCache = /* @__PURE__ */ new Map();
function getGenAIClient(apiKey) {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    clientCache.set(apiKey, client);
  }
  return client;
}
function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
function cleanSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map((seg, idx) => ({
    id: seg.id || `seg-${idx + 1}`,
    hablante: seg.hablante === "cliente" ? "cliente" : "agente",
    inicio: Number(seg.inicio) || 0,
    fin: Number(seg.fin) || 0,
    texto: String(seg.texto || ""),
    sentimientoScore: Number(seg.sentimientoScore) || 0
  }));
}
function buildWhatsAppMessage(record) {
  const npsClass = record.nps_pronostico?.clasificacion || "NEUTRO";
  const npsEmoji = npsClass === "PROMOTOR" ? "\u{1F7E2}" : npsClass === "DETRACTOR" ? "\u{1F534}" : "\u{1F7E1}";
  const qaScore = record.qa_score_global ?? 0;
  const qaEmoji = qaScore >= 85 ? "\u{1F31F}" : qaScore >= 70 ? "\u2696\uFE0F" : "\u26A0\uFE0F";
  let quiebresText = "\u2022 Ninguno detectado (Atenci\xF3n conforme)";
  if (record.quiebres_atencion && record.quiebres_atencion.length > 0) {
    quiebresText = record.quiebres_atencion.map((q) => `\u2022 [${q.tiempo || "00:00"}] *${q.tipo || "Observaci\xF3n"}* (${q.severidad || "MEDIO"})`).slice(0, 3).join("\n");
  }
  let ojtText = "";
  if (record.diagnostico_ojt) {
    const o = record.diagnostico_ojt;
    ojtText = `
\u{1F468}\u200D\u{1F3EB} *Diagn\xF3stico OJT (Piso):*
\u2022 Madurez: ${o.nivel_madurez || "EN_DESARROLLO"} (${o.indice_autonomia ?? 75}%)
\u2022 Brecha: ${o.brecha_principal || "Ninguna"}`;
  }
  return `\u{1F4CA} *AUDITOR\xCDA AUTOM\xC1TICA SPEECH ANALYTICS*
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F464} *Asesor:* ${record.agente_nombre} (ID: ${record.agente_id})
\u{1F4C1} *Archivo:* ${record.file_name}
\u23F1\uFE0F *Duraci\xF3n:* ${record.duracion_total} | Cola: ${record.cola_atencion}

${qaEmoji} *QA Score Global:* ${qaScore}%
${npsEmoji} *tNPS Pron\xF3stico:* ${record.nps_pronostico?.score ?? "-"}/10 (*${npsClass}*)
CSAT Estimado: ${record.csat_estimado ?? 4}/5

\u{1F50D} *Quiebres de Atenci\xF3n:*
${quiebresText}${ojtText}

\u{1F4A1} *Plan de Acci\xF3n Inmediato:*
"${record.feedback_coaching?.plan_accion || "Refuerzo de protocolo est\xE1ndar"}"
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F517} *Ver an\xE1lisis completo y audio:*
https://transcripcion-audio-ia.vercel.app`;
}
async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Secret, X-File-Name, X-Agent-Name, X-Agent-Id, X-Queue, Authorization");
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "M\xE9todo no permitido. Utiliza POST." });
  }
  const providedSecret = req.headers["x-api-secret"] || req.headers["authorization"]?.replace(/^Bearer\s+/i, "") || req.query?.secret;
  const validSecret = process.env.INGEST_API_SECRET || DEFAULT_SECRET;
  if (!providedSecret || providedSecret !== validSecret) {
    return res.status(401).json({
      success: false,
      error: "No autorizado. Proporciona una clave v\xE1lida en el header X-API-Secret o par\xE1metro ?secret=..."
    });
  }
  try {
    let audioBase64 = "";
    let mimeType = "audio/wav";
    let fileName = (req.headers["x-file-name"] ? decodeURIComponent(String(req.headers["x-file-name"])) : "") || "llamada_n8n.wav";
    let agentName = (req.headers["x-agent-name"] ? decodeURIComponent(String(req.headers["x-agent-name"])) : "") || "Asesor Claro";
    let agentId = (req.headers["x-agent-id"] ? decodeURIComponent(String(req.headers["x-agent-id"])) : "") || "AGT-4821";
    let queue = (req.headers["x-queue"] ? decodeURIComponent(String(req.headers["x-queue"])) : "") || "Exclusivo Postpago Chile";
    let driveUrl = req.headers["x-drive-url"] ? decodeURIComponent(String(req.headers["x-drive-url"])) : "";
    const contentType = String(req.headers["content-type"] || "");
    if (contentType.includes("application/json") && req.body && typeof req.body === "object") {
      audioBase64 = req.body.audioBase64 || "";
      mimeType = req.body.mimeType || mimeType;
      fileName = req.body.fileName || fileName;
      agentName = req.body.agentName || agentName;
      agentId = req.body.agentId || agentId;
      queue = req.body.queue || queue;
      driveUrl = req.body.driveUrl || driveUrl;
      if (!audioBase64 && req.body.audioUrl) {
        const audioFetch = await fetch(req.body.audioUrl);
        if (!audioFetch.ok) throw new Error(`No se pudo descargar el audio desde la URL proporcionada (${audioFetch.status})`);
        const arrayBuf = await audioFetch.arrayBuffer();
        audioBase64 = Buffer.from(arrayBuf).toString("base64");
        mimeType = audioFetch.headers.get("content-type") || mimeType;
      }
    } else {
      const rawBuf = await readRawBody(req);
      if (rawBuf && rawBuf.length > 0) {
        audioBase64 = rawBuf.toString("base64");
        if (contentType.startsWith("audio/")) {
          mimeType = contentType.split(";")[0];
        } else if (fileName.endsWith(".mp3")) {
          mimeType = "audio/mp3";
        } else if (fileName.endsWith(".m4a")) {
          mimeType = "audio/mp4";
        }
      }
    }
    if (!audioBase64) {
      return res.status(400).json({
        success: false,
        error: "No se recibi\xF3 archivo de audio (debe enviarse en binario, audioBase64 o audioUrl)."
      });
    }
    const calibration = await readCalibration().catch(() => null);
    const prompt = getActiveFullPrompt(calibration);
    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      return res.status(500).json({
        success: false,
        error: "GEMINI_API_KEY no est\xE1 configurada en el servidor. Configura la clave en Vercel o en las variables de entorno."
      });
    }
    const models = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.1-pro-preview"];
    let parsed = null;
    let modelUsed = "";
    let lastError = "";
    for (const model of models) {
      for (const key of apiKeys) {
        try {
          const ai = getGenAIClient(key);
          const parts = [
            {
              inlineData: {
                data: audioBase64,
                mimeType
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
              responseMimeType: "application/json",
              responseSchema: callAnalysisSchema
            }
          });
          const rawText = response.text?.trim() || "{}";
          parsed = JSON.parse(rawText);
          modelUsed = model;
          break;
        } catch (err) {
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
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { error: dbError } = await supabase.from("call_records").insert(dbPayload);
    if (dbError && dbError.code !== "23505") {
      console.warn("[Ingest Call] Advertencia al guardar en Supabase:", dbError.message);
    }
    const whatsappMessage = buildWhatsAppMessage(completeRecord);
    return res.status(200).json({
      success: true,
      callId: completeRecord.id,
      codigoLlamada: completeRecord.codigo_llamada,
      fileName,
      agent: {
        id: completeRecord.agente_id,
        name: completeRecord.agente_nombre
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
  } catch (error) {
    console.error("[Ingest Call Error]:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "Error interno al procesar e ingestar la llamada"
    });
  }
}
export {
  handler as default
};
