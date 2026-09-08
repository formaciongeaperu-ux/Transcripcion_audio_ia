import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Volume2, 
  VolumeX, 
  Clock, 
  Frown, 
  Smile, 
  Meh, 
  Sparkles, 
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
  Upload
} from 'lucide-react';
import { CallRecord, SegmentoDialogo, QuiebreAtencion } from '../types';
import { RadarChart } from './RadarChart';

interface CallDetailViewProps {
  call: CallRecord | null;
  onBackToList: () => void;
  onExportCall: (call: CallRecord) => void;
  onOpenUpload?: () => void;
}

export const CallDetailView: React.FC<CallDetailViewProps> = ({
  call,
  onBackToList,
  onExportCall,
  onOpenUpload,
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

  // Audio playback state
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);

  // Reactive state for real audio file/url
  const [localAudioFile, setLocalAudioFile] = useState<File | null>(call.audioFile || null);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(call.audio_url || null);
  const [localFileName, setLocalFileName] = useState<string | null>(call.file_name || null);

  useEffect(() => {
    setLocalAudioFile(call.audioFile || null);
    setLocalAudioUrl(call.audio_url || null);
    setLocalFileName(call.file_name || null);
    setCurrentTime(0);
  }, [call.id, call.audio_url, call.audioFile, call.file_name]);

  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Dynamic segments extraction (supporting both call.transcripcion.segmentos and call.segmentos)
  const rawSegments = (call as any).transcripcion?.segmentos || call.segmentos || [];
  const segmentos: SegmentoDialogo[] = Array.isArray(rawSegments) ? rawSegments : [];

  // Jump to specific second from quiebre -> scrolls to turn and highlights it
  const jumpToTime = (second: number) => {
    setSeekTime(second);
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

  // Identify active segment based on currentTime (Karaoke effect)
  useEffect(() => {
    const currentSegment = segmentos.find(
      (s) => currentTime >= s.inicio && currentTime <= s.fin
    );
    if (currentSegment) {
      setActiveSegmentId(currentSegment.id);
      // Auto-scroll active segment into view gently
      const el = document.getElementById(`segment-${currentSegment.id}`);
      if (el && transcriptContainerRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      setActiveSegmentId(null);
    }
  }, [currentTime, segmentos]);

  // Format seconds to mm:ss
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Scoring helpers
  const npsScore = call.nps_pronostico?.score ?? 0;
  const isDetractor = call.nps_pronostico?.clasificacion === 'DETRACTOR';
  const isPromotor = call.nps_pronostico?.clasificacion === 'PROMOTOR';
  const isNeutro = call.nps_pronostico?.clasificacion === 'NEUTRO';

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
            </div>
            <p className="text-xs text-[#5F6368]">
              Asesor: <strong className="text-[#202124]">{call.agente_nombre}</strong> (<span className="font-mono">{call.agente_id}</span>) • {call.fecha_hora}
              {(call.file_name || call.audioFile?.name) && (
                <span className="ml-2 inline-flex items-center rounded-md bg-[#F1F3F4] px-1.5 py-0.5 font-mono text-[10px] text-[#3C4043]">
                  📁 {call.file_name || call.audioFile?.name}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* =========================================================================
          1. TOP QUICK METRIC CARDS (Exact match to User Screenshot 1)
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
              <Sparkles className="h-5 w-5 text-[#EA4335]" />
              <h2 className="font-['Google_Sans',sans-serif] text-xl font-bold text-[#202124]">
                Probable NPS (Net Promoter Score)
              </h2>
            </div>
          </div>

          {/* Right Badge (DETRACTOR PUNTUACIÓN 2/10) */}
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
              {call.nps_pronostico?.clasificacion} (PUNTUACIÓN {npsScore}/10)
            </span>
          </div>
        </div>

        {/* Inner Card: Question and 0 to 10 Scale */}
        <div className="mt-6 rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-6">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#EA4335]">
            PREGUNTA DE EVALUACIÓN DE ATENCIÓN GENERAL
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
              • NEUTRO (7 - 8)
            </span>
            <span className="font-semibold text-[#137333]">
              • PROMOTOR (9 - 10)
            </span>
          </div>
        </div>

        {/* Qualitative justification card */}
        <div className="mt-4 rounded-2xl border border-[#DADCE0] bg-[#FFFFFF] p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#EA4335]">
            <MessageSquare className="h-4 w-4" />
            <span>JUSTIFICACIÓN CUALITATIVA DEL PROBABLE NPS (IA)</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#3C4043]">
            {call.nps_pronostico?.justificacion}
          </p>
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
            <Sparkles className="h-5 w-5 text-[#EA4335]" />
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
                      title="Saltar a este segundo"
                    >
                      <Play className="h-3 w-3 fill-current" />
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
          6. FEEDBACK Y COACHING PARA EL ASESOR & CHECKLIST GUION
         ========================================================================= */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Coaching & Action Plan (8 cols) */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm lg:col-span-8">
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

          <div className="mt-4 flex flex-col gap-4">
            {/* Fortalezas */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#137333]">
                ✓ Fortalezas Identificadas
              </span>
              <ul className="mt-1.5 space-y-1">
                {call.feedback_coaching?.fortalezas?.map((f, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-[#3C4043]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#34A853]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Oportunidades de mejora */}
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#B06000]">
                ⚠ Oportunidades de Mejora Clave
              </span>
              <ul className="mt-1.5 space-y-1">
                {call.feedback_coaching?.oportunidades_mejora?.map((o, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-[#3C4043]">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FBBC05]" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Guion Sugerido Alternativo */}
            <div className="rounded-2xl border border-[#DADCE0] bg-[#FEF7E0]/40 p-4">
              <span className="text-xs font-bold text-[#B06000]">
                Guion Sugerido Alternativo (Para re-entrenamiento):
              </span>
              <p className="mt-1 text-xs italic leading-relaxed text-[#3C4043]">
                "{call.feedback_coaching?.guion_sugerido_alternativo}"
              </p>
            </div>

            {/* Plan de Acción */}
            <div className="rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4">
              <span className="text-xs font-bold text-[#1A73E8]">
                Plan de Acción Recomendado para Supervisión:
              </span>
              <p className="mt-1 text-xs leading-relaxed text-[#3C4043]">
                {call.feedback_coaching?.plan_accion}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Script Compliance Checklist (4 cols) */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm lg:col-span-4">
          <div>
            <div className="flex items-center gap-2 border-b border-[#DADCE0] pb-4">
              <UserCheck className="h-5 w-5 text-[#1A73E8]" />
              <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Cumplimiento de Guion
              </h3>
            </div>

            <div className="mt-4 flex flex-col gap-3">
              {[
                { 
                  label: 'Saludo Institucional (Marca Claro + Asesor)', 
                  passed: call.cumplimiento_guion?.saludo_institucional 
                },
                { 
                  label: 'Verificación de Titularidad (RUT Chileno)', 
                  passed: call.cumplimiento_guion?.verificacion_identidad 
                },
                { 
                  label: 'Escucha Activa sin Interrupciones', 
                  passed: typeof call.cumplimiento_guion?.escucha_activa === 'boolean' 
                    ? call.cumplimiento_guion.escucha_activa 
                    : !call.quiebres_atencion?.some(q => q.tipo.toLowerCase().includes('interrup'))
                },
                { 
                  label: 'Entrega Ticket de Atención (Normativa SUBTEL)', 
                  passed: typeof call.cumplimiento_guion?.entrega_ticket_subtel === 'boolean' 
                    ? call.cumplimiento_guion.entrega_ticket_subtel 
                    : !call.alertas?.some(a => a.toLowerCase().includes('ticket subtel'))
                },
                { 
                  label: 'Despedida Cordial Corporativa', 
                  passed: call.cumplimiento_guion?.despedida_cordial 
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl border border-[#DADCE0] bg-[#F8F9FA] px-3 py-2.5"
                >
                  <span className="text-xs font-medium text-[#3C4043]">{item.label}</span>
                  {item.passed ? (
                    <span className="flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-bold text-[#137333]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>CUMPLE</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-[#FCE8E6] px-2 py-0.5 text-[10px] font-bold text-[#EA4335]">
                      <XCircle className="h-3.5 w-3.5" />
                      <span>NO CUMPLE</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Alertas */}
          <div className="mt-4 border-t border-[#DADCE0] pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6368]">
                Alertas Críticas & Regulatorias
              </span>
              <span className="text-[10px] text-[#5F6368]">SERNAC / SUBTEL / Churn</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {call.alertas && call.alertas.length > 0 ? (
                call.alertas.map((al, idx) => {
                  const isRegulatory = /sernac|subtel|churn|baja|portabilidad/i.test(al);
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        isRegulatory
                          ? 'bg-[#EA4335] text-white shadow-xs'
                          : 'bg-[#FCE8E6] text-[#EA4335]'
                      }`}
                    >
                      {isRegulatory && <AlertCircle className="h-3 w-3" />}
                      <span>{al}</span>
                    </span>
                  );
                })
              ) : (
                <span className="text-xs text-[#5F6368] italic">Sin alertas críticas detectadas</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
