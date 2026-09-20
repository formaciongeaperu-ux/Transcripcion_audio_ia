export type MotivoCategoria = 'soporte' | 'ventas' | 'reclamos' | 'bajas' | 'facturacion';
export type SentimientoTipo = 'Positivo' | 'Neutro' | 'Negativo';
export type NPSClasificacion = 'DETRACTOR' | 'NEUTRO' | 'PROMOTOR';
export type SilencioNivel = 'ÓPTIMO' | 'MODERADO' | 'CRÍTICO';
export type SeveridadQuiebre = 'CRÍTICO' | 'ALTO' | 'MEDIO';

export type OjtMadurez = 'EN_REFUERZO' | 'EN_DESARROLLO' | 'LISTO_PRODUCCION';
export type OjtBrecha = 'PROCEDIMIENTO_GUION' | 'HERRAMIENTA_SISTEMAS' | 'HABILIDADES_BLANDAS' | 'NINGUNA_DOMINIO';

export interface DiagnosticoOJT {
  nivel_madurez: OjtMadurez;
  indice_autonomia: number; // 0 a 100% de independencia en piso real
  brecha_principal: OjtBrecha;
  requiere_intervencion_tutor: boolean;
  roleplay_sugerido: string; // Ejercicio o simulación de 5 min para el tutor OJT
  feedback_pedagogico: string; // Recomendación constructiva orientada a acelerar la curva de aprendizaje
  observacion_piso_real: string; // Cómo se desenvolvió ante el cliente chileno real en piso
}

export interface CriterioEvaluacion {
  nota: number; // 0-100
  diagnostico: string;
}

export interface EvaluacionCriterios {
  amabilidad_empatia: CriterioEvaluacion;
  seguridad_expresarse: CriterioEvaluacion;
  claridad_informacion: CriterioEvaluacion;
  tiempos_espera_hold: CriterioEvaluacion;
  eficiencia_tmo: CriterioEvaluacion;
}

export interface FaseBienvenida {
  generar_experiencia_positiva: boolean;
  mencionar_empresa_claro: boolean;
  mencionar_nombre_apellido: boolean;
  confirmar_nombre_cliente_rut_celular: boolean;
  porcentaje?: number;
}

export interface FaseEntenderResolver {
  parafrasear_problema: boolean;
  ordenar_multiples_requerimientos: boolean;
  utilizar_sistemas_oficiales_somos_clave: boolean;
  cortesia_por_favor_gracias: boolean;
  validacion_identidad: boolean;
  porcentaje?: number;
}

export interface FaseInformarAccion {
  indicar_gestion_espera: boolean;
  retomar_en_menos_de_un_minuto: boolean;
  claridad_condiciones_comerciales: boolean;
  resumen_atencion_gestion: boolean;
  porcentaje?: number;
}

export interface FaseCierre {
  preguntas_aseguramiento: boolean;
  esperar_confirmacion_cliente: boolean;
  guion_encuesta_escala_0_a_10: boolean;
  porcentaje?: number;
}

export interface CumplimientoGuionFases {
  bienvenida: FaseBienvenida;
  entender_resolver: FaseEntenderResolver;
  informar_accion: FaseInformarAccion;
  cierre: FaseCierre;
}

export interface CumplimientoGuion {
  // 4 Fases oficiales de pauta de atención Claro Chile
  fases?: CumplimientoGuionFases;
  porcentaje_total?: number;
  observaciones_auditoria?: string;

  // Campos de compatibilidad directa
  saludo_institucional: boolean;
  verificacion_identidad: boolean;
  escucha_activa: boolean;
  entrega_ticket_subtel: boolean;
  despedida_cordial: boolean;
  ofrecimiento_ayuda?: boolean;
  politica_privacidad?: boolean;
}

export interface QuiebreAtencion {
  id: string;
  tiempo: string; // ej: "03:42" o "08:07"
  segundo: number;
  tipo: string; // ej: "Tono condescendiente", "Interrupción al cliente", "Información errónea de tarifa"
  cita: string;
  severidad: SeveridadQuiebre;
  impacto_cliente: string;
}

export interface SegmentoDialogo {
  id: string;
  hablante: 'agente' | 'cliente';
  inicio: number; // segundos
  fin: number; // segundos
  texto: string;
  sentimientoScore: number; // -1.0 a 1.0
}

export interface NPSPronostico {
  score: number; // 0 a 10 (tNPS Transaccional Equilibrado)
  score_agente?: number; // 0 a 10 (Apreciación del trato humano, paciencia y esfuerzo del asesor OJT)
  clasificacion: NPSClasificacion;
  pregunta: string;
  escala: string;
  justificacion: string;
  factor_marca_vs_agente?: string; // Diferenciación: Molestia de fondo con Claro vs Trato humano del asesor
  camino_a_promotor?: string; // Tip formativo OJT para convertir al cliente en Promotor (9-10)
}

/**
 * Normaliza y valida la clasificación tNPS de forma resiliente
 * Garantiza que llamadas de alta calidad (QA >= 85%) o notas 9-10 cuenten correctamente como PROMOTOR
 */
