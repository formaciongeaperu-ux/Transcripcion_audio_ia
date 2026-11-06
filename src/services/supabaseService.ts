import { createClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { CallRecord, UserProfile, UserRole } from '../types';

/**
 * Normaliza y mapea un registro proveniente de Supabase a la interfaz CallRecord
 */
export function mapDbToCallRecord(row: any): CallRecord {
  return {
    id: row.id,
    codigo_llamada: row.codigo_llamada || `CALL-${row.id.slice(-6)}`,
    fecha_hora: row.fecha_hora || new Date().toISOString(),
    agente_nombre: row.agente_nombre || 'Asesor Claro',
    agente_id: row.agente_id || 'AG-000',
    cliente_nombre: row.cliente_nombre || 'Cliente Claro',
    cliente_telefono: row.cliente_telefono || '+56 9 **** ****',
    cola_atencion: row.cola_atencion || 'Atención General Claro',
    duracion_total: row.duracion_total || '00:00',
    duracion_segundos: Number(row.duracion_segundos || 0),
    qa_score_global: Number(row.qa_score_global || 0),
    resumen: row.resumen || '',
    motivo_categoria: row.motivo_categoria || 'soporte',
    motivo_nombre: row.motivo_nombre || 'Consulta General',
    sentimiento_score: Number(row.sentimiento_score || 0),
    sentimiento_label: row.sentimiento_label || 'Neutro',
    csat_estimado: Number(row.csat_estimado || 4),
    resolucion_primer_contacto: Boolean(row.resolucion_primer_contacto ?? true),
    evaluacion_criterios: {
      amabilidad_empatia: {
        nota: Number(row.evaluacion_criterios?.amabilidad_empatia?.nota ?? 80),
        diagnostico: row.evaluacion_criterios?.amabilidad_empatia?.diagnostico || row.evaluacion_criterios?.amabilidad_empatia?.observaciones || 'Atención cordial'
      },
      seguridad_expresarse: {
        nota: Number(row.evaluacion_criterios?.seguridad_expresarse?.nota ?? row.evaluacion_criterios?.seguridad_conocimiento?.nota ?? 80),
        diagnostico: row.evaluacion_criterios?.seguridad_expresarse?.diagnostico || row.evaluacion_criterios?.seguridad_conocimiento?.observaciones || 'Conocimiento adecuado'
      },
      claridad_informacion: {
        nota: Number(row.evaluacion_criterios?.claridad_informacion?.nota ?? row.evaluacion_criterios?.claridad_lenguaje?.nota ?? 80),
        diagnostico: row.evaluacion_criterios?.claridad_informacion?.diagnostico || row.evaluacion_criterios?.claridad_lenguaje?.observaciones || 'Explicación comprensible'
      },
      tiempos_espera_hold: {
        nota: Number(row.evaluacion_criterios?.tiempos_espera_hold?.nota ?? row.evaluacion_criterios?.gestion_tiempos_hold?.nota ?? 80),
        diagnostico: row.evaluacion_criterios?.tiempos_espera_hold?.diagnostico || row.evaluacion_criterios?.gestion_tiempos_hold?.observaciones || 'Tiempos de espera adecuados'
      },
      eficiencia_tmo: {
        nota: Number(row.evaluacion_criterios?.eficiencia_tmo?.nota ?? row.evaluacion_criterios?.adherencia_pauta_tmo?.nota ?? 80),
        diagnostico: row.evaluacion_criterios?.eficiencia_tmo?.diagnostico || row.evaluacion_criterios?.adherencia_pauta_tmo?.observaciones || 'Resolución dentro de parámetros esperados'
      }
    },
    cumplimiento_guion: row.cumplimiento_guion?.fases ? row.cumplimiento_guion : {
      fases: {
        bienvenida: { generar_experiencia_positiva: true, mencionar_empresa_claro: true, mencionar_nombre_apellido: true, confirmar_nombre_cliente_rut_celular: true, porcentaje: 100 },
        entender_resolver: { parafrasear_problema: true, ordenar_multiples_requerimientos: true, utilizar_sistemas_oficiales_somos_clave: true, cortesia_por_favor_gracias: true, validacion_identidad: true, porcentaje: 100 },
        informar_accion: { indicar_gestion_espera: true, retomar_en_menos_de_un_minuto: true, claridad_condiciones_comerciales: true, resumen_atencion_gestion: true, porcentaje: 100 },
        cierre: { preguntas_aseguramiento: true, esperar_confirmacion_cliente: true, guion_encuesta_escala_0_a_10: true, porcentaje: 100 }
      },
      porcentaje_total: Number(row.cumplimiento_guion?.porcentaje_total ?? 100),
      observaciones_auditoria: row.cumplimiento_guion?.observaciones_auditoria || 'Pauta evaluada adecuadamente.',
      saludo_institucional: Boolean(row.cumplimiento_guion?.saludo_institucional ?? true),
      verificacion_identidad: Boolean(row.cumplimiento_guion?.verificacion_identidad ?? true),
      escucha_activa: Boolean(row.cumplimiento_guion?.escucha_activa ?? true),
      entrega_ticket_subtel: Boolean(row.cumplimiento_guion?.entrega_ticket_subtel ?? true),
      despedida_cordial: Boolean(row.cumplimiento_guion?.despedida_cordial ?? true),
      ofrecimiento_ayuda: Boolean(row.cumplimiento_guion?.ofrecimiento_ayuda ?? true),
      politica_privacidad: Boolean(row.cumplimiento_guion?.politica_privacidad ?? true)
    },
    nps_pronostico: row.nps_pronostico || {
      score: 8,
      score_agente: 9,
      clasificacion: 'NEUTRO',
      pregunta: '',
      escala: '',
      justificacion: '',
      factor_marca_vs_agente: '',
      camino_a_promotor: ''
    },
    diagnostico_ojt: row.diagnostico_ojt,
    diagnostico_operaciones: row.diagnostico_operaciones || (row.causa_raiz_categoria ? {
      es_detractor: (row.nps_pronostico?.score ?? 10) <= 6 || row.nps_pronostico?.clasificacion === 'DETRACTOR',
      causa_raiz_categoria: row.causa_raiz_categoria,
      causa_raiz_nombre: row.causa_raiz_nombre || 'Causa Raíz Operaciones',
      causa_raiz_detalle: row.causa_raiz_detalle || row.resumen || '',
      responsabilidad: row.responsabilidad || 'claro_empresa',
      responsabilidad_justificacion: row.responsabilidad_justificacion || '',
      riesgo_churn: row.riesgo_churn || 'medio',
      amenaza_subtel_sernac: Boolean(row.amenaza_subtel_sernac),
      llamada_reiterada: Boolean(row.llamada_reiterada),
      citas_quiebre_cliente: Array.isArray(row.citas_quiebre_cliente) ? row.citas_quiebre_cliente : [],
      plan_accion_cliente: row.plan_accion_cliente || '',
      plan_accion_proceso: row.plan_accion_proceso || '',
      area_responsable: row.area_responsable || 'Operaciones'
    } : (row.nps_pronostico?.diagnostico_operaciones || undefined)),
    estado_gestion: row.estado_gestion || 'pendiente',
    accion_inmediata: row.accion_inmediata || '',
    responsable_operaciones: row.responsable_operaciones || '',
    resultado_fidelizacion: row.resultado_fidelizacion || '',
    comentarios_seguimiento: row.comentarios_seguimiento || '',
    fecha_gestion: row.fecha_gestion || undefined,
    silencio_analisis: row.silencio_analisis || {
      duracion_total_segundos: row.duracion_segundos || 0,
      tiempo_silencio_segundos: 0,
      porcentaje_silencio: 0,
      nivel_silencio: 'OPTIMO',
      pausas_prolongadas: [],
      diagnostico_silencio: 'Pausas dentro de rango esperado.'
    },
    quiebres_atencion: Array.isArray(row.quiebres_atencion) ? row.quiebres_atencion : [],
    feedback_coaching: row.feedback_coaching || {
      fortalezas: [],
      oportunidades_mejora: [],
      guion_sugerido_alternativo: '',
      plan_accion: ''
    },
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    alertas: Array.isArray(row.alertas) ? row.alertas : [],
    segmentos: Array.isArray(row.segmentos) ? row.segmentos : [],
    transcripcion: {
      segmentos: Array.isArray(row.segmentos) ? row.segmentos : []
    },
    audio_url: row.audio_url || undefined,
    file_name: row.file_name || undefined,
    file_size_kb: row.file_size_kb || undefined,
    modelo_procesado: row.modelo_procesado || undefined,
    fecha_analisis: row.created_at || row.fecha_hora
  };
}

/**
 * Transforma un CallRecord a los campos de la tabla en Supabase (call_records u operaciones_call_records)
 */
export function mapCallRecordToDb(
  record: CallRecord, 
  userId?: string, 
  targetTable: 'call_records' | 'operaciones_call_records' = 'call_records'
) {
  // Limpiamos referencias pesadas o campos transitorios de cliente (como audioFile File object)
  const segmentosClean = (record.segmentos || []).map(seg => ({
    id: seg.id,
    hablante: seg.hablante,
    inicio: seg.inicio,
    fin: seg.fin,
    texto: seg.texto,
    sentimientoScore: seg.sentimientoScore
  }));

  if (targetTable === 'operaciones_call_records') {
    // Si el ID generado no es un UUID válido (ej: 'call-1793...'), garantizamos un UUID válido para Supabase
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.id);
    const validId = isUuid
      ? record.id
      : (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : record.id);
    record.id = validId;

    return {
      id: validId,
      codigo_llamada: record.codigo_llamada || `CALL-${validId.slice(-6)}`,
      fecha_hora: record.fecha_hora || new Date().toISOString(),
      agente_nombre: record.agente_nombre || 'Asesor Claro',
      agente_id: record.agente_id || 'AG-000',
      cliente_nombre: record.cliente_nombre || 'Cliente Claro',
      cliente_telefono: record.cliente_telefono || '+56 9 **** ****',
      cola_atencion: record.cola_atencion || 'Atención General Claro',
      duracion_total: record.duracion_total || '00:00',
      duracion_segundos: Math.round(Number(record.duracion_segundos) || 0),
      qa_score_global: Math.round(Number(record.qa_score_global) || 0),
      csat_estimado: Math.round(Number(record.csat_estimado) || 4),
      nps_pronostico: record.nps_pronostico,
      resolucion_primer_contacto: record.resolucion_primer_contacto ?? true,
      sentimiento_score: Number.isFinite(Number(record.sentimiento_score)) ? Number(record.sentimiento_score) : 0,
      sentimiento_label: record.sentimiento_label || 'Neutro',
      resumen: record.resumen || '',
      motivo_categoria: record.motivo_categoria || 'soporte',
      motivo_nombre: record.motivo_nombre || 'Consulta General',
      causa_raiz_categoria: record.diagnostico_operaciones?.causa_raiz_categoria || 'falla_servicio_red',
      causa_raiz_nombre: record.diagnostico_operaciones?.causa_raiz_nombre || 'Falla Técnica / Red & Fibra',
      causa_raiz_detalle: record.diagnostico_operaciones?.causa_raiz_detalle || record.resumen || '',
      responsabilidad: record.diagnostico_operaciones?.responsabilidad || 'claro_empresa',
      responsabilidad_justificacion: record.diagnostico_operaciones?.responsabilidad_justificacion || '',
      riesgo_churn: record.diagnostico_operaciones?.riesgo_churn || 'medio',
      amenaza_subtel_sernac: Boolean(record.diagnostico_operaciones?.amenaza_subtel_sernac),
      llamada_reiterada: Boolean(record.diagnostico_operaciones?.llamada_reiterada),
      citas_quiebre_cliente: record.diagnostico_operaciones?.citas_quiebre_cliente || [],
      estado_gestion: record.estado_gestion || 'pendiente',
      accion_inmediata: record.accion_inmediata || null,
      responsable_operaciones: record.responsable_operaciones || null,
      resultado_fidelizacion: record.resultado_fidelizacion || null,
      comentarios_seguimiento: record.comentarios_seguimiento || null,
      fecha_gestion: record.fecha_gestion || null,
      segmentos: segmentosClean,
      alertas: record.alertas || [],
      quiebres_atencion: record.quiebres_atencion || [],
      file_name: record.file_name || null,
      ...(userId ? { user_id: userId } : {}),
      updated_at: new Date().toISOString()
    };
  }

  return {
    id: record.id,
    codigo_llamada: record.codigo_llamada || `CALL-${record.id.slice(-6)}`,
    fecha_hora: record.fecha_hora || new Date().toISOString(),
    agente_nombre: record.agente_nombre || 'Asesor Claro',
    agente_id: record.agente_id || 'AG-000',
    cliente_nombre: record.cliente_nombre || 'Cliente Claro',
    cliente_telefono: record.cliente_telefono || '+56 9 **** ****',
    cola_atencion: record.cola_atencion || 'Atención General Claro',
    duracion_total: record.duracion_total || '00:00',
    duracion_segundos: Math.round(Number(record.duracion_segundos) || 0),
    qa_score_global: Math.round(Number(record.qa_score_global) || 0),
    resumen: record.resumen || '',
    motivo_categoria: record.motivo_categoria || 'soporte',
    motivo_nombre: record.motivo_nombre || 'Consulta General',
    sentimiento_score: Number.isFinite(Number(record.sentimiento_score)) ? Number(record.sentimiento_score) : 0,
    sentimiento_label: record.sentimiento_label || 'Neutro',
    csat_estimado: Math.round(Number(record.csat_estimado) || 4),
    resolucion_primer_contacto: record.resolucion_primer_contacto ?? true,
    evaluacion_criterios: record.evaluacion_criterios,
    cumplimiento_guion: record.cumplimiento_guion,
    nps_pronostico: record.diagnostico_operaciones
      ? { ...record.nps_pronostico, diagnostico_operaciones: record.diagnostico_operaciones }
      : record.nps_pronostico,
    diagnostico_ojt: record.diagnostico_ojt || null,
    diagnostico_operaciones: record.diagnostico_operaciones || null,
    silencio_analisis: record.silencio_analisis,
    quiebres_atencion: record.quiebres_atencion || [],
    feedback_coaching: record.feedback_coaching,
    keywords: record.keywords || [],
    alertas: record.alertas || [],
    segmentos: segmentosClean,
    audio_url: record.audio_url && !record.audio_url.startsWith('blob:') && !record.audio_url.startsWith('data:')
      ? record.audio_url
      : null,
    file_name: record.file_name || null,
    file_size_kb: record.file_size_kb == null ? null : Math.round(Number(record.file_size_kb) || 0),
    modelo_procesado: record.modelo_procesado || 'Groq + Llama 3.3',
    ...(userId ? { auditor_id: userId } : {}),
    updated_at: new Date().toISOString()
  };
}

