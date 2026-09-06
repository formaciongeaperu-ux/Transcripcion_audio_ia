import * as XLSX from 'xlsx';
import { CallRecord } from '../types';

export function exportCallsToExcel(calls: CallRecord[], fileName: string = 'Reporte_Auditoria_Speech_Analytics_Claro.xlsx') {
  // Main calls sheet data
  const mainData = calls.map(c => ({
    'Código de Grabación': c.codigo_llamada,
    'Fecha y Hora': c.fecha_hora,
    'Asesor': c.agente_nombre,
    'ID Asesor': c.agente_id,
    'Cliente': c.cliente_nombre,
    'Teléfono': c.cliente_telefono,
    'Cola de Atención': c.cola_atencion,
    'Driver / Motivo': c.motivo_nombre,
    'Categoría': c.motivo_categoria.toUpperCase(),
    'TMO Duración': c.duracion_total,
    'Duración Segundos': c.duracion_segundos,
    'Tiempo IVR Previo (s)': c.silencio_analisis?.tiempo_ivr_segundos ?? 0,
    'Tiempo Interacción Agente (s)': c.silencio_analisis?.tiempo_agente_segundos ?? c.duracion_segundos,
    'Tiempo Silencio Agente (s)': c.silencio_analisis?.silencio_agente_segundos ?? 0,
    '% Silencio Conversacional': `${c.silencio_analisis?.porcentaje_silencio ?? 0}%`,
    'Nivel de Silencio': c.silencio_analisis?.nivel_silencio ?? 'MODERADO',
    'QA Score Global': `${c.qa_score_global}%`,
    'Probable NPS (0-10)': c.nps_pronostico?.score ?? 0,
    'Clasificación NPS': c.nps_pronostico?.clasificacion ?? 'NEUTRO',
    'Pregunta NPS': c.nps_pronostico?.pregunta ?? '¿Qué tan probable es que recomiendes Claro a un amigo o familiar?',
    'Justificación NPS (IA)': c.nps_pronostico?.justificacion ?? '',
    'CSAT Estimado': c.csat_estimado,
    'Sentimiento': c.sentimiento_label,
    'Sentimiento Score': c.sentimiento_score,
    'FCR (Resuelto Primer Contacto)': c.resolucion_primer_contacto ? 'SÍ' : 'NO',
    // Criteria breakdown
    'Amabilidad y Empatía (0-100)': c.evaluacion_criterios?.amabilidad_empatia?.nota ?? 0,
    'Seguridad al Expresarse (0-100)': c.evaluacion_criterios?.seguridad_expresarse?.nota ?? 0,
    'Claridad de Información (0-100)': c.evaluacion_criterios?.claridad_informacion?.nota ?? 0,
    'Tiempos de Espera Hold (0-100)': c.evaluacion_criterios?.tiempos_espera_hold?.nota ?? 0,
    'Eficiencia y TMO (0-100)': c.evaluacion_criterios?.eficiencia_tmo?.nota ?? 0,
    // Script compliance
    'Saludo Institucional': c.cumplimiento_guion?.saludo_institucional ? 'CUMPLE' : 'NO CUMPLE',
    'Verificación de Identidad': c.cumplimiento_guion?.verificacion_identidad ? 'CUMPLE' : 'NO CUMPLE',
    'Ofrecimiento de Ayuda': c.cumplimiento_guion?.ofrecimiento_ayuda ? 'CUMPLE' : 'NO CUMPLE',
    'Despedida Cordial': c.cumplimiento_guion?.despedida_cordial ? 'CUMPLE' : 'NO CUMPLE',
    'Política de Privacidad': c.cumplimiento_guion?.politica_privacidad ? 'CUMPLE' : 'NO CUMPLE',
    'Total Quiebres Detectados': c.quiebres_atencion?.length ?? 0,
    'Alertas de Riesgo': c.alertas?.join('; ') ?? '',
    'Palabras Clave': c.keywords?.join(', ') ?? '',
    'Resumen Ejecutivo': c.resumen,
    'Plan de Acción Coaching': c.feedback_coaching?.plan_accion ?? ''
  }));

  // Breakdowns sheet
  const quiebresData: Record<string, string | number>[] = [];
  calls.forEach(call => {
    (call.quiebres_atencion || []).forEach(q => {
      quiebresData.push({
        'Código Grabación': call.codigo_llamada,
        'Asesor': call.agente_nombre,
        'Cola': call.cola_atencion,
        'Marca de Tiempo': q.tiempo,
        'Segundo': q.segundo,
        'Tipo de Quiebre': q.tipo,
        'Severidad': q.severidad,
        'Cita Textual del Asesor': q.cita,
        'Impacto en el Cliente': q.impacto_cliente
      });
    });
  });

  // Create workbook
  const wb = XLSX.utils.book_new();
  const wsCalls = XLSX.utils.json_to_sheet(mainData);
  XLSX.utils.book_append_sheet(wb, wsCalls, 'Auditoría de Llamadas');

  if (quiebresData.length > 0) {
    const wsQuiebres = XLSX.utils.json_to_sheet(quiebresData);
    XLSX.utils.book_append_sheet(wb, wsQuiebres, 'Quiebres de Asesores');
  }

  // Trigger download
  XLSX.writeFile(wb, fileName);
}

export function exportCallsToCSV(calls: CallRecord[], fileName: string = 'Auditoria_Llamadas_Claro.csv') {
  const headers = [
    'Codigo_Llamada',
    'Fecha_Hora',
    'Asesor',
    'ID_Asesor',
    'Cola_Atencion',
    'Driver',
    'TMO',
    'Silencio_IVR_s',
    'Silencio_Agente_s',
    'Porcentaje_Silencio',
    'QA_Score',
    'NPS_Score',
    'NPS_Clasificacion',
    'CSAT',
    'Sentimiento',
    'FCR',
    'Quiebres_Count',
    'Resumen'
  ];

  const rows = calls.map(c => [
    `"${c.codigo_llamada}"`,
    `"${c.fecha_hora}"`,
    `"${c.agente_nombre}"`,
    `"${c.agente_id}"`,
    `"${c.cola_atencion}"`,
    `"${c.motivo_nombre.replace(/"/g, '""')}"`,
    `"${c.duracion_total}"`,
    c.silencio_analisis?.tiempo_ivr_segundos ?? 0,
    c.silencio_analisis?.silencio_agente_segundos ?? 0,
    `"${c.silencio_analisis?.porcentaje_silencio ?? 0}%"`,
    c.qa_score_global,
    c.nps_pronostico?.score ?? 0,
    `"${c.nps_pronostico?.clasificacion ?? 'NEUTRO'}"`,
    c.csat_estimado,
    `"${c.sentimiento_label}"`,
    c.resolucion_primer_contacto ? 'SI' : 'NO',
    c.quiebres_atencion?.length ?? 0,
    `"${(c.resumen || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportSingleCallReport(call: CallRecord) {
  exportCallsToExcel([call], `Auditoria_${call.codigo_llamada}.xlsx`);
}

