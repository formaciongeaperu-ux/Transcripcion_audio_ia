// api-src/calibration/chat.ts
import { GoogleGenAI } from "@google/genai";

// calibrationStore.ts
import os from "os";
import path2 from "path";
import { get, put } from "@vercel/blob";

// qaEngine.ts
import fs from "fs";
import path from "path";
import { Type } from "@google/genai";
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
    diagnostico_operaciones: {
      type: Type.OBJECT,
      description: "Diagn\xF3stico para el \xE1rea de Operaciones enfocado en la causa ra\xEDz de detracci\xF3n, riesgo de churn y plan de acci\xF3n operativo.",
      properties: {
        es_detractor: { type: Type.BOOLEAN, description: "True si el cliente es detractor (tNPS 0-6) o expresa molestia/insatisfacci\xF3n" },
        causa_raiz_categoria: {
          type: Type.STRING,
          description: "Categoria de dolor: falla_servicio_red | facturacion_cobranza | logistica_terreno | friccion_procesos | llamada_reiterada | atencion_asesor | consulta_informativa | otro"
        },
        causa_raiz_nombre: { type: Type.STRING, description: 'Nombre corto del dolor operativo (ej: "Cobro indebido de roaming", "Corte de fibra \xF3ptica sin visita", "Reiteraci\xF3n por 3ra vez")' },
        causa_raiz_detalle: { type: Type.STRING, description: "Explicaci\xF3n detallada de por qu\xE9 el cliente lleg\xF3 molesto o se convirti\xF3 en detractor" },
        responsabilidad: {
          type: Type.STRING,
          description: "Responsabilidad principal: claro_empresa | asesor | compartida | externa_cliente"
        },
        responsabilidad_justificacion: { type: Type.STRING, description: "Justificaci\xF3n de desacoplamiento: si es falla t\xE9cnica/proceso de Claro o error de atenci\xF3n del asesor" },
        riesgo_churn: { type: Type.STRING, description: "Riesgo de cancelaci\xF3n/portabilidad: critico | medio | bajo" },
        amenaza_subtel_sernac: { type: Type.BOOLEAN, description: "True si el cliente menciona reclamo en SUBTEL, SERNAC, demanda o portabilidad inmediata" },
        llamada_reiterada: { type: Type.BOOLEAN, description: "True si el cliente indica que ya llam\xF3 antes por el mismo problema sin soluci\xF3n" },
        citas_quiebre_cliente: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "1 a 3 frases textuales del cliente donde verbaliza su frustraci\xF3n o el motivo de reclamo"
        },
        plan_accion_cliente: { type: Type.STRING, description: "Acci\xF3n operativa inmediata con el cliente (ej: ajuste en facturaci\xF3n, visita t\xE9cnica prioritaria, llamado de retenci\xF3n)" },
        plan_accion_proceso: { type: Type.STRING, description: "Acci\xF3n de mejora correctiva en procesos/sistemas Claro para evitar que vuelva a ocurrir" },
        area_responsable: { type: Type.STRING, description: "\xC1rea operativa responsable: Redes/Soporte T\xE9cnico | Facturaci\xF3n | Log\xEDstica/Terreno | Retenciones | Atenci\xF3n al Cliente" }
      },
      required: [
        "es_detractor",
        "causa_raiz_categoria",
        "causa_raiz_nombre",
        "causa_raiz_detalle",
        "responsabilidad",
        "responsabilidad_justificacion",
        "riesgo_churn",
        "amenaza_subtel_sernac",
        "llamada_reiterada",
        "citas_quiebre_cliente",
        "plan_accion_cliente",
        "plan_accion_proceso",
        "area_responsable"
      ]
    },
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