/**
 * Columnas ligeras para el listado y métricas (excluye `segmentos` y matrices pesadas para reducir 99% el Egress)
 */
export const CALL_RECORDS_LIST_COLUMNS = [
  'id',
  'codigo_llamada',
  'fecha_hora',
  'agente_nombre',
  'agente_id',
  'cliente_nombre',
  'cliente_telefono',
  'cola_atencion',
  'duracion_total',
  'duracion_segundos',
  'qa_score_global',
  'resumen',
  'motivo_categoria',
  'motivo_nombre',
  'sentimiento_score',
  'sentimiento_label',
  'csat_estimado',
  'resolucion_primer_contacto',
  'nps_pronostico',
  'diagnostico_ojt',
  'file_name',
  'file_size_kb',
  'modelo_procesado',
  'created_at',
  'updated_at'
].join(',');

export const OPERACIONES_CALL_RECORDS_LIST_COLUMNS = [
  'id',
  'codigo_llamada',
  'fecha_hora',
  'agente_nombre',
  'agente_id',
  'cliente_nombre',
  'cliente_telefono',
  'cola_atencion',
  'duracion_total',
  'duracion_segundos',
  'qa_score_global',
  'resumen',
  'motivo_categoria',
  'motivo_nombre',
  'sentimiento_score',
  'sentimiento_label',
  'csat_estimado',
  'resolucion_primer_contacto',
  'nps_pronostico',
  'causa_raiz_categoria',
  'causa_raiz_nombre',
  'causa_raiz_detalle',
  'responsabilidad',
  'responsabilidad_justificacion',
  'riesgo_churn',
  'amenaza_subtel_sernac',
  'llamada_reiterada',
  'citas_quiebre_cliente',
  'estado_gestion',
  'accion_inmediata',
  'responsable_operaciones',
  'resultado_fidelizacion',
  'comentarios_seguimiento',
  'fecha_gestion',
  'file_name',
  'created_at',
  'updated_at'
].join(',');

