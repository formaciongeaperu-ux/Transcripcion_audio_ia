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
    evaluacion_criterios: row.evaluacion_criterios || {
      amabilidad_empatia: { nota: 80, observaciones: '' },
      seguridad_conocimiento: { nota: 80, observaciones: '' },
      claridad_lenguaje: { nota: 80, observaciones: '' },
      gestion_tiempos_hold: { nota: 80, observaciones: '' },
      adherencia_pauta_tmo: { nota: 80, observaciones: '' }
    },
    cumplimiento_guion: row.cumplimiento_guion || {
      fase_bienvenida: { completado: true, porcentaje: 100, items: [] },
      fase_entender_resolver: { completado: true, porcentaje: 100, items: [] },
      fase_informar_accion: { completado: true, porcentaje: 100, items: [] },
      fase_cierre: { completado: true, porcentaje: 100, items: [] }
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
 * Transforma un CallRecord a los campos de la tabla call_records en Supabase
 */
export function mapCallRecordToDb(record: CallRecord, userId?: string) {
  // Limpiamos referencias pesadas o campos transitorios de cliente (como audioFile File object)
  const segmentosClean = (record.segmentos || []).map(seg => ({
    id: seg.id,
    hablante: seg.hablante,
    inicio: seg.inicio,
    fin: seg.fin,
    texto: seg.texto,
    sentimientoScore: seg.sentimientoScore
  }));

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
    duracion_segundos: record.duracion_segundos || 0,
    qa_score_global: Math.round(record.qa_score_global || 0),
    resumen: record.resumen || '',
    motivo_categoria: record.motivo_categoria || 'soporte',
    motivo_nombre: record.motivo_nombre || 'Consulta General',
    sentimiento_score: record.sentimiento_score || 0,
    sentimiento_label: record.sentimiento_label || 'Neutro',
    csat_estimado: record.csat_estimado || 4,
    resolucion_primer_contacto: record.resolucion_primer_contacto ?? true,
    evaluacion_criterios: record.evaluacion_criterios,
    cumplimiento_guion: record.cumplimiento_guion,
    nps_pronostico: record.nps_pronostico,
    diagnostico_ojt: record.diagnostico_ojt || null,
    silencio_analisis: record.silencio_analisis,
    quiebres_atencion: record.quiebres_atencion || [],
    feedback_coaching: record.feedback_coaching,
    keywords: record.keywords || [],
    alertas: record.alertas || [],
    segmentos: segmentosClean,
    audio_url: record.audio_url || null,
    file_name: record.file_name || null,
    file_size_kb: record.file_size_kb || null,
    modelo_procesado: record.modelo_procesado || 'Groq + Llama 3.3',
    ...(userId ? { auditor_id: userId } : {}),
    updated_at: new Date().toISOString()
  };
}

/**
 * Obtiene todas las llamadas almacenadas en Supabase
 */
export async function fetchCallRecordsFromSupabase(): Promise<{ data: CallRecord[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .order('fecha_hora', { ascending: false });

    if (error) {
      console.error('[Supabase] Error al cargar call_records:', error);
      return { data: null, error: new Error(error.message) };
    }

    const records = (data || []).map(mapDbToCallRecord);
    return { data: records, error: null };
  } catch (err: any) {
    console.error('[Supabase] Excepción en fetchCallRecordsFromSupabase:', err);
    return { data: null, error: err };
  }
}

/**
 * Guarda o actualiza un registro de llamada en Supabase
 */
export async function saveCallRecordToSupabase(record: CallRecord, userId?: string): Promise<{ success: boolean; error: Error | null }> {
  try {
    const dbPayload = mapCallRecordToDb(record, userId);
    const { error } = await supabase
      .from('call_records')
      .upsert(dbPayload, { onConflict: 'id' });

    if (error) {
      console.error('[Supabase] Error al guardar call_record:', error);
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('[Supabase] Excepción en saveCallRecordToSupabase:', err);
    return { success: false, error: err };
  }
}

/**
 * Guarda en lote varias llamadas en Supabase (ej: sincronización inicial o subida masiva)
 */
export async function bulkSaveCallRecordsToSupabase(records: CallRecord[], userId?: string): Promise<{ savedCount: number; error: Error | null }> {
  try {
    if (!records.length) return { savedCount: 0, error: null };

    const payloads = records.map(r => mapCallRecordToDb(r, userId));
    const { error } = await supabase
      .from('call_records')
      .upsert(payloads, { onConflict: 'id' });

    if (error) {
      console.error('[Supabase] Error en bulkSaveCallRecordsToSupabase:', error);
      return { savedCount: 0, error: new Error(error.message) };
    }

    return { savedCount: records.length, error: null };
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
