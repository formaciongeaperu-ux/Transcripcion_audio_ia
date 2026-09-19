import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  Frown, 
  Smile, 
  Meh, 
  Gauge,
  SlidersHorizontal,
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  UserCheck, 
  TrendingUp, 
  FileText, 
  ArrowLeft,
  Share2,
  Download,
  AlertTriangle,
  Lightbulb,
  Check,
  Zap,
  Info,
  Headphones,
  Upload,
  Columns,
  Search,
  ChevronRight,
  GraduationCap
} from 'lucide-react';
import { CallRecord, SegmentoDialogo, QuiebreAtencion, getNormalizedNPS } from '../types';
import { RadarChart } from './RadarChart';
import { ComplianceAuditCard } from './ComplianceAuditCard';
import { OjtDiagnosisCard } from './OjtDiagnosisCard';

interface CallDetailViewProps {
  call: CallRecord | null;
  onBackToList: () => void;
  onExportCall: (call: CallRecord) => void;
  onOpenUpload?: () => void;
  calls?: CallRecord[];
  onSelectCall?: (call: CallRecord) => void;
}

export const CallDetailView: React.FC<CallDetailViewProps> = ({
  call,
  onBackToList,
  onExportCall,
  onOpenUpload,
  calls,
  onSelectCall,
}) => {
  if (!call) {
    return (
      <div className="flex min-h-[450px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#DADCE0] bg-white p-8 text-center shadow-xs">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E8F0FE] text-[#1A73E8]">
          <Headphones className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-['Google_Sans',sans-serif] text-xl font-bold text-[#202124]">
          No hay ninguna llamada seleccionada
        </h2>
        <p className="mt-1 max-w-md text-xs text-[#5F6368]">
          Carga un nuevo audio para procesar su auditoría con Gemini AI o selecciona una llamada del explorador.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {onOpenUpload && (
            <button
              onClick={onOpenUpload}
              className="flex items-center gap-2 rounded-full bg-[#1A73E8] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1557B0]"
            >
              <Upload className="h-4 w-4" />
              <span>Cargar Nueva Grabación</span>
            </button>
          )}
          <button
            onClick={onBackToList}
            className="flex items-center gap-2 rounded-full border border-[#DADCE0] bg-white px-5 py-2.5 text-xs font-semibold text-[#3C4043] transition hover:bg-[#F1F3F4]"
          >
            <span>Ir al Explorador de Llamadas</span>
          </button>
        </div>
      </div>
    );
  }

  // Transcript and interaction state
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [splitScreen, setSplitScreen] = useState(false);
  const [splitSearch, setSplitSearch] = useState('');

  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Dynamic segments extraction (supporting both call.transcripcion.segmentos and call.segmentos)
  const rawSegments = (call as any).transcripcion?.segmentos || call.segmentos || [];
  const segmentos: SegmentoDialogo[] = Array.isArray(rawSegments) ? rawSegments : [];

  // Jump to specific second from quiebre -> scrolls to turn and highlights it
  const jumpToTime = (second: number) => {
    const targetSegment = segmentos.find(
      (s) => second >= s.inicio && second <= s.fin
    ) || segmentos.find((s) => s.inicio >= second) || segmentos[0];

    if (targetSegment) {
      setActiveSegmentId(targetSegment.id);
      const el = document.getElementById(`segment-${targetSegment.id}`);
      if (el && transcriptContainerRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Filter calls for split view
  const splitFilteredCalls = (calls || []).filter((c) => {
    if (!splitSearch.trim()) return true;
    const q = splitSearch.toLowerCase();
    return (
      c.codigo_llamada.toLowerCase().includes(q) ||
      c.agente_nombre.toLowerCase().includes(q) ||
      c.cliente_nombre.toLowerCase().includes(q) ||
      c.motivo_nombre.toLowerCase().includes(q)
    );
  });

  // Scoring helpers (Normalized)
  const normalizedClasif = getNormalizedNPS(call.nps_pronostico, call.qa_score_global);
  const npsScore = typeof call.nps_pronostico?.score === 'number'
    ? (normalizedClasif === 'PROMOTOR' && call.nps_pronostico.score < 9 ? 9 : call.nps_pronostico.score)
    : (normalizedClasif === 'PROMOTOR' ? 9 : normalizedClasif === 'DETRACTOR' ? 3 : 7);
  const isDetractor = normalizedClasif === 'DETRACTOR';
  const isPromotor = normalizedClasif === 'PROMOTOR';
  const isNeutro = normalizedClasif === 'NEUTRO';

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Top action bar: Back button + Call identification */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            id="btn-back-calls"
            onClick={onBackToList}
            className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] px-3 py-1.5 text-xs font-medium text-[#3C4043] transition hover:bg-[#F1F3F4]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Explorador</span>
          </button>
          <div className="h-5 w-[1px] bg-[#DADCE0]" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-[#202124]">{call.codigo_llamada}</span>
              <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[11px] font-medium text-[#1A73E8]">
                {call.cola_atencion}
              </span>
              {call.file_name && (
                <span className="rounded-md border border-[#DADCE0] bg-[#F8F9FA] px-2 py-0.5 font-mono text-[11px] text-[#3C4043]" title="Archivo de audio cargado">
                  🎵 {call.file_name}
                </span>
              )}
              {call.diagnostico_ojt?.requiere_intervencion_tutor && (
                <span className="flex items-center gap-1 rounded-full bg-[#FCE8E6] px-2 py-0.5 text-[10px] font-bold text-[#EA4335]">
                  <GraduationCap className="h-3 w-3" />
                  Alerta OJT Tutor
                </span>
              )}
            </div>
            <p className="text-xs text-[#5F6368]">
              Asesor: <strong className="text-[#202124]">{call.agente_nombre}</strong> • ID Asesor: <span className="font-mono font-bold text-[#1A73E8] bg-[#E8F0FE] px-1.5 py-0.5 rounded">{call.agente_id}</span> • {call.fecha_hora}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Split Screen Toggle */}
          {calls && calls.length > 1 && onSelectCall && (
            <button
              onClick={() => setSplitScreen(!splitScreen)}
              className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                splitScreen 
                  ? 'border-[#1A73E8] bg-[#E8F0FE] text-[#1A73E8]' 
                  : 'border-[#DADCE0] bg-white text-[#3C4043] hover:bg-[#F8F9FA]'
              }`}
              title="Alternar vista dividida"
            >
              <Columns className="h-3.5 w-3.5" />
              <span>{splitScreen ? 'Vista Completa' : 'Vista Dividida (Split)'}</span>
            </button>
          )}

          <button
            id="btn-export-single"
            onClick={() => onExportCall(call)}
            className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-white px-3.5 py-1.5 text-xs font-medium text-[#3C4043] transition hover:bg-[#F8F9FA]"
          >
            <Download className="h-3.5 w-3.5 text-[#1A73E8]" />
            <span>Descargar Auditoría</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout (Support Split-Screen) */}
      <div className={`flex flex-col ${splitScreen ? 'lg:flex-row gap-6 items-start' : 'gap-6'}`}>
        {/* Left Split Sidebar: Calls fast selector */}
        {splitScreen && calls && onSelectCall && (
          <div className="w-full shrink-0 flex flex-col rounded-3xl border border-[#DADCE0] bg-white p-4 shadow-sm lg:w-80 max-h-[calc(100vh-140px)] overflow-hidden sticky top-20">
            <div className="flex items-center justify-between border-b border-[#DADCE0] pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6368]">
                Bandeja OJT ({splitFilteredCalls.length})
              </span>
              <button 
                onClick={() => setSplitScreen(false)}
                className="text-[11px] font-semibold text-[#1A73E8] hover:underline"
              >
                Cerrar split
              </button>
            </div>

            {/* Quick search input */}
            <div className="relative my-3">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#5F6368]" />
              <input
                type="text"
                placeholder="Filtrar llamadas..."
                value={splitSearch}
                onChange={(e) => setSplitSearch(e.target.value)}
                className="w-full rounded-xl border border-[#DADCE0] bg-[#F8F9FA] py-1.5 pl-8 pr-3 text-xs text-[#202124] placeholder-[#5F6368] outline-none focus:border-[#1A73E8] focus:bg-white"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {splitFilteredCalls.map((c) => {
                const isSelected = c.id === call.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => onSelectCall(c)}
                    className={`flex cursor-pointer items-center justify-between rounded-2xl p-2.5 text-xs transition ${
                      isSelected
                        ? 'border border-[#1A73E8] bg-[#E8F0FE] text-[#1A73E8] shadow-2xs'
                        : 'border border-transparent bg-[#F8F9FA] text-[#202124] hover:bg-[#F1F3F4]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-mono font-bold text-[11px]">
                        <span>{c.codigo_llamada}</span>
                        {c.diagnostico_ojt?.requiere_intervencion_tutor && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[#EA4335]" />
                        )}
                      </div>
                      <div className="truncate text-[11px] text-[#5F6368]">
                        {c.agente_nombre}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`font-extrabold ${
                        c.qa_score_global >= 80 ? 'text-[#137333]' : c.qa_score_global >= 65 ? 'text-[#B06000]' : 'text-[#EA4335]'
                      }`}>
                        {c.qa_score_global}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Right / Main Audit View */}
        <div className="flex-1 flex flex-col gap-6 min-w-0 w-full">
          {/* =========================================================================
              1. TOP QUICK METRIC CARDS
             ========================================================================= */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* QA Score Global */}
            <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-[#5F6368]">
                QA SCORE GLOBAL
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span
                  className={`text-4xl font-extrabold tracking-tight ${
                    call.qa_score_global >= 85
                      ? 'text-[#34A853]'
                      : call.qa_score_global >= 65
                      ? 'text-[#FBBC05]'
                      : 'text-[#EA4335]'
                  }`}
                >
                  {call.qa_score_global}%
                </span>
              </div>
            </div>

            {/* Sentimiento */}
            <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-[#5F6368]">
                SENTIMIENTO
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                {call.sentimiento_label === 'Negativo' ? (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FCE8E6] text-[#EA4335]">
                      <Frown className="h-5 w-5" />
                    </div>
                    <span className="text-2xl font-bold text-[#202124]">Negativo</span>
                  </>
                ) : call.sentimiento_label === 'Positivo' ? (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E6F4EA] text-[#34A853]">
                      <Smile className="h-5 w-5" />
                    </div>
                    <span className="text-2xl font-bold text-[#202124]">Positivo</span>
                  </>
                ) : (
                  <>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FEF7E0] text-[#FBBC05]">
                      <Meh className="h-5 w-5" />
                    </div>
                    <span className="text-2xl font-bold text-[#202124]">Neutro</span>
                  </>
                )}
              </div>
            </div>

            {/* Driver / TMO */}
            <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-wider text-[#5F6368]">
                DRIVER / TMO
              </div>
              <div className="mt-3">
                <div className="line-clamp-1 text-sm font-bold text-[#202124]" title={call.motivo_nombre}>
                  {call.motivo_nombre}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-[#5F6368]">
                  <Clock className="h-3.5 w-3.5 text-[#EA4335]" />
                  <span className="font-mono font-medium text-[#202124]">{call.duracion_total}</span>
                </div>
              </div>
            </div>

            {/* Silencio Conversacional */}
            <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5F6368]">
                  SILENCIO CONVERSACIONAL
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    call.silencio_analisis?.nivel_silencio === 'CRÍTICO'
                      ? 'bg-[#FCE8E6] text-[#EA4335]'
                      : call.silencio_analisis?.nivel_silencio === 'MODERADO'
                      ? 'bg-[#FEF7E0] text-[#B06000]'
                      : 'bg-[#E6F4EA] text-[#137333]'
                  }`}
                >
                  {call.silencio_analisis?.nivel_silencio || 'MODERADO'}
                </span>
              </div>
              <div className="mt-3">
                <div className="text-4xl font-extrabold tracking-tight text-[#FBBC05]">
                  {call.silencio_analisis?.porcentaje_silencio ?? 15}%
                </div>
                <div className="mt-1 text-xs text-[#5F6368]">
                  <span className="font-semibold text-[#202124]">
                    {call.silencio_analisis?.silencio_agente_segundos ?? 78}s silencio
                  </span>{' '}
                  / IVR: {call.silencio_analisis?.tiempo_ivr_segundos ?? 430}s
                </div>
              </div>
            </div>
          </div>


      {/* =========================================================================
          2. CLARO NET PROMOTER SCORE (NPS) CARD (Exact match to Screenshot 1)
         ========================================================================= */}
      <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        {/* Top Tag & Title */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#FCE8E6] px-2.5 py-0.5 text-[11px] font-bold text-[#EA4335]">
                EXCLUSIVO POSTPAGO CHILE
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#5F6368]">
                MEDICIÓN DE LEALTAD Y EXPERIENCIA GENERAL
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-[#EA4335]" strokeWidth={2} />
              <h2 className="font-['Google_Sans',sans-serif] text-xl font-bold text-[#202124]">
                Probable NPS (Net Promoter Score)
              </h2>
            </div>
          </div>

          {/* Right Badges: General tNPS & Asesor OJT Rating */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Asesor Human Rating */}
            <div className="flex items-center gap-2 rounded-full border border-[#1A73E8]/30 bg-[#E8F0FE] px-3.5 py-1.5 text-xs font-bold text-[#1A73E8] shadow-xs">
              <Smile className="h-4 w-4" />
              <span>
                TRATO ASESOR OJT: {call.nps_pronostico?.score_agente ?? Math.min(10, Math.max(1, Math.round((call.evaluacion_criterios?.amabilidad_empatia?.nota || 75) / 10)))}/10
              </span>
            </div>

            {/* General tNPS Badge */}
            <div
              className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold tracking-wide uppercase shadow-sm ${
                isDetractor
                  ? 'border-[#EA4335]/30 bg-[#FCE8E6] text-[#EA4335]'
                  : isPromotor
                  ? 'border-[#34A853]/30 bg-[#E6F4EA] text-[#137333]'
                  : 'border-[#FBBC05]/40 bg-[#FEF7E0] text-[#B06000]'
              }`}
            >
              <AlertCircle className="h-4 w-4" />
              <span>
                tNPS GENERAL: {normalizedClasif} ({npsScore}/10)
              </span>
            </div>
          </div>
        </div>

        {/* Inner Card: Question and 0 to 10 Scale */}
        <div className="mt-6 rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#EA4335]">
              PREGUNTA DE EVALUACIÓN DE ATENCIÓN GENERAL
            </span>
            <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold text-[#1A73E8]">
              CALIBRACIÓN FORMATIVA OJT
            </span>
          </div>
          <div className="mt-1 text-base font-bold text-[#202124] md:text-lg">
            "{call.nps_pronostico?.pregunta}"
          </div>
          <div className="mt-0.5 text-xs text-[#5F6368]">
            {call.nps_pronostico?.escala}
          </div>

          {/* Scale Buttons 0 to 10 */}
          <div className="mt-6 grid grid-cols-11 gap-1 sm:gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
              const isSelected = score === npsScore;
              let bgStyle = 'bg-white border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4]';
              
              if (isSelected) {
                if (score <= 6) {
                  // Detractor highlighted in solid red with glow
                  bgStyle = 'bg-[#EA4335] border-[#EA4335] text-white shadow-md ring-4 ring-[#EA4335]/20 scale-105 font-extrabold';
                } else if (score <= 8) {
                  // Neutro highlighted in yellow
                  bgStyle = 'bg-[#FBBC05] border-[#FBBC05] text-[#202124] shadow-md ring-4 ring-[#FBBC05]/25 scale-105 font-extrabold';
                } else {
                  // Promotor highlighted in green
                  bgStyle = 'bg-[#34A853] border-[#34A853] text-white shadow-md ring-4 ring-[#34A853]/25 scale-105 font-extrabold';
                }
              }

              return (
                <div key={score} className="flex flex-col items-center">
                  <div
                    className={`flex h-11 w-full items-center justify-center rounded-xl border text-sm transition-all duration-200 ${bgStyle}`}
                  >
                    {score}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scale Legend */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#EA4335]">
              • DETRACTOR (0 - 6)
            </span>
            <span className="font-semibold text-[#B06000]">
              • NEUTRO / PASIVO (7 - 8) — Zona de oportunidad
            </span>
            <span className="font-semibold text-[#137333]">
              • PROMOTOR (9 - 10)
            </span>
          </div>
        </div>

        {/* Qualitative Justification & Factor Marca vs Asesor (2 cols) */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left: Qualitative justification */}
          <div className="rounded-2xl border border-[#DADCE0] bg-[#FFFFFF] p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#EA4335]">
              <MessageSquare className="h-4 w-4" />
              <span>JUSTIFICACIÓN CUALITATIVA DEL tNPS (IA)</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#3C4043]">
              {call.nps_pronostico?.justificacion}
            </p>
            {call.nps_pronostico?.factor_marca_vs_agente && (
              <div className="mt-3 rounded-xl border border-[#DADCE0] bg-[#F8F9FA] p-2.5 text-[11px] text-[#5F6368]">
                <strong className="text-[#202124]">Desacoplamiento Marca vs Asesor: </strong>
                {call.nps_pronostico.factor_marca_vs_agente}
              </div>
            )}
          </div>

          {/* Right: Camino a Promotor (Friendly OJT tip) */}
          <div className="rounded-2xl border border-[#34A853]/30 bg-[#E6F4EA]/30 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#137333]">
              <TrendingUp className="h-4 w-4 text-[#34A853]" strokeWidth={2} />
              <span>CAMINO A PROMOTOR (9-10) — ACCIÓN OJT EN PISO</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[#202124]">
              {call.nps_pronostico?.camino_a_promotor || 
                'Enfatizar el cierre con preguntas de aseguramiento activas y recordar la encuesta del 0 al 10 para rescatar notas neutrales y convertirlas en promotoras.'}
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#137333]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Ajuste de 1 minuto en la interacción para elevar la percepción del cliente</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          3. CRITERIA BREAKDOWN & RADAR (Exact match to User Screenshot 2)
         ========================================================================= */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Radar Chart (5 cols) */}
        <div className="flex flex-col items-center justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm lg:col-span-5">
          <div className="w-full text-center">
            <h3 className="font-['Google_Sans',sans-serif] text-sm font-bold uppercase tracking-wider text-[#202124]">
              DESGLOSE DE CRITERIOS (0-100)
            </h3>
          </div>

          <div className="my-4 flex w-full items-center justify-center">
            <RadarChart criterios={call.evaluacion_criterios} size={280} />
          </div>

          <div className="w-full text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9AA0A6]">
              ANÁLISIS MULTI-DIMENSIONAL DE VARIABLES DE INTERACCIÓN
            </p>
          </div>
        </div>

        {/* Right Column: Detailed Criteria (7 cols) */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm lg:col-span-7">
          <div className="flex items-center gap-2 border-b border-[#DADCE0] pb-4">
            <SlidersHorizontal className="h-5 w-5 text-[#EA4335]" strokeWidth={2} />
            <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
              Evaluación Detallada de Criterios
            </h3>
          </div>

          <div className="mt-4 flex flex-col gap-5 divide-y divide-[#F1F3F4]">
            {/* 1. Amabilidad y Empatía */}
            <div className="pt-3 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#202124]">
                  1. Amabilidad y Empatía
                </span>
                <span
                  className={`text-xs font-bold ${
                    call.evaluacion_criterios.amabilidad_empatia.nota >= 70
                      ? 'text-[#34A853]'
                      : 'text-[#EA4335]'
                  }`}
                >
                  {call.evaluacion_criterios.amabilidad_empatia.nota}%
                </span>
              </div>
              <div className="my-1.5 h-1.5 w-full rounded-full bg-[#F1F3F4]">
                <div
                  className="h-1.5 rounded-full bg-[#EA4335]"
                  style={{ width: `${call.evaluacion_criterios.amabilidad_empatia.nota}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-[#5F6368]">
                {call.evaluacion_criterios.amabilidad_empatia.diagnostico}
              </p>
            </div>

            {/* 2. Seguridad al Expresarse */}
            <div className="pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#202124]">
                  2. Seguridad al Expresarse
                </span>
                <span className="text-xs font-bold text-[#FBBC05]">
                  {call.evaluacion_criterios.seguridad_expresarse.nota}%
                </span>
              </div>
              <div className="my-1.5 h-1.5 w-full rounded-full bg-[#F1F3F4]">
                <div
                  className="h-1.5 rounded-full bg-[#FBBC05]"
                  style={{ width: `${call.evaluacion_criterios.seguridad_expresarse.nota}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-[#5F6368]">
                {call.evaluacion_criterios.seguridad_expresarse.diagnostico}
              </p>
            </div>

            {/* 3. Claridad de Información */}
            <div className="pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#202124]">
                  3. Claridad de Información
                </span>
                <span className="text-xs font-bold text-[#EA4335]">
                  {call.evaluacion_criterios.claridad_informacion.nota}%
                </span>
              </div>
              <div className="my-1.5 h-1.5 w-full rounded-full bg-[#F1F3F4]">
                <div
                  className="h-1.5 rounded-full bg-[#EA4335]"
                  style={{ width: `${call.evaluacion_criterios.claridad_informacion.nota}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-[#5F6368]">
                {call.evaluacion_criterios.claridad_informacion.diagnostico}
              </p>
            </div>

            {/* 4. Tiempos de Espera (Hold) */}
            <div className="pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#202124]">
                  4. Tiempos de Espera (Hold)
                </span>
                <span className="text-xs font-bold text-[#EA4335]">
                  {call.evaluacion_criterios.tiempos_espera_hold.nota}%
                </span>
              </div>
              <div className="my-1.5 h-1.5 w-full rounded-full bg-[#F1F3F4]">
                <div
                  className="h-1.5 rounded-full bg-[#EA4335]"
                  style={{ width: `${call.evaluacion_criterios.tiempos_espera_hold.nota}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-[#5F6368]">
                {call.evaluacion_criterios.tiempos_espera_hold.diagnostico}
              </p>
            </div>

            {/* 5. Eficiencia y TMO */}
            <div className="pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#202124]">
                  5. Eficiencia y TMO
                </span>
                <span className="text-xs font-bold text-[#EA4335]">
                  {call.evaluacion_criterios.eficiencia_tmo.nota}%
                </span>
              </div>
              <div className="my-1.5 h-1.5 w-full rounded-full bg-[#F1F3F4]">
                <div
                  className="h-1.5 rounded-full bg-[#EA4335]"
                  style={{ width: `${call.evaluacion_criterios.eficiencia_tmo.nota}%` }}
                />
              </div>
              <p className="text-xs leading-relaxed text-[#5F6368]">
                {call.evaluacion_criterios.eficiencia_tmo.diagnostico}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. DIÁLOGO SINCRONIZADO & TRANSCRIPCIÓN DIARIZADA
         ========================================================================= */}
      <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DADCE0] pb-4">
          <div>
            <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
              Diálogo Sincronizado & Transcripción Diarizada
            </h3>
            <p className="text-xs text-[#5F6368]">
              Intervenciones estructuradas turno a turno con marcas de tiempo, interlocutor y análisis de sentimiento
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#E8F0FE] px-3 py-1 font-mono text-xs font-semibold text-[#1A73E8]">
              {segmentos.length} intervenciones registradas
            </span>
          </div>
        </div>

        {/* Diarized Transcription Area */}
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between text-xs text-[#5F6368]">
            <span className="font-semibold uppercase tracking-wider text-[#3C4043]">
              INTERVENCIONES DE LA LLAMADA
            </span>
            <span className="text-[11px] text-[#5F6368]">
              Haz clic en cualquier turno para resaltarlo
            </span>
          </div>

          <div
            ref={transcriptContainerRef}
            className="flex max-h-[600px] flex-col gap-3 overflow-y-auto pr-2"
          >
            {segmentos.map((seg) => {
              const isActive = activeSegmentId === seg.id;
              const isAgente = seg.hablante === 'agente';

              return (
                <div
                  key={seg.id}
                  id={`segment-${seg.id}`}
                  onClick={() => setActiveSegmentId(seg.id)}
                  className={`group relative flex cursor-pointer gap-3 rounded-2xl p-4 transition-all duration-200 ${
                    isActive
                      ? 'border-2 border-[#1A73E8] bg-[#E8F0FE]/70 shadow-sm'
                      : 'border border-[#E8EAED] bg-[#F8F9FA] hover:border-[#DADCE0] hover:bg-white'
                  }`}
                >
                  {/* Speaker Avatar */}
                  <div className="shrink-0">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs ${
                        isAgente ? 'bg-[#1A73E8]' : 'bg-[#EA4335]'
                      }`}
                    >
                      {isAgente ? 'A' : 'C'}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#202124]">
                          {isAgente ? `Asesor (${call.agente_nombre})` : `Cliente (${call.cliente_nombre})`}
                        </span>
                        <span className="font-mono text-[11px] text-[#5F6368]">
                          [{formatTime(seg.inicio)} - {formatTime(seg.fin)}]
                        </span>
                      </div>

                      {/* Sentiment pill */}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          seg.sentimientoScore < -0.3
                            ? 'bg-[#FCE8E6] text-[#EA4335]'
                            : seg.sentimientoScore > 0.3
                            ? 'bg-[#E6F4EA] text-[#137333]'
                            : 'bg-[#F1F3F4] text-[#5F6368]'
                        }`}
                      >
                        {seg.sentimientoScore < -0.3 ? 'Molesto' : seg.sentimientoScore > 0.3 ? 'Satisfecho' : 'Neutro'}
                      </span>
                    </div>

                    <p
                      className={`mt-2 text-xs leading-relaxed transition ${
                        isActive ? 'font-medium text-[#1A73E8]' : 'text-[#3C4043]'
                      }`}
                    >
                      {seg.texto}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* =========================================================================
          5. QUIEBRES DE ATENCIÓN DE LOS ASESORES (Crucial Requirement)
         ========================================================================= */}
      <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#DADCE0] pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FCE8E6] text-[#EA4335]">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Quiebres de Atención Detectados ({call.quiebres_atencion?.length || 0})
              </h3>
              <p className="text-xs text-[#5F6368]">
                Momentos críticos donde el asesor perdió empatía, interrumpió o incurrió en silencio no asistido
              </p>
            </div>
          </div>
        </div>

        {call.quiebres_atencion && call.quiebres_atencion.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {call.quiebres_atencion.map((q) => (
              <div
                key={q.id}
                className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4 transition hover:border-[#EA4335]/40 hover:shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        q.severidad === 'CRÍTICO'
                          ? 'bg-[#EA4335] text-white'
                          : q.severidad === 'ALTO'
                          ? 'bg-[#FBBC05] text-[#202124]'
                          : 'bg-[#DADCE0] text-[#3C4043]'
                      }`}
                    >
                      {q.severidad}
                    </span>

                    <button
                      onClick={() => jumpToTime(q.segundo)}
                      className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-[#1A73E8] shadow-xs hover:bg-[#E8F0FE]"
                      title="Ver turno en transcripción"
                    >
                      <Clock className="h-3 w-3 text-[#1A73E8]" />
                      <span>{q.tiempo}</span>
                    </button>
                  </div>

                  <h4 className="mt-2 text-xs font-bold text-[#202124]">{q.tipo}</h4>

                  {/* Cita Textual */}
                  <div className="mt-2 rounded-xl bg-white p-2.5 text-[11px] italic text-[#5F6368] border-l-2 border-[#EA4335]">
                    "{q.cita}"
                  </div>

                  {/* Impacto */}
                  <p className="mt-2 text-[11px] leading-relaxed text-[#3C4043]">
                    <strong className="text-[#EA4335]">Impacto: </strong>
                    {q.impacto_cliente}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#DADCE0] p-8 text-center">
            <CheckCircle2 className="h-8 w-8 text-[#34A853]" />
            <p className="mt-2 text-sm font-bold text-[#202124]">Cero quiebres detectados</p>
            <p className="text-xs text-[#5F6368]">
              El asesor mantuvo un estándar sobresaliente de amabilidad, protocolo y tiempos de respuesta.
            </p>
          </div>
        )}
      </div>

      {/* =========================================================================
          6. DIAGNÓSTICO OJT - FORMACIÓN EN PUESTO REAL CON CLIENTES VIVOS
         ========================================================================= */}
      <OjtDiagnosisCard call={call} />

      {/* =========================================================================
          7. PAUTA OFICIAL DE ATENCIÓN CLARO CHILE (4 FASES)
         ========================================================================= */}
      <ComplianceAuditCard call={call} />

      {/* =========================================================================
          7. FEEDBACK Y COACHING PARA EL ASESOR
         ========================================================================= */}
      <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#DADCE0] pb-4">
          <Lightbulb className="h-5 w-5 text-[#FBBC05]" />
          <div>
            <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
              Plan de Feedback & Coaching Personalizado
            </h3>
            <p className="text-xs text-[#5F6368]">
              Enfoque para tomar acciones inmediatas a partir de los hallazgos de la IA
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* 1. Fortalezas */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#137333]">
                ✓ Fortalezas Identificadas
              </span>
              <ul className="mt-2 space-y-1.5">
                {call.feedback_coaching?.fortalezas?.map((f, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-[#3C4043]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#34A853]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 2. Oportunidades de mejora */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#B06000]">
                ⚠ Oportunidades de Mejora Clave
              </span>
              <ul className="mt-2 space-y-1.5">
                {call.feedback_coaching?.oportunidades_mejora?.map((o, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-[#3C4043]">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FBBC05]" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 3. Guion Sugerido Alternativo */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#FEF7E0]/40 p-4">
            <div>
              <span className="text-xs font-bold text-[#B06000]">
                Guion Sugerido Alternativo (Para re-entrenamiento):
              </span>
              <p className="mt-1.5 text-xs italic leading-relaxed text-[#3C4043]">
                "{call.feedback_coaching?.guion_sugerido_alternativo}"
              </p>
            </div>
          </div>

          {/* 4. Plan de Acción */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4">
            <div>
              <span className="text-xs font-bold text-[#1A73E8]">
                Plan de Acción Recomendado para Supervisión:
              </span>
              <p className="mt-1.5 text-xs leading-relaxed text-[#3C4043]">
                {call.feedback_coaching?.plan_accion}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  );
};