/**
 * Obtiene todas las llamadas almacenadas en Supabase de forma incremental y ligera (Ultra-bajo Egress).
 */
export interface FetchCallsOptions {
  since?: string;
  limit?: number;
  targetTable?: 'call_records' | 'operaciones_call_records';
}

export async function fetchCallRecordsFromSupabase(
  options?: FetchCallsOptions
): Promise<{ data: CallRecord[] | null; error: Error | null }> {
  try {
    const targetTable = options?.targetTable || 'call_records';
    const selectCols = targetTable === 'operaciones_call_records'
      ? OPERACIONES_CALL_RECORDS_LIST_COLUMNS
      : CALL_RECORDS_LIST_COLUMNS;

    const maxRecords = options?.limit ?? (options?.since ? 1000 : 5000);
    const pageSize = 1000;
    let allRows: any[] = [];
    let from = 0;

    while (from < maxRecords) {
      const to = Math.min(from + pageSize - 1, maxRecords - 1);
      let query = supabase
        .from(targetTable)
        .select(selectCols)
        .order('fecha_hora', { ascending: false })
        .range(from, to);

      if (options?.since) {
        query = query.gt('updated_at', options.since);
      }

      const res = await query;
      let pageRows: any[] = (res.data as any[]) || [];

      if (res.error) {
        console.warn(`[Supabase] Aviso en select de ${targetTable}, reintentando fallback:`, res.error.message);
        let fallbackQuery = supabase
          .from(targetTable)
          .select('*')
          .order('fecha_hora', { ascending: false })
          .range(from, to);
        if (options?.since) {
          fallbackQuery = fallbackQuery.gt('updated_at', options.since);
        }
        const fallbackRes = await fallbackQuery;
        if (fallbackRes.error) {
          if (allRows.length > 0) break;
          return { data: null, error: new Error(fallbackRes.error.message) };
        }
        pageRows = (fallbackRes.data as any[]) || [];
      }

      if (!pageRows || pageRows.length === 0) break;
      allRows.push(...pageRows);
      if (pageRows.length < (to - from + 1)) break;
      from += pageSize;
    }

    return { data: allRows.map(mapDbToCallRecord), error: null };
  } catch (err: any) {
    console.error('[Supabase] Excepción en fetchCallRecordsFromSupabase:', err);
    return { data: null, error: err };
  }
}