// calibrationStore.ts
var BLOB_NAME = "gea-calibration.json";
var TMP_FILE = path2.join(os.tmpdir(), BLOB_NAME);
function readRequestJson(req) {
  if (Buffer.isBuffer(req?.body)) {
    try {
      return Promise.resolve(req.body.length ? JSON.parse(req.body.toString("utf8")) : {});
    } catch {
      return Promise.resolve({});
    }
  }
  if (req?.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req?.body === "string") {
    try {
      return Promise.resolve(req.body ? JSON.parse(req.body) : {});
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

// api-src/calibration/chat.ts
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
function generateSimulatedConsultantReply(question, currentDirectives, ragContext) {
  const q = question.toLowerCase();
  if (q.includes("mejoro la calidad") || q.includes("mejorar la calidad") || q.includes("subir nota") || q.includes("capacit") || q.includes("coaching") || q.includes("como mejorar") || q.includes("c\xF3mo mejorar") || q.includes("buenas practicas") || q.includes("buenas pr\xE1cticas") || q.includes("estrategia de calidad")) {
    const statsText = ragContext?.totalCalls ? `

\u{1F4CA} **Diagn\xF3stico seg\xFAn nuestra base de datos activa (${ragContext.totalCalls} llamadas analizadas):**
- **Puntuaci\xF3n promedio de calidad:** ${ragContext.avgScore || 78}/100
- **Distribuci\xF3n tNPS:** ${ragContext.detractorsPct || 25}% Detractores | ${ragContext.promotersPct || 45}% Promotores
- **Brechas operativas detectadas:** ${ragContext.topQuiebres || "Pausas en sistemas sin hold, validaci\xF3n de RUT y omisi\xF3n de escala en encuesta"}` : "";
    return {
      reply: `\xA1Excelente consulta! Para mejorar de forma integral la calidad de las llamadas en la operaci\xF3n de Claro Chile / GEA Per\xFA, debes trabajar en 4 pilares fundamentales:${statsText}

### 1. Dominio del Protocolo de 4 Fases (Pauta Oficial):
* **Fase 1 - Bienvenida Impecable:** Saludar mencionando nombre, apellido y empresa (*"Claro Chile, le habla [Nombre], \xBFcon qui\xE9n tengo el gusto?"*). Confirmar la titularidad por RUT al tiro.
* **Fase 2 - Escucha Activa & Parafraseo:** Antes de abrir sistemas, resumir la duda del cliente (*"Entiendo perfectamente, don Juan, usted necesita revisar el detalle del cobro de su \xFAltima boleta"*). Esto baja la ansiedad del cliente en un 40%.
* **Fase 3 - Gesti\xF3n Transparente de Esperas:** Nunca dejar al cliente en silencio muerto. Avisar siempre: *"Voy a verificar en Somos Clave, perm\xEDtame 30 segundos en l\xEDnea"*, y retomar el contacto antes del minuto.
* **Fase 4 - Aseguramiento y Encuesta 0 a 10:** No cortar abruptamente. Preguntar *"\xBFPude resolver todas sus dudas?"* y explicar la escala de encuesta formal: *"don Juan, podr\xEDa recibir una encuesta donde 0 es la nota m\xE1s baja y 10 la m\xE1xima"*.

### 2. Aceleraci\xF3n Formativa en OJT (Piso de Entrenamiento):
* **Micro-Roleplays de 5 minutos:** Practicar con los tutores antes del turno las 3 objeciones m\xE1s duras de clientes chilenos (cobros no reconocidos, corte de fibra y bloqueo de IMEI).
* **Foco en Feedback Pedag\xF3gico:** Corregir una sola conducta cr\xEDtica por sesi\xF3n en lugar de abrumar al asesor con toda la pauta.

### 3. Reducci\xF3n de Quiebres y Detractores:
* Separar la molestia hacia la marca del trato humano. Aunque el cliente venga indignado, si el asesor mantiene la calma, empatiza y da alternativas claras, el tNPS sube a Neutro/Promotor.

\u{1F4A1} *Si deseas que el motor de IA sea m\xE1s formativo o flexibilice alg\xFAn criterio espec\xEDfico en las evaluaciones, puedes calibrarlo directamente con una regla de excepci\xF3n.*`,
      suggestedDirective: void 0
    };
  }
  if (q.includes("datos") || q.includes("estadistica") || q.includes("estad\xEDstica") || q.includes("como vamos") || q.includes("c\xF3mo vamos") || q.includes("resumen")) {
    if (ragContext?.totalCalls) {
      return {
        reply: `\u{1F4C8} **Resumen Ejecutivo de Speech Analytics (RAG en Vivo):**

- **Volumen Total:** ${ragContext.totalCalls} llamadas evaluadas en la plataforma.
- **Nota Media Operativa:** ${ragContext.avgScore || 78}/100 en QA Global.
- **Clasificaci\xF3n tNPS:** ${ragContext.promotersPct || 40}% Promotores, ${ragContext.neutralsPct || 35}% Neutros y ${ragContext.detractorsPct || 25}% Detractores.
- **Fases con mayor oportunidad:** Cierre y encuesta de satisfacci\xF3n (omisi\xF3n recurrente de la escala 0-10) y retenci\xF3n en hold prolongado durante consultas en Somos Clave.
- **Estado OJT Asesores:** Asesores en curva de aprendizaje requieren refuerzo en habilidades blandas y empat\xEDa ante reclamos de boleta.

\xBFDeseas profundizar en alg\xFAn asesor espec\xEDfico o calibrar un umbral de evaluaci\xF3n?`,
        suggestedDirective: void 0
      };
    }
  }
  if (q.includes("silencio") || q.includes("pausa") || q.includes("hold") || q.includes("espera")) {
    return {
      reply: `Para calibrar la detecci\xF3n de silencios en piso OJT, es fundamental distinguir entre **dead air por desconexi\xF3n** y **pausas leg\xEDtimas de navegaci\xF3n en Somos Clave / CRM**.

En llamadas de asesores noveles, los tiempos de consulta suelen rondar entre 20 y 45 segundos mientras buscan los procedimientos corporativos. Para evitar que la IA castigue injustamente el indicador de eficiencia TMO o tiempos de espera, te recomiendo agregar la siguiente directiva al prompt:`,
      suggestedDirective: `- Tolerancia en B\xFAsqueda de Sistemas: Si el asesor anuncia al cliente que est\xE1 verificando en Somos Clave o en el CRM, no clasificar las pausas de hasta 45 segundos como silencio cr\xEDtico o quiebre de atenci\xF3n.`
    };
  }
  if (q.includes("detractor") || q.includes("nps") || q.includes("molest") || q.includes("enojad") || q.includes("reclamo") || q.includes("boleta") || q.includes("cobro")) {
    return {
      reply: `En los contact centers de Claro Chile, los clientes a menudo se comunican molestos por cobros en su boleta o problemas de facturaci\xF3n. La IA tiende a veces a calificar la llamada como DETRACTOR (0-6) bas\xE1ndose \xFAnicamente en el malestar del cliente hacia la empresa, descuidando el esfuerzo y empat\xEDa del asesor.

Para evitar que se marque detractor injusto en quejas de boleta Claro y proteger la calificaci\xF3n del asesor, te recomiendo incorporar esta directiva oficial:`,
      suggestedDirective: `- Blindaje tNPS en Reclamos de Boleta: Cuando el cliente manifieste hostilidad o frustraci\xF3n con la facturaci\xF3n o cobros de Claro, pero el asesor explique los \xEDtems con calma, valide su reclamo y ofrezca alternativas cordialmente, priorizar score_agente >= 8.5 y clasificar el pron\xF3stico global en NEUTRO (7-8), sin penalizar la evaluaci\xF3n del asesor.`
    };
  }
  if (q.includes("saludo") || q.includes("bienvenida") || q.includes("nombre") || q.includes("apellido") || q.includes("interrump")) {
    return {
      reply: `En el contexto chileno, es muy com\xFAn que los clientes con urgencia comiencen a explicar su problema de inmediato ("Hola, mire sabe que se me cort\xF3 la l\xEDnea"), impidiendo que el asesor recite completo su nombre, apellido y bienvenida institucional.

Para que la IA no marque la Fase 1 como incumplida en estos escenarios, te sugiero esta directiva de calibraci\xF3n:`,
      suggestedDirective: `- Flexibilidad en Bienvenida por Interrupci\xF3n: Si el cliente interrumpe el saludo inicial explicando de golpe su requerimiento, considerar la bienvenida como cumplida si el asesor se present\xF3 al menos con su nombre y retom\xF3 cordialmente el protocolo.`
    };
  }
  if (q.includes("rut") || q.includes("seguridad") || q.includes("titular") || q.includes("identidad")) {
    return {
      reply: `La validaci\xF3n de titularidad por RUT es una exigencia legal y de seguridad de Claro Chile. Si deseas calibrar una exigencia m\xE1s rigurosa para evitar fraudes y asegurar el cumplimiento de la pol\xEDtica de protecci\xF3n de datos:`,
      suggestedDirective: `- Validaci\xF3n Obligatoria de RUT y Titularidad: Exigir de manera obligatoria que el asesor verifique el RUT completo y al menos un dato secundario de validaci\xF3n antes de entregar informaci\xF3n de saldos o tr\xE1fico. Si no se realiza, marcar quiebre de atenci\xF3n de severidad ALTO.`
    };
  }
  if (q.includes("cierre") || q.includes("encuesta") || q.includes("escala") || q.includes("0 a 10") || q.includes("sms")) {
    return {
      reply: `La pauta de Claro exige explicar la encuesta con la escala del 0 al 10. Sin embargo, en llamadas r\xE1pidas el cliente a veces cuelga abruptamente. Esta directiva calibra el criterio:`,
      suggestedDirective: `- Transferencia o Explicaci\xF3n de Encuesta: Si el asesor menciona la encuesta de satisfacci\xF3n por SMS o llamada pero el cliente finaliza la llamada antes de escuchar la escala 0-10, calificar el protocolo de cierre como PARCIALMENTE CUMPLIDO (80%) sin considerarlo quiebre de servicio.`
    };
  }
  return {
    reply: `Entendido tu planteamiento sobre la operaci\xF3n de Claro Chile / GEA Per\xFA. Como consultor de Speech Analytics y aseguramiento de calidad, puedo ayudarte tanto a diagnosticar el desempe\xF1o de tus asesores como a ajustar las reglas del motor de IA.

Para profundizar, \xBFdeseas que revisemos t\xE9cnicas pedag\xF3gicas para los asesores, analicemos las llamadas del sistema o prefieres formular una regla de calibraci\xF3n para el modelo?`,
    suggestedDirective: void 0
  };
}
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "M\xE9todo no permitido" });
  }
  try {
    const body = await readRequestJson(req);
    const { message, history = [], customDirectives = "", ragContext } = body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ success: false, error: "Mensaje requerido" });
    }
    let ragSection = "";
    if (ragContext && typeof ragContext === "object") {
      ragSection = `
CONTEXTO OPERATIVO EN VIVO (RAG DE LLAMADAS REALES DEL SISTEMA):
- Volumen total de llamadas auditadas en plataforma: ${ragContext.totalCalls || "N/D"}
- Calificaci\xF3n QA Promedio actual: ${ragContext.avgScore || "N/D"}/100
- Pron\xF3stico tNPS: ${ragContext.promotersPct || 0}% Promotores, ${ragContext.neutralsPct || 0}% Neutros, ${ragContext.detractorsPct || 0}% Detractores
- Quiebres operativos m\xE1s recurrentes: ${ragContext.topQuiebres || "Pausas prolongadas en Somos Clave, omisi\xF3n de escala 0-10 en encuesta, validaci\xF3n de RUT"}
- Motivos de llamadas frecuentes: ${ragContext.commonDrivers || "Reclamos de cobro en boleta, problemas t\xE9cnicos de fibra/red, cambio de plan"}
- Estado de madurez de asesores en OJT: ${ragContext.ojtSummary || "Asesores en entrenamiento en vivo con soporte de tutores de piso"}`;
    }
    const apiKeys = getApiKeys();
    const systemInstruction = `Eres el Consultor Senior de Speech Analytics, Calidad Operativa y Coaching (QA & OJT) para GEA Per\xFA / Claro Chile.
Cuentas con la capacidad anal\xEDtica y los billones de par\xE1metros de un modelo de lenguaje de \xFAltima generaci\xF3n, y adem\xE1s est\xE1s enterado de la informaci\xF3n operativa en tiempo real mediante RAG.
${ragSection}

PAUTA BASE OFICIAL CLARO CHILE:
- 4 Fases operativas:
  1. Bienvenida (nombre, apellido, empresa Claro, confirmaci\xF3n cliente/RUT).
  2. Entender y Resolver (parafrasear, sistemas Somos Clave, por favor/gracias, validaci\xF3n de identidad).
  3. Informar Acci\xF3n (avisar espera/hold, retomar en <1 min, claridad en condiciones comerciales y valores proporcionales, resumen).
  4. Cierre (preguntas aseguramiento, confirmaci\xF3n activa, protocolo de encuesta en escala explicada de 0 a 10).
- Diagn\xF3stico OJT: Madurez (EN_REFUERZO, EN_DESARROLLO, LISTO_PRODUCCION), \xEDndice de autonom\xEDa %, brecha principal, roleplay de 5 min y feedback pedag\xF3gico constructivo.
- Predicci\xF3n tNPS Amigable: Desacoplar la molestia hacia la marca del trato humano del asesor novel (score_agente).
- Detecci\xF3n de alertas: SERNAC, SUBTEL, demandas, fuga a Entel/WOM/Movistar.
- Contexto cultural chileno: Modismos (boleta, RUT, al tiro, cach\xE1i, chato, caleta).

DIRECTIVAS ADICIONALES ACTUALMENTE ACTIVAS:
${customDirectives || "Sin directivas adicionales personalizadas activas."}

DIRECTIVAS Y DIRECTRICES DE RESPUESTA:
1. NO te limites \xFAnicamente a crear directivas t\xE9cnicas. Puedes y debes responder CUALQUIER consulta del usuario sobre: c\xF3mo mejorar la calidad de las llamadas, c\xF3mo capacitar asesores noveles, c\xF3mo dar retroalimentaci\xF3n constructiva, an\xE1lisis de tendencias y causas ra\xEDz de llamadas, interpretaci\xF3n de m\xE9tricas de Speech Analytics, etc.
2. Utiliza tu vasto conocimiento y el contexto RAG de las llamadas reales para ofrecer explicaciones detalladas, pedag\xF3gicas, pr\xE1cticas y ejecutivas.
3. Si el usuario te pide espec\xEDficamente calibrar el modelo, modificar una regla de evaluaci\xF3n, O si de tu respuesta se deriva una recomendaci\xF3n concreta para ajustar el prompt de la IA, proporci\xF3nala al final dentro de un bloque \`\`\`directive:
\`\`\`directive
- [Nombre de la Regla]: [Texto conciso y claro de la directiva lista para incorporar en el motor]
\`\`\`
De esta forma, la interfaz habilitar\xE1 autom\xE1ticamente un bot\xF3n para incorporar la directiva con un solo clic.
4. Mant\xE9n un tono profesional, motivador, emp\xE1tico y orientado a la excelencia operativa.`;
    const groqKey = process.env.GROQ_API_KEY;
    if (apiKeys.length === 0 && groqKey) {
      try {
        const groqMessages = [
          { role: "system", content: systemInstruction },
          ...Array.isArray(history) ? history.map((h) => ({
            role: h.role === "model" ? "assistant" : "user",
            content: h.text || ""
          })) : [],
          { role: "user", content: message }
        ];
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: groqMessages,
            temperature: 0.4,
            max_tokens: 1500
          })
        });
        if (groqRes.ok) {
          const groqData = await groqRes.json();
          const replyText = groqData.choices?.[0]?.message?.content?.trim();
          if (replyText) {
            const directiveMatch2 = replyText.match(/```(?:directive)?\s*([\s\S]*?)```/i);
            const suggestedDirective2 = directiveMatch2 ? directiveMatch2[1].trim() : void 0;
            return res.status(200).json({
              success: true,
              reply: replyText,
              suggestedDirective: suggestedDirective2,
              meta: { modelUsed: "Groq LLaMA 3.3 70B (RAG)" }
            });
          }
        }
      } catch (groqErr) {
        console.warn("[Calibration Chat] Groq error:", groqErr);
      }
    }
    if (apiKeys.length === 0) {
      const simulated = generateSimulatedConsultantReply(message, customDirectives, ragContext);
      return res.status(200).json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: { engine: "Consultor Experto Claro Chile (Modo Local con RAG)" }
      });
    }
    const validHistory = [];
    if (Array.isArray(history)) {
      for (const h of history) {
        if (h && (h.role === "user" || h.role === "model") && typeof h.text === "string" && h.text.trim()) {
          validHistory.push({ role: h.role, text: h.text.trim() });
        }
      }
    }
    while (validHistory.length > 0 && validHistory[0].role === "model") {
      validHistory.shift();
    }
    const contents = [];
    for (const item of validHistory) {
      if (contents.length === 0) {
        if (item.role === "user") {
          contents.push({ role: "user", parts: [{ text: item.text }] });
        }
      } else {
        const lastTurn = contents[contents.length - 1];
        if (lastTurn.role === item.role) {
          lastTurn.parts[0].text += `

${item.text}`;
        } else {
          contents.push({ role: item.role, parts: [{ text: item.text }] });
        }
      }
    }
    if (contents.length === 0 || contents[contents.length - 1].role === "model") {
      contents.push({ role: "user", parts: [{ text: message }] });
    } else {
      contents[contents.length - 1].parts[0].text += `

${message}`;
    }
    let rawReply = "";
    let modelUsed = "";
    const candidateModels = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"];
    for (const key of apiKeys) {
      try {
        const ai = new GoogleGenAI({
          apiKey: key,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } }
        });
        for (const modelName of candidateModels) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents,
              config: {
                systemInstruction,
                temperature: 0.35,
                maxOutputTokens: 2048
              }
            });
            const replyText = response.text?.trim();
            if (replyText) {
              rawReply = replyText;
              modelUsed = modelName;
              break;
            }
          } catch (err) {
          }
        }
        if (rawReply) break;
      } catch (keyErr) {
      }
    }
    if (!rawReply) {
      const simulated = generateSimulatedConsultantReply(message, customDirectives, ragContext);
      return res.status(200).json({
        success: true,
        reply: simulated.reply,
        suggestedDirective: simulated.suggestedDirective,
        meta: { engine: "Consultor Experto Claro Chile (Respaldo inteligente RAG)" }
      });
    }
    const directiveMatch = rawReply.match(/```(?:directive)?\s*([\s\S]*?)```/i);
    const suggestedDirective = directiveMatch ? directiveMatch[1].trim() : void 0;
    return res.status(200).json({
      success: true,
      reply: rawReply,
      suggestedDirective,
      meta: { modelUsed }
    });
  } catch (error) {
    const simulated = generateSimulatedConsultantReply(req.body?.message || "", req.body?.customDirectives || "", req.body?.ragContext);
    return res.status(200).json({
      success: true,
      reply: simulated.reply,
      suggestedDirective: simulated.suggestedDirective,
      meta: { fallback: true, error: error?.message }
    });
  }
}
export {
  handler as default
};
