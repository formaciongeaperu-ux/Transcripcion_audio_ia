export type MotivoCategoria = 'soporte' | 'ventas' | 'reclamos' | 'bajas' | 'facturacion';
export type SentimientoTipo = 'Positivo' | 'Neutro' | 'Negativo';
export type NPSClasificacion = 'DETRACTOR' | 'NEUTRO' | 'PROMOTOR';
export type SilencioNivel = 'ÓPTIMO' | 'MODERADO' | 'CRÍTICO';
export type SeveridadQuiebre = 'CRÍTICO' | 'ALTO' | 'MEDIO';

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

export interface CumplimientoGuion {
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
  score: number; // 0 a 10
  clasificacion: NPSClasificacion;
  pregunta: string;
  escala: string;
  justificacion: string;
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