export function getNormalizedNPS(
  nps?: { score?: number; clasificacion?: string } | null,
  qaScore?: number
): NPSClasificacion {
  if (!nps) {
    if (typeof qaScore === 'number' && qaScore >= 85) return 'PROMOTOR';
    return 'NEUTRO';
  }

  const raw = String(nps.clasificacion || '').toUpperCase().trim();
  const score = typeof nps.score === 'number' ? nps.score : null;

  // Si la nota numérica es 9 o 10, es PROMOTOR por definición
  if (score !== null && score >= 9) return 'PROMOTOR';
  // Si la nota numérica es <= 6, es DETRACTOR
  if (score !== null && score <= 6) return 'DETRACTOR';

  // Si contiene explícitamente PROMOTOR / PROMOTER
  if (raw.includes('PROMOTOR') || raw.includes('PROMOTER')) return 'PROMOTOR';
  if (raw.includes('DETRACTOR')) return 'DETRACTOR';

  // Si el QA es sobresaliente (>= 85%) y no hubo detracciones críticas, clasificar como PROMOTOR
  if (typeof qaScore === 'number' && qaScore >= 85 && (score === null || score >= 7)) {
    return 'PROMOTOR';
  }

  if (raw.includes('NEUTRO') || raw.includes('PASIVO') || raw.includes('NEUTRAL')) return 'NEUTRO';

  return 'NEUTRO';
}

export interface SilencioAnalisis {
  duracion_total_segundos: number;
  tiempo_ivr_segundos: number; // Previo a la atención del agente
  tiempo_agente_segundos: number; // Duración efectiva con el agente
  silencio_agente_segundos: number; // Dead air / silencio durante atención
  porcentaje_silencio: number; // % respecto al tiempo del agente
  nivel_silencio: SilencioNivel;
  diagnostico_silencio: string;
}

export interface FeedbackCoaching {
  fortalezas: string[];
  oportunidades_mejora: string[];
  guion_sugerido_alternativo: string;
  plan_accion: string;
}

export interface CallRecord {
  id: string;
  codigo_llamada: string; // Ej: "CALL-2026-8941"
  fecha_hora: string;
  agente_nombre: string;
  agente_id: string;
  cliente_nombre: string;
  cliente_telefono: string;
  cola_atencion: string; // Ej: "Exclusivo Postpago Chile", "Soporte Hogar", "Retenciones"
  duracion_total: string; // Ej: "08:45"
  duracion_segundos: number;
  qa_score_global: number; // 0-100%
  resumen: string;
  motivo_categoria: MotivoCategoria;
  motivo_nombre: string;
  sentimiento_score: number; // -1.0 a 1.0
  sentimiento_label: SentimientoTipo;
  csat_estimado: number; // 1 a 5
  resolucion_primer_contacto: boolean;
  evaluacion_criterios: EvaluacionCriterios;
  cumplimiento_guion: CumplimientoGuion;
  nps_pronostico: NPSPronostico;
  diagnostico_ojt?: DiagnosticoOJT;
  silencio_analisis: SilencioAnalisis;
  quiebres_atencion: QuiebreAtencion[];
  feedback_coaching: FeedbackCoaching;
  keywords: string[];
  alertas: string[];
  segmentos: SegmentoDialogo[];
  transcripcion?: {
    segmentos: SegmentoDialogo[];
  };
  audio_url?: string;
  audioFile?: File;
  file_name?: string;
  file_size_kb?: number;
  modelo_procesado?: string;
  fecha_analisis?: string;
}

export interface UploadItem {
  id: string;
  file: File;
  originalSize: number;
  optimizedSize?: number;
  progress: number;
  status: 'pending' | 'optimizing' | 'processing' | 'completed' | 'deferred' | 'error';
  errorMessage?: string;
  resultRecord?: CallRecord;
  agentId?: string;
  agentName?: string;
}

export interface QueueItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  audioBlob?: Blob;
  status: 'pending' | 'processing' | 'optimizing' | 'completed' | 'deferred' | 'failed';
  attempts: number;
  currentModel: string;
  lastError?: string;
  retryAfterTimestamp?: number;
  progressPercent: number;
  result?: CallRecord;
}

export interface FilterState {
  search: string;
  agente: string;
  cola: string;
  motivo: string;
  sentimiento: string;
  npsClasificacion: string;
  qaMin: number;
  qaMax: number;
  dateRange: 'all' | 'today' | 'week' | 'month';
}

export interface SensitivitySettings {
  silenceToleranceSeconds: number;
  detractorStrictness: 'flexible' | 'equilibrada' | 'estricta';
  chileanSlangTolerance: boolean;
  ojtPedagogicalFocus: boolean;
}

export interface CalibrationData {
  basePrompt: string;
  customDirectives: string;
  sensitivitySettings: SensitivitySettings;
  version: string;
  updatedAt: string;
}

export interface CalibrationChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedDirective?: string;
}

export type UserRole = 'super_admin' | 'supervisor' | 'qa_auditor' | 'agent';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  agent_id?: string;
  campana?: string;
  avatar_url?: string;
  created_at?: string;
}