/**
 * Descarga bajo demanda el detalle COMPLETO de una única llamada (incluye transcripción 'segmentos' y guion).
 * Se ejecuta únicamente cuando el usuario hace clic en una grabación específica, ahorrando el 99% de Egress.
 */
export async function fetchCallRecordDetailFromSupabase(
  callId: string,
  targetTable: 'call_records' | 'operaciones_call_records' = 'call_records'
): Promise<{ data: CallRecord | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from(targetTable)
      .select('*')
      .eq('id', callId)
      .maybeSingle();

    if (error) {
      console.error(`[Supabase] Error al cargar detalle de llamada ${callId} (${targetTable}):`, error);
      return { data: null, error: new Error(error.message) };
    }
    if (!data) return { data: null, error: null };
    return { data: mapDbToCallRecord(data), error: null };
  } catch (err: any) {
    console.error(`[Supabase] Excepción en fetchCallRecordDetailFromSupabase:`, err);
    return { data: null, error: err };
  }
}

/**
 * Guarda o actualiza un registro de llamada en Supabase
 */
async function writeCallRecord(
  payload: Record<string, unknown>,
  targetTable: 'call_records' | 'operaciones_call_records' = 'call_records'
): Promise<{ success: boolean; error: Error | null }> {
  const inserted = await supabase.from(targetTable).insert(payload);

  if (!inserted.error) return { success: true, error: null };

  // La fila ya existe: queda en la base aunque esta sesión no pueda actualizarla.
  if (inserted.error.code === '23505') return { success: true, error: null };

  const message = inserted.error.message || '';

  // Fallback para call_records estándar
  if (targetTable === 'call_records' && (/diagnostico_operaciones/i.test(message) || (payload.auditor_id && /auditor_id/i.test(message)))) {
    const sanitized = { ...payload };
    if (/diagnostico_operaciones/i.test(message)) delete sanitized.diagnostico_operaciones;
    if (payload.auditor_id && /auditor_id/i.test(message)) delete sanitized.auditor_id;

    const retried = await supabase.from(targetTable).insert(sanitized);
    if (!retried.error || retried.error.code === '23505') return { success: true, error: null };
    console.error('[Supabase] Error tras reintento sanitizado:', retried.error);
    return { success: false, error: new Error(retried.error.message) };
  }

  console.error(`[Supabase] Error al guardar en ${targetTable}:`, inserted.error);
  return { success: false, error: new Error(message) };
}

