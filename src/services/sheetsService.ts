import { CallRecord } from '../types';

export const SHEET_TAB_NAME = 'Auditorias_Llamadas';

export const SHEET_HEADERS = [
  'Código Llamada',
  'Fecha y Hora',
  'Asesor',
  'ID Asesor',
  'Cliente',
  'Teléfono',
  'Campaña / Cola',
  'Duración',
  'QA Score Global (%)',
  'NPS Score (1-10)',
  'Clasificación NPS',
  'Sentimiento',
  'FCR Resuelto',
  '% Silencio',
  'Resumen Auditoría'
];

export interface SpreadsheetInfo {
  id: string;
  url: string;
  title: string;
}

/**
 * Creates a new Google Spreadsheet to serve as the live database for audited calls.
 */
export async function createAuditSpreadsheet(
  accessToken: string,
  customTitle = 'Claro QA - Base de Datos de Auditoría'
): Promise<SpreadsheetInfo> {
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: customTitle,
      },
      sheets: [
        {
          properties: {
            title: SHEET_TAB_NAME,
            gridProperties: {
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al crear hoja de cálculo (${response.status})`);
  }

  const data = await response.json();
  const spreadsheetId = data.spreadsheetId;
  const spreadsheetUrl = data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // Write headers to row 1
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      `${SHEET_TAB_NAME}!A1:O1`
    )}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [SHEET_HEADERS],
      }),
    }
  );

  return {
    id: spreadsheetId,
    url: spreadsheetUrl,
    title: customTitle,
  };
}

/**
 * Checks if an existing spreadsheet ID is valid and accessible.
 */
export async function checkSpreadsheetAccess(
  accessToken: string,
  spreadsheetId: string
): Promise<{ title: string; hasAuditTab: boolean }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'No se pudo acceder a la hoja de cálculo con este ID.');
  }

  const data = await response.json();
  const sheetsList = data.sheets || [];
  const hasAuditTab = sheetsList.some((s: any) => s.properties?.title === SHEET_TAB_NAME);

  return {
    title: data.properties?.title || 'Hoja de cálculo',
    hasAuditTab,
  };
}

/**
 * Ensures the target sheet has the required tab and headers.
 */
export async function ensureAuditTab(accessToken: string, spreadsheetId: string): Promise<void> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const info = await checkSpreadsheetAccess(accessToken, cleanId);

  if (!info.hasAuditTab) {
    // Add sheet tab
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: SHEET_TAB_NAME,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          },
        ],
      }),
    });

    // Write headers
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(
        `${SHEET_TAB_NAME}!A1:O1`
      )}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [SHEET_HEADERS],
        }),
      }
    );
  }
}

/**
 * Serializes a CallRecord into a row array for Google Sheets.
 */
function callToRow(call: CallRecord): any[] {
  return [
    call.codigo_llamada || 'CALL-' + call.id.slice(-6),
    call.fecha_hora || new Date().toISOString().replace('T', ' ').slice(0, 16),
    call.agente_nombre || 'Asesor Claro',
    call.agente_id || 'AG-001',
    call.cliente_nombre || 'Cliente',
    call.cliente_telefono || 'No registrado',
    call.cola_atencion || 'Atención General',
    call.duracion_total || '00:00',
    call.qa_score_global ?? 0,
    call.nps_pronostico?.score ?? 0,
    call.nps_pronostico?.clasificacion ?? 'PASIVO',
    call.sentimiento_label || 'Neutro',
    call.resolucion_primer_contacto ? 'SÍ' : 'NO',
    call.silencio_analisis?.porcentaje_silencio ?? 0,
    call.resumen || ''
  ];
}

/**
 * Appends a list of call records to the Google Spreadsheet.
 */
export async function appendCallsToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  calls: CallRecord[]
): Promise<number> {
  if (calls.length === 0) return 0;
  const cleanId = extractSpreadsheetId(spreadsheetId);

  // Ensure the tab exists
  await ensureAuditTab(accessToken, cleanId);

  const rows = calls.map(callToRow);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(
      `${SHEET_TAB_NAME}!A:O`
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rows,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error al sincronizar filas con Google Sheets (${response.status})`);
  }

  return rows.length;
}

/**
 * Reads existing audit rows from the Google Spreadsheet into CallRecord models.
 */
export async function readCallsFromSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<CallRecord[]> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(
      `${SHEET_TAB_NAME}!A2:O1000`
    )}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const rows: any[][] = data.values || [];

  return rows.map((r, idx) => {
    const codigo = r[0] || `CALL-${idx + 1}`;
    const fecha = r[1] || '';
    const agente = r[2] || 'Asesor';
    const agenteId = r[3] || 'AG-000';
    const cliente = r[4] || 'Cliente';
    const telefono = r[5] || '';
    const cola = r[6] || 'Atención Clientes';
    const duracion = r[7] || '00:00';
    const qaScore = parseFloat(r[8]) || 70;
    const npsScore = parseInt(r[9], 10) || 7;
    const npsClasif: 'PROMOTOR' | 'NEUTRO' | 'DETRACTOR' = 
      npsScore >= 9 ? 'PROMOTOR' : npsScore >= 7 ? 'NEUTRO' : 'DETRACTOR';
    const sentimiento = r[11] || 'Neutro';
    const fcr = (r[12] || '').toUpperCase() === 'SÍ' || (r[12] || '').toUpperCase() === 'SI';
    const silencio = parseFloat(r[13]) || 0;
    const resumen = r[14] || '';

    return {
      id: `sheet-${cleanId.slice(0, 6)}-${idx}`,
      codigo_llamada: codigo,
      fecha_hora: fecha,
      agente_nombre: agente,
      agente_id: agenteId,
      cliente_nombre: cliente,
      cliente_telefono: telefono,
      cola_atencion: cola,
      duracion_total: duracion,
      duracion_segundos: 300,
      qa_score_global: qaScore,
      resumen: resumen,
      motivo_categoria: 'soporte' as const,
      motivo_nombre: 'Atención al Cliente Registrada en Sheets',
      sentimiento_score: sentimiento === 'Positivo' ? 0.6 : sentimiento === 'Negativo' ? -0.6 : 0,
      sentimiento_label: (sentimiento === 'Positivo' || sentimiento === 'Negativo' ? sentimiento : 'Neutro'),
      csat_estimado: qaScore >= 80 ? 5 : qaScore >= 60 ? 3 : 2,
      resolucion_primer_contacto: fcr,
      evaluacion_criterios: {
        amabilidad_empatia: { nota: qaScore, diagnostico: 'Calificación extraída desde Base de Datos Google Sheets' },
        seguridad_expresarse: { nota: qaScore, diagnostico: 'Calificación extraída desde Base de Datos Google Sheets' },
        claridad_informacion: { nota: qaScore, diagnostico: 'Calificación extraída desde Base de Datos Google Sheets' },
        tiempos_espera_hold: { nota: Math.max(0, 100 - silencio), diagnostico: `Silencio registrado: ${silencio}%` },
        eficiencia_tmo: { nota: qaScore, diagnostico: 'Registrado en Sheets' },
      },
      nps_pronostico: {
        score: npsScore,
        clasificacion: npsClasif,
        pregunta: '¿Qué tan probable es que recomiende Claro?',
        escala: '0 a 10',
        justificacion: 'Evaluación basada en registro histórico de Google Sheets',
        factores_clave: ['Registro consolidado en Google Sheets'],
      },
      silencio_analisis: {
        duracion_total_segundos: 300,
        tiempo_ivr_segundos: 20,
        tiempo_agente_segundos: 280,
        silencio_agente_segundos: Math.round(280 * (silencio / 100)),
        porcentaje_silencio: silencio,
        nivel_silencio: silencio > 25 ? 'CRÍTICO' : silencio > 15 ? 'MODERADO' : 'ÓPTIMO',
        diagnostico_silencio: `Silencio registrado de ${silencio}%`,
        silencios_prolongados: [],
      },
      cumplimiento_guion: {
        saludo_institucional: true,
        verificacion_identidad: true,
        escucha_activa: true,
        entrega_ticket_subtel: true,
        despedida_cordial: true,
      },
      feedback_coaching: {
        fortalezas: ['Gestión registrada y archivada en base de datos central.'],
        oportunidades_mejora: ['Revisar detalles en caso de reclamos reiterados.'],
        guion_sugerido_alternativo: 'Mantener protocolos cordiales y claros.',
        plan_accion: 'Seguimiento estándar.',
      },
      keywords: ['atención', 'claro', 'consulta'],
      alertas: [],
      quiebres_atencion: [],
      segmentos: [],
    };
  });
}

/**
 * Extracts a pure Spreadsheet ID from either an ID string or a full docs.google.com URL.
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}