export async function saveCallRecordToSupabase(
  record: CallRecord, 
  userId?: string,
  targetTable: 'call_records' | 'operaciones_call_records' = 'call_records'
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const dbPayload = mapCallRecordToDb(record, userId, targetTable);
    return await writeCallRecord(dbPayload, targetTable);
  } catch (err: any) {
    console.error(`[Supabase] Excepción en saveCallRecordToSupabase (${targetTable}):`, err);
    return { success: false, error: err };
  }
}

/**
 * Actualiza el estado de fidelización de una llamada en operaciones_call_records (Action Tracker)
 */
export async function updateOperationsManagementStatus(
  callId: string,
  updates: {
    estado_gestion: 'pendiente' | 'en_gestion' | 'contactado' | 'convertido_promotor' | 'caso_cerrado';
    accion_inmediata?: string;
    resultado_fidelizacion?: string;
    comentarios_seguimiento?: string;
    responsable_operaciones?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      ...updates,
      fecha_gestion: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('operaciones_call_records')
      .update(payload)
      .eq('id', callId);

    if (error) {
      console.error('[Supabase] Error al actualizar estado de operaciones:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Guarda en lote varias llamadas en Supabase (ej: sincronización inicial o subida masiva)
 */
export async function bulkSaveCallRecordsToSupabase(records: CallRecord[], userId?: string): Promise<{ savedCount: number; error: Error | null }> {
  try {
    if (!records.length) return { savedCount: 0, error: null };

    let savedCount = 0;
    let lastError: Error | null = null;
    for (const record of records) {
      const saved = await saveCallRecordToSupabase(record, userId);
      if (saved.success) savedCount += 1;
      else lastError = saved.error;
    }

    return { savedCount, error: lastError };
  } catch (err: any) {
    console.error('[Supabase] Excepción en bulkSaveCallRecordsToSupabase:', err);
    return { savedCount: 0, error: err };
  }
}

/**
 * Elimina una llamada de Supabase
 */
export async function deleteCallRecordFromSupabase(id: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from('call_records')
      .delete()
      .eq('id', id);

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}

/**
 * Obtiene todos los perfiles de usuarios registrados desde Supabase
 */
export async function fetchAllProfiles(): Promise<{ data: UserProfile[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return { data: [], error: new Error(error.message) };
    }

    const profiles: UserProfile[] = (data || []).map((row: any) => ({
      id: row.id,
      email: row.email,
      full_name: row.full_name || '',
      role: row.role as UserRole,
      agent_id: row.agent_id || '',
      campana: row.campana || '',
      avatar_url: row.avatar_url || '',
      created_at: row.created_at
    }));

    return { data: profiles, error: null };
  } catch (err: any) {
    return { data: [], error: err };
  }
}

/**
 * Actualiza el rol o datos de un usuario en Supabase (Solo Super Administrador o Supervisor)
 */
export async function updateUserProfileRole(
  userId: string,
  newRole: UserRole,
  extras?: { agent_id?: string; campana?: string; full_name?: string }
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const payload: Record<string, any> = {
      role: newRole,
      updated_at: new Date().toISOString()
    };
    if (extras?.agent_id !== undefined) payload.agent_id = extras.agent_id;
    if (extras?.campana !== undefined) payload.campana = extras.campana;
    if (extras?.full_name !== undefined) payload.full_name = extras.full_name;

    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', userId);

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}

/**
 * Registra un nuevo usuario en Supabase (Auth + Profiles) sin cerrar la sesión del Administrador
 */
export async function createAdminUser(params: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  agentId?: string;
  campana?: string;
}): Promise<{ success: boolean; error: Error | null }> {
  try {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://givdlqjfnctxvarpybht.supabase.co';
    const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_nNtMZhvN0uPRz4QzVnUyPQ_Rs4yyI0D';

    // Cliente temporal sin persistencia de sesión para no desloguear al Admin
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data, error } = await tempClient.auth.signUp({
      email: params.email.trim(),
      password: params.password,
      options: {
        data: {
          full_name: params.fullName.trim(),
          role: params.role,
          agent_id: (params.agentId || '').trim(),
          campana: params.campana || 'Claro Chile'
        }
      }
    });

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    if (data.user) {
      const profilePayload = {
        id: data.user.id,
        email: params.email.trim(),
        full_name: params.fullName.trim(),
        role: params.role,
        agent_id: (params.agentId || '').trim(),
        campana: params.campana || 'Claro Chile',
        created_at: new Date().toISOString()
      };
      await supabase.from('profiles').upsert(profilePayload);
    }

    return { success: true, error: null };
  } catch (err: any) {
    return { success: false, error: err };
  }
}
