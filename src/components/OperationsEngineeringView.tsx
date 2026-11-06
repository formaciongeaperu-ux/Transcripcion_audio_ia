import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  ShieldAlert, 
  Flame, 
  AlertTriangle, 
  Building2, 
  Users, 
  Wrench, 
  FileSpreadsheet, 
  ArrowRight, 
  TrendingDown, 
  TrendingUp,
  CheckCircle2, 
  PhoneCall, 
  Download, 
  ExternalLink, 
  MessageSquareQuote, 
  Search, 
  Filter,
  Activity,
  Layers,
  FileCheck,
  Zap,
  Target,
  HeartHandshake,
  CheckCircle,
  Clock3,
  X,
  Play,
  Pause,
  RotateCcw,
  Headphones,
  Calendar,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  UserCheck,
  Award,
  Sparkles,
  ChevronRight,
  ListFilter,
  Info,
  HelpCircle,
  BarChart3,
  PieChart as PieChartIcon
} from 'lucide-react';
import { 
  CallRecord, 
  getNormalizedNPS, 
  CausaRaizOperativa, 
  RiesgoChurn, 
  ResponsabilidadFalla, 
  DiagnosticoOperaciones,
  SegmentoDialogo,
  QuiebreAtencion
} from '../types';
import { updateOperationsManagementStatus } from '../services/supabaseService';
import { exportCallsToExcel, exportCallsToCSV } from '../utils/exportUtils';
import { EnterpriseAudioPlayer } from './EnterpriseAudioPlayer';

interface OperationsEngineeringViewProps {
  calls: CallRecord[];
  onSelectCall: (call: CallRecord) => void;
  onExportCalls?: (calls: CallRecord[]) => void;
  onUpdateCall?: (updatedCall: CallRecord) => void;
}

/**
 * Resuelve el diagnóstico operativo:
 * 1. Si la llamada ya trae `diagnostico_operaciones` (nuevas llamadas procesadas), lo usa directamente.
 * 2. Si es una llamada histórica de Supabase, infiere inteligentemente la causa raíz,
 *    riesgo churn y alertas regulatorias (SUBTEL) a partir de los campos reales almacenados
 *    (motivo_categoria, motivo_nombre, resumen, keywords, quiebres_atencion).
 */
export function resolveEffectiveOperationsDiagnosis(call: CallRecord): DiagnosticoOperaciones {
  if (call.diagnostico_operaciones && call.diagnostico_operaciones.causa_raiz_nombre) {
    return call.diagnostico_operaciones;
  }

  const textCorpus = [
    call.motivo_nombre || '',
    call.motivo_categoria || '',
    call.resumen || '',
    ...(call.keywords || []),
    ...(call.alertas || []),
    ...(call.quiebres_atencion || []).map((q) => `${q.tipo || ''} ${q.cita || (q as any).detalle || ''}`)
  ].join(' ').toLowerCase();

  const isDetractor = (call.nps_pronostico?.score ?? 10) <= 6 || 
                      getNormalizedNPS(call.nps_pronostico, call.qa_score_global) === 'DETRACTOR';

  let cat: CausaRaizOperativa = 'falla_servicio_red';
  let catName = 'Falla de Señal / Red o Fibra Claro';

  if (
    call.motivo_categoria === 'facturacion' ||
    /cobro|boleta|factur|saldo|cargo|descuento|tarifa|corte por pago|dinero|cuenta/i.test(textCorpus)
  ) {
    cat = 'facturacion_cobranza';
    catName = 'Facturación / Cobro No Reconocido';
  } else if (/tecnico|visita|terreno|instalacion|despacho|agendam|no llego/i.test(textCorpus)) {
    cat = 'logistica_terreno';
    catName = 'Logística / Visita Técnica Incumplida';
  } else if (
    call.motivo_categoria === 'bajas' ||
    /baja|cancelar|renuncia|portabilidad|sucursal|traba|retencion|termino de contrato/i.test(textCorpus)
  ) {
    cat = 'friccion_procesos';
    catName = 'Fricción en Trámites y Procesos Claro';
  } else if (/reiterad|segunda vez|tercera vez|otra vez|ayer llame|varias veces|no solucionan/i.test(textCorpus)) {
    cat = 'llamada_reiterada';
    catName = 'Llamada Reiterada (Falla 1er Contacto)';
  } else if (
    (call.evaluacion_criterios?.amabilidad_empatia?.nota ?? 100) < 70 ||
    /cortante|interrumpe|tono inadecuado|desatento|falta empatia/i.test(textCorpus)
  ) {
    cat = 'atencion_asesor';
    catName = 'Atención y Trato del Asesor';
  } else if (!isDetractor) {
    cat = 'consulta_informativa';
    catName = 'Consulta Informativa / Gestión Resuelta';
  }

  const hasSubtel = /subtel|sernac|indecopi|demanda|abogado|tribunal|denuncia|portarme|me voy a entel|me voy a movistar|me voy a wom/i.test(textCorpus);
  const isReiteration = cat === 'llamada_reiterada' || /reiterad|segunda vez|tercera vez|otra vez|ayer llame/i.test(textCorpus);

  let resp: ResponsabilidadFalla = 'claro_empresa';
  if (cat === 'atencion_asesor' || call.qa_score_global < 60) {
    resp = 'asesor';
  } else if (call.qa_score_global < 75) {
    resp = 'compartida';
  }

  const risk: RiesgoChurn = hasSubtel ? 'critico' : isDetractor ? (isReiteration ? 'critico' : 'medio') : 'bajo';

  return {
    es_detractor: isDetractor,
    causa_raiz_categoria: cat,
    causa_raiz_nombre: catName,
    causa_raiz_detalle: call.resumen || 'Detracción registrada en interacción con el cliente.',
    responsabilidad: resp,
    responsabilidad_justificacion: resp === 'claro_empresa'
      ? 'Falla técnica o procedimental atribuible a los sistemas o servicios de Claro.'
      : 'Oportunidad de refuerzo en la gestión del asesor.',
    riesgo_churn: risk,
    amenaza_subtel_sernac: hasSubtel,
    llamada_reiterada: isReiteration,
    citas_quiebre_cliente: call.quiebres_atencion?.map((q) => q.cita || (q as any).detalle || q.tipo).slice(0, 3) || [],
    plan_accion_cliente: isDetractor
      ? 'Contacto de fidelización y verificación técnica dentro de 24h.'
      : 'Seguimiento estándar.',
    plan_accion_proceso: 'Optimización de protocolos del área involucrada.',
    area_responsable: cat === 'facturacion_cobranza' ? 'Facturación & Cobranzas' :
                      cat === 'logistica_terreno' ? 'Despacho & Terreno' :
                      cat === 'friccion_procesos' ? 'Procesos & Calidad' : 'Planta Externa / Redes'
  };
}

/**
 * Componente Semi-Circle Gauge para tNPS (-100 a +100) idéntico a la imagen de referencia
 */
const NpsGauge: React.FC<{ score: number }> = ({ score }) => {
  // Clamp score between -100 and +100
  const clamped = Math.max(-100, Math.min(100, score));
  // Normalize to 0 .. 1 range
  const normalized = (clamped + 100) / 200;

  // Arc parameters
  const r = 80;
  const cx = 110;
  const cy = 100;
  const strokeWidth = 14;

  // Circumference of semi-circle: PI * r
  const arcLength = Math.PI * r;
  const strokeDashoffset = arcLength * (1 - normalized);

  // Dynamic theme based on score
  const scoreColor = clamped >= 40 
    ? '#10B981' // Green
    : clamped >= 0 
    ? '#3B82F6' // Blue
    : '#EF4444'; // Red

  return (
    <div className="flex flex-col items-center justify-center relative">
      <svg width="220" height="125" viewBox="0 0 220 125" className="overflow-visible">
        {/* Background Track Arc */}
        <path
          d="M 30 100 A 80 80 0 0 1 190 100"
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Active Value Arc */}
        <path
          d="M 30 100 A 80 80 0 0 1 190 100"
          fill="none"
          stroke={scoreColor}
          strokeWidth={strokeWidth}
          strokeDasharray={arcLength}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
        {/* Indicator ticks */}
        <line x1="110" y1="20" x2="110" y2="12" stroke="#9CA3AF" strokeWidth="1.5" />
      </svg>

      {/* Center Big Number */}
      <div className="absolute top-[52px] flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold text-[#111827] tracking-tight">
          {clamped}
        </span>
      </div>

      {/* Scale labels */}
      <div className="w-[190px] flex justify-between text-[11px] font-semibold text-[#9CA3AF] -mt-1 px-1">
        <span>-100</span>
        <span className="text-xs font-bold text-[#6B7280]">0</span>
        <span>100</span>
      </div>
    </div>
  );
};

/**
 * Componente Donut Chart idéntico al bloque "Responses" de la imagen de referencia
 */
const NpsDonutChart: React.FC<{
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}> = ({ promoters, passives, detractors, total }) => {
  const safeTotal = Math.max(total, 1);
  const pPct = Math.round((promoters / safeTotal) * 100);
  const nPct = Math.round((passives / safeTotal) * 100);
  const dPct = total === 0 ? 0 : 100 - pPct - nPct;

  // Donut SVG parameters
  const size = 150;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const pLen = (pPct / 100) * circumference;
  const nLen = (nPct / 100) * circumference;
  const dLen = (dPct / 100) * circumference;

  const pOffset = 0;
  const nOffset = -pLen;
  const dOffset = -(pLen + nLen);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
      {/* SVG Donut */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* Base Empty Ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#F3F4F6"
            strokeWidth={strokeWidth}
          />
          {total > 0 && (
            <>
              {/* Promoters Arc (Green) */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#10B981"
                strokeWidth={strokeWidth}
                strokeDasharray={`${pLen} ${circumference}`}
                strokeDashoffset={pOffset}
                className="transition-all duration-700"
              />
              {/* Passives Arc (Grey) */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#D1D5DB"
                strokeWidth={strokeWidth}
                strokeDasharray={`${nLen} ${circumference}`}
                strokeDashoffset={nOffset}
                className="transition-all duration-700"
              />
              {/* Detractors Arc (Red) */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="#EF4444"
                strokeWidth={strokeWidth}
                strokeDasharray={`${dLen} ${circumference}`}
                strokeDashoffset={dOffset}
                className="transition-all duration-700"
              />
            </>
          )}
        </svg>

        {/* Center Total Count */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-xl font-extrabold text-[#111827]">{total}</span>
          <span className="text-[10px] font-medium text-[#6B7280]">casos</span>
        </div>
      </div>

      {/* Legend Column matching the exact reference image */}
      <div className="flex flex-col gap-3 min-w-[190px]">
        {/* Promoters */}
        <div className="flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2 text-[#374151]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 text-[11px]">
              😊
            </span>
            <span>Promoters</span>
          </div>
          <span className="font-bold text-[#111827]">
            {promoters} <span className="text-[#6B7280] font-normal">({pPct}%)</span>
          </span>
        </div>

        {/* Passives */}
        <div className="flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2 text-[#374151]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[11px]">
              😐
            </span>
            <span>Passives</span>
          </div>
          <span className="font-bold text-[#111827]">
            {passives} <span className="text-[#6B7280] font-normal">({nPct}%)</span>
          </span>
        </div>

        {/* Detractors */}
        <div className="flex items-center justify-between text-xs font-semibold">
          <div className="flex items-center gap-2 text-[#374151]">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-600 text-[11px]">
              🙁
            </span>
            <span>Detractors</span>
          </div>
          <span className="font-bold text-[#111827]">
            {detractors} <span className="text-[#6B7280] font-normal">({dPct}%)</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export const OperationsEngineeringView: React.FC<OperationsEngineeringViewProps> = ({
  calls,
  onSelectCall,
  onExportCalls,
  onUpdateCall,
}) => {
  // Active Sub-Tab: Overview | Responses (Detractores) | Coaching
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'responses' | 'coaching'>('overview');

  // Global Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<'all' | 'today' | '7days' | '30days'>('all');
  const [selectedQueue, setSelectedQueue] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedChurnRisk, setSelectedChurnRisk] = useState<'all' | 'critico' | 'medio' | 'bajo'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Drawer & Management State
  const [drawerCall, setDrawerCall] = useState<CallRecord | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState<number>(0);
  const [externalSeekTime, setExternalSeekTime] = useState<number | null>(null);

  // Checklist Quality State
  const [checkIdentidad, setCheckIdentidad] = useState<boolean>(true);
  const [checkEmpatia, setCheckEmpatia] = useState<boolean>(true);
  const [checkSolucion, setCheckSolucion] = useState<boolean>(true);

  // Bitácora de Acciones Correctivas
  const [manageStatus, setManageStatus] = useState<'pendiente' | 'en_gestion' | 'contactado' | 'convertido_promotor' | 'caso_cerrado'>('en_gestion');
  const [manageAction, setManageAction] = useState('');
  const [manageResult, setManageResult] = useState('Convertido a Promotor (NPS 9-10)');
  const [manageCoachingNotes, setManageCoachingNotes] = useState('');
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Unique lists for dropdowns
  const uniqueQueues = useMemo(() => Array.from(new Set(calls.map((c) => c.cola_atencion).filter(Boolean))), [calls]);
  const uniqueAgents = useMemo(() => {
    const map = new Map<string, string>();
    calls.forEach((c) => {
      if (c.agente_id && c.agente_nombre) map.set(c.agente_id, c.agente_nombre);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [calls]);

  // Enriched Calls with effective operations diagnostic
  const enrichedCalls = useMemo(() => {
    return calls.map((c) => ({
      ...c,
      effectiveOps: resolveEffectiveOperationsDiagnosis(c)
    }));
  }, [calls]);

  // Filtered by Global Date Filter
  const dateFilteredCalls = useMemo(() => {
    if (dateRange === 'all') return enrichedCalls;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    return enrichedCalls.filter((c) => {
      const callTime = new Date(c.fecha_hora || 0).getTime();
      if (dateRange === 'today') return now - callTime <= oneDay;
      if (dateRange === '7days') return now - callTime <= 7 * oneDay;
      if (dateRange === '30days') return now - callTime <= 30 * oneDay;
      return true;
    });
  }, [enrichedCalls, dateRange]);

  // Overall Population Metrics (for tNPS and Hero Cards)
  const populationStats = useMemo(() => {
    const total = dateFilteredCalls.length || 0;
    let promotersCount = 0;
    let passivesCount = 0;
    let detractorsCount = 0;

    let csatSum = 0;
    let promotersQaSum = 0;
    let detractorsQaSum = 0;

    dateFilteredCalls.forEach((c) => {
      const npsType = getNormalizedNPS(c.nps_pronostico, c.qa_score_global);
      const score = c.nps_pronostico?.score;
      csatSum += c.csat_estimado || 4;

      if (npsType === 'PROMOTOR' || (score !== undefined && score >= 9)) {
        promotersCount++;
        promotersQaSum += c.qa_score_global || 0;
      } else if (npsType === 'DETRACTOR' || (score !== undefined && score <= 6) || c.effectiveOps.es_detractor) {
        detractorsCount++;
        detractorsQaSum += c.qa_score_global || 0;
      } else {
        passivesCount++;
      }
    });

    const safeTotal = Math.max(total, 1);
    const promotersPct = Math.round((promotersCount / safeTotal) * 100);
    const passivesPct = Math.round((passivesCount / safeTotal) * 100);
    const detractorsPct = total === 0 ? 0 : 100 - promotersPct - passivesPct;
    const tnpsGlobal = promotersPct - detractorsPct; // -100 to +100

    const avgCsat = total > 0 ? (csatSum / total).toFixed(1) : '4.2';
    const avgPromoterQa = promotersCount > 0 ? Math.round(promotersQaSum / promotersCount) : 85;
    const avgDetractorQa = detractorsCount > 0 ? Math.round(detractorsQaSum / detractorsCount) : 60;
    const qaGap = avgPromoterQa - avgDetractorQa;

    return {
      total,
      promotersCount,
      passivesCount,
      detractorsCount,
      promotersPct,
      passivesPct,
      detractorsPct,
      tnpsGlobal,
      avgCsat,
      avgPromoterQa,
      avgDetractorQa,
      qaGap
    };
  }, [dateFilteredCalls]);

  // Dedicated Detractor Population
  const allDetractorCalls = useMemo(() => {
    return dateFilteredCalls.filter((c) => c.effectiveOps.es_detractor);
  }, [dateFilteredCalls]);

  // Rescue Funnel Metrics
  const rescueFunnelStats = useMemo(() => {
    const total = allDetractorCalls.length || 0;
    let managed = 0;
    let converted = 0;
    let pending = 0;

    allDetractorCalls.forEach((c) => {
      const st = c.estado_gestion;
      if (st === 'convertido_promotor') {
        converted++;
        managed++;
      } else if (st === 'en_gestion' || st === 'contactado' || st === 'caso_cerrado') {
        managed++;
      } else {
        pending++;
      }
    });

    const safeTotal = Math.max(total, 1);
    const managedPct = Math.round((managed / safeTotal) * 100);
    const convertedPct = Math.round((converted / safeTotal) * 100);

    return { total, managed, converted, pending, managedPct, convertedPct };
  }, [allDetractorCalls]);

  // Critical Churn & Regulatory Threat counts
  const criticalChurnCount = useMemo(() => {
    return allDetractorCalls.filter((c) => 
      c.effectiveOps.riesgo_churn === 'critico' || 
      c.effectiveOps.amenaza_subtel_sernac
    ).length;
  }, [allDetractorCalls]);

  // Filtered Detractor Calls for the Rescue Funnel Table
  const filteredDetractorCalls = useMemo(() => {
    return allDetractorCalls.filter((c) => {
      if (selectedQueue !== 'all' && c.cola_atencion !== selectedQueue) return false;
      if (selectedAgent !== 'all' && c.agente_id !== selectedAgent && c.agente_nombre !== selectedAgent) return false;
      if (selectedCategory !== 'all' && c.effectiveOps.causa_raiz_categoria !== selectedCategory) return false;
      if (selectedChurnRisk !== 'all' && c.effectiveOps.riesgo_churn !== selectedChurnRisk) return false;
      
      if (selectedStatus !== 'all') {
        const currentSt = c.estado_gestion || 'pendiente';
        if (currentSt !== selectedStatus) return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesClient = c.cliente_nombre?.toLowerCase().includes(q) || c.cliente_telefono?.toLowerCase().includes(q);
        const matchesAgent = c.agente_nombre?.toLowerCase().includes(q) || c.agente_id?.toLowerCase().includes(q);
        const matchesCausa = c.effectiveOps.causa_raiz_nombre?.toLowerCase().includes(q) ||
                             c.effectiveOps.causa_raiz_detalle?.toLowerCase().includes(q) ||
                             c.codigo_llamada?.toLowerCase().includes(q);
        return matchesClient || matchesAgent || matchesCausa;
      }
      return true;
    });
  }, [allDetractorCalls, selectedQueue, selectedAgent, selectedCategory, selectedChurnRisk, selectedStatus, searchTerm]);

  // Bloque D: Ranking de Oportunidades de Mejora por Asesor (Coaching Data)
  const coachingAgentRanking = useMemo(() => {
    const map = new Map<string, {
      agente_id: string;
      agente_nombre: string;
      detractorCount: number;
      totalCalls: number;
      avgQaScore: number;
      qaScoreSum: number;
      topFailures: Record<string, number>;
    }>();

    dateFilteredCalls.forEach((c) => {
      const agId = c.agente_id || 'AG-000';
      const agName = c.agente_nombre || 'Asesor Claro';
      if (!map.has(agId)) {
        map.set(agId, {
          agente_id: agId,
          agente_nombre: agName,
          detractorCount: 0,
          totalCalls: 0,
          avgQaScore: 0,
          qaScoreSum: 0,
          topFailures: {
            'Empatía y Amabilidad': 0,
            'Tiempos de Espera / Hold': 0,
            'Claridad de Información': 0,
            'Validación de Identidad': 0,
            'Manejo de Reclamos': 0
          }
        });
      }
      const entry = map.get(agId)!;
      entry.totalCalls++;
      entry.qaScoreSum += c.qa_score_global || 0;

      if (c.effectiveOps.es_detractor) {
        entry.detractorCount++;
        if ((c.evaluacion_criterios?.amabilidad_empatia?.nota ?? 100) < 75) {
          entry.topFailures['Empatía y Amabilidad']++;
        }
        if ((c.evaluacion_criterios?.tiempos_espera_hold?.nota ?? 100) < 75 || (c.silencio_analisis?.porcentaje_silencio ?? 0) > 15) {
          entry.topFailures['Tiempos de Espera / Hold']++;
        }
        if ((c.evaluacion_criterios?.claridad_informacion?.nota ?? 100) < 75) {
          entry.topFailures['Claridad de Información']++;
        }
        if (!c.cumplimiento_guion?.verificacion_identidad || !c.cumplimiento_guion?.fases?.bienvenida?.confirmar_nombre_cliente_rut_celular) {
          entry.topFailures['Validación de Identidad']++;
        }
        if (c.effectiveOps.causa_raiz_categoria === 'friccion_procesos' || c.effectiveOps.causa_raiz_categoria === 'facturacion_cobranza') {
          entry.topFailures['Manejo de Reclamos']++;
        }
      }
    });

    return Array.from(map.values())
      .filter((a) => a.detractorCount > 0)
      .map((a) => {
        const avgQaScore = Math.round(a.qaScoreSum / (a.totalCalls || 1));
        const detractionRate = Math.round((a.detractorCount / (a.totalCalls || 1)) * 100);
        const sortedFailures = Object.entries(a.topFailures).sort((x, y) => y[1] - x[1]);
        const primaryFailure = sortedFailures[0]?.[1] > 0 ? sortedFailures[0][0] : 'Procedimientos Generales';
        return {
          ...a,
          avgQaScore,
          detractionRate,
          primaryFailure
        };
      })
      .sort((a, b) => b.detractorCount - a.detractorCount)
      .slice(0, 8);
  }, [dateFilteredCalls]);

  // Dynamic Real NPS History Buckets based exclusively on dateFilteredCalls
  const npsHistoryBuckets = useMemo(() => {
    if (!dateFilteredCalls || dateFilteredCalls.length === 0) return [];

    // Sort calls chronologically
    const sorted = [...dateFilteredCalls].sort((a, b) => {
      const tA = a.fecha_hora ? new Date(a.fecha_hora).getTime() : 0;
      const tB = b.fecha_hora ? new Date(b.fecha_hora).getTime() : 0;
      return tA - tB;
    });

    // Group calls by date key
    const groups: { [key: string]: { label: string; dateObj: Date | null; calls: typeof dateFilteredCalls } } = {};

    sorted.forEach((c) => {
      let key = 'Hoy';
      let label = 'Hoy';
      let dateObj: Date | null = null;
      if (c.fecha_hora) {
        const d = new Date(c.fecha_hora);
        if (!isNaN(d.getTime())) {
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          label = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
        }
      }
      if (!groups[key]) {
        groups[key] = { label, dateObj, calls: [] };
      }
      groups[key].calls.push(c);
    });

    const entries = Object.values(groups);

    // Compute metric percentages for each real group
    return entries.map(({ label, calls: groupCalls }) => {
      let pCount = 0;
      let nCount = 0;
      let dCount = 0;

      groupCalls.forEach((c) => {
        const npsType = getNormalizedNPS(c.nps_pronostico, c.qa_score_global);
        const score = c.nps_pronostico?.score;
        if (npsType === 'PROMOTOR' || (score !== undefined && score >= 9)) {
          pCount++;
        } else if (npsType === 'DETRACTOR' || (score !== undefined && score <= 6) || c.effectiveOps.es_detractor) {
          dCount++;
        } else {
          nCount++;
        }
      });

      const tot = groupCalls.length;
      const p = Math.round((pCount / tot) * 100);
      const n = Math.round((nCount / tot) * 100);
      const d = tot === 0 ? 0 : 100 - p - n;
      const score = p - d; // tNPS score from -100 to +100

      return {
        label,
        total: tot,
        p,
        n,
        d,
        score,
        promotersCount: pCount,
        passivesCount: nCount,
        detractorsCount: dCount
      };
    });
  }, [dateFilteredCalls]);

  // Open Drawer for a specific call
  const handleOpenDrawer = (call: CallRecord) => {
    setDrawerCall(call);
    setAudioCurrentTime(0);
    setExternalSeekTime(null);
    setSaveSuccessNotice(null);

    setCheckIdentidad(Boolean(call.cumplimiento_guion?.verificacion_identidad ?? true));
    setCheckEmpatia((call.evaluacion_criterios?.amabilidad_empatia?.nota ?? 100) >= 70);
    setCheckSolucion(Boolean(call.resolucion_primer_contacto ?? true));

    setManageStatus(call.estado_gestion || 'en_gestion');
    setManageAction(call.accion_inmediata || call.diagnostico_operaciones?.plan_accion_cliente || '');
    setManageResult(call.resultado_fidelizacion || 'Convertido a Promotor (NPS 9-10)');
    setManageCoachingNotes(call.comentarios_seguimiento || '');
  };

  const handleCloseDrawer = () => {
    setDrawerCall(null);
  };

  // Save Management Action to Supabase
  const handleSaveDrawerManagement = async () => {
    if (!drawerCall) return;
    setIsSavingAction(true);
    setSaveSuccessNotice(null);

    const updates = {
      estado_gestion: manageStatus,
      accion_inmediata: manageAction,
      resultado_fidelizacion: manageResult,
      comentarios_seguimiento: manageCoachingNotes
    };

    const res = await updateOperationsManagementStatus(drawerCall.id, updates);
    setIsSavingAction(false);

    if (res.success) {
      setSaveSuccessNotice('¡Acción de fidelización y coaching guardada con éxito en Supabase!');
      const updated: CallRecord = {
        ...drawerCall,
        ...updates,
        fecha_gestion: new Date().toISOString()
      };
      if (onUpdateCall) onUpdateCall(updated);
      setDrawerCall(updated);
      setTimeout(() => setSaveSuccessNotice(null), 3500);
    } else {
      alert(`Error al guardar: ${res.error || 'Intente nuevamente'}`);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-20 animate-in fade-in">
      {/* ========================================================= */}
      {/* 1. HEADER & EXECUTIVE TABS (Idéntico a imagen de referencia)*/}
      {/* ========================================================= */}
      <div className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-['Google_Sans',sans-serif] text-2xl font-extrabold text-[#111827] tracking-tight">
              NPS Operativo
            </h1>
            <p className="text-xs text-[#6B7280]">
              Monitoreo ejecutivo de satisfacción, causas raíz de detracción y coaching a asesores
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCallsToCSV(filteredDetractorCalls, `NPS_Detractores_${new Date().toISOString().slice(0, 10)}.csv`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#D1D5DB] bg-white px-3.5 py-2 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB] transition shadow-2xs"
            >
              <Download className="h-3.5 w-3.5 text-[#6B7280]" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => exportCallsToExcel(filteredDetractorCalls, `Reporte_NPS_Operaciones_${new Date().toISOString().slice(0, 10)}.xlsx`)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4F46E5] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#4338CA] transition"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Exportar Reporte</span>
            </button>
          </div>
        </div>

        {/* Sub-Tabs: Overview | Responses (Detractores) | Coaching */}
        <div className="flex items-center gap-8 -mb-3 pt-2 text-sm font-semibold">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`pb-3 transition border-b-2 ${
              activeSubTab === 'overview'
                ? 'border-[#4F46E5] text-[#4F46E5] font-bold'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveSubTab('responses')}
            className={`pb-3 transition border-b-2 flex items-center gap-2 ${
              activeSubTab === 'responses'
                ? 'border-[#4F46E5] text-[#4F46E5] font-bold'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            <span>Responses (Detractores)</span>
            <span className="rounded-full bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.2">
              {allDetractorCalls.length}
            </span>
          </button>
          <button
            onClick={() => setActiveSubTab('coaching')}
            className={`pb-3 transition border-b-2 ${
              activeSubTab === 'coaching'
                ? 'border-[#4F46E5] text-[#4F46E5] font-bold'
                : 'border-transparent text-[#6B7280] hover:text-[#111827]'
            }`}
          >
            Coaching & Asesores
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. TOP FILTERS ROW (Segment, Company, Time Period)        */}
      {/* ========================================================= */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Segment Filter */}
        <div className="flex flex-col gap-1 min-w-[190px]">
          <span className="text-[11px] font-semibold text-[#4B5563]">Segment</span>
          <div className="flex items-center rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#1F2937] shadow-2xs">
            <Layers className="h-4 w-4 text-[#9CA3AF] mr-2 shrink-0" />
            <select
              value={selectedQueue}
              onChange={(e) => setSelectedQueue(e.target.value)}
              className="w-full bg-transparent font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="all">All segments</option>
              {uniqueQueues.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Company / Queue Filter */}
        <div className="flex flex-col gap-1 min-w-[190px]">
          <span className="text-[11px] font-semibold text-[#4B5563]">Asesor Responsable</span>
          <div className="flex items-center rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#1F2937] shadow-2xs">
            <Building2 className="h-4 w-4 text-[#9CA3AF] mr-2 shrink-0" />
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full bg-transparent font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="all">All agents ({uniqueAgents.length})</option>
              {uniqueAgents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Time Period Filter */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <span className="text-[11px] font-semibold text-[#4B5563]">Time Period</span>
          <div className="flex items-center rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#1F2937] shadow-2xs">
            <Calendar className="h-4 w-4 text-[#9CA3AF] mr-2 shrink-0" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="w-full bg-transparent font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
            </select>
          </div>
        </div>

        {/* Churn Severity Filter */}
        <div className="flex flex-col gap-1 min-w-[170px]">
          <span className="text-[11px] font-semibold text-[#4B5563]">Severidad Churn</span>
          <div className="flex items-center rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#1F2937] shadow-2xs">
            <Flame className="h-4 w-4 text-red-500 mr-2 shrink-0" />
            <select
              value={selectedChurnRisk}
              onChange={(e) => setSelectedChurnRisk(e.target.value as any)}
              className="w-full bg-transparent font-medium focus:outline-hidden cursor-pointer"
            >
              <option value="all">Todos los Niveles</option>
              <option value="critico">🚨 Crítico (SUBTEL)</option>
              <option value="medio">⚠️ Moderado</option>
              <option value="bajo">Bajo</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. METRIC CARDS ROW (Exactamente como la imagen: 5 cards) */}
      {/* ========================================================= */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Shown (Audios Analizados) */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
            <Headphones className="h-4 w-4 text-[#9CA3AF]" />
            <span>Total Shown</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-[#111827]">
              {populationStats.total.toLocaleString()}
            </span>
            <span className="inline-flex items-center text-[11px] font-bold text-emerald-600">
              <TrendingUp className="h-3 w-3 mr-0.5" /> 3%
            </span>
          </div>
        </div>

        {/* Card 2: Total Responses (Llamadas Calificadas) */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
            <MessageSquareQuote className="h-4 w-4 text-[#9CA3AF]" />
            <span>Total Responses</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-[#111827]">
              {(populationStats.promotersCount + populationStats.passivesCount + populationStats.detractorsCount).toLocaleString()}
            </span>
            <span className="inline-flex items-center text-[11px] font-bold text-emerald-600">
              <TrendingUp className="h-3 w-3 mr-0.5" /> 30%
            </span>
          </div>
        </div>

        {/* Card 3: Response Rate (CSAT Estimado) */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
            <Activity className="h-4 w-4 text-[#9CA3AF]" />
            <span>CSAT Promedio</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-[#111827]">
              {populationStats.avgCsat}
            </span>
            <span className="inline-flex items-center text-[11px] font-bold text-emerald-600">
              <TrendingUp className="h-3 w-3 mr-0.5" /> 2%
            </span>
          </div>
        </div>

        {/* Card 4: Dismissed (Pasivos / Neutros) */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
            <Clock3 className="h-4 w-4 text-[#9CA3AF]" />
            <span>Passives (Neutros)</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-[#111827]">
              {populationStats.passivesCount}
            </span>
            <span className="inline-flex items-center text-[11px] font-bold text-emerald-600">
              <TrendingUp className="h-3 w-3 mr-0.5" /> 4%
            </span>
          </div>
        </div>

        {/* Card 5: Qualitative Responses (Detractores Críticos) */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
            <Flame className="h-4 w-4 text-red-500" />
            <span>Detractores Foco</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-red-600">
              {populationStats.detractorsCount}
            </span>
            <span className="inline-flex items-center text-[11px] font-bold text-red-600">
              <TrendingDown className="h-3 w-3 mr-0.5" /> 4%
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 4. HERO ANALYTICS ROW: SCORE GAUGE + RESPONSES DONUT     */}
      {/* ========================================================= */}
      {activeSubTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Card: Score (Semi-Circle Gauge) */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#111827]">
                    Score
                  </h3>
                  <button className="text-[#9CA3AF] hover:text-[#4B5563]" title="tNPS calculado como % Promotores menos % Detractores">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
                <button className="rounded-full p-1 text-[#9CA3AF] hover:bg-[#F3F4F6]">
                  <span className="font-bold text-xs tracking-widest leading-none">···</span>
                </button>
              </div>

              {/* Semi-Circle SVG Gauge */}
              <div className="py-6 flex items-center justify-center">
                <NpsGauge score={populationStats.tnpsGlobal} />
              </div>

              {/* Card Footer status info */}
              <div className="pt-4 border-t border-[#F3F4F6] flex items-center justify-between text-xs text-[#6B7280]">
                <span>Brecha de Calidad Asesor: <strong className="text-[#111827]">{populationStats.qaGap} pts</strong></span>
                <span className={`font-bold ${populationStats.tnpsGlobal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {populationStats.tnpsGlobal >= 30 ? 'Desempeño Favorable' : populationStats.tnpsGlobal >= 0 ? 'Zona Neutral' : 'Zona de Rescate'}
                </span>
              </div>
            </div>

            {/* Right Card: Responses (Donut Chart) */}
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#111827]">
                  Responses
                </h3>
                <span className="text-xs text-[#6B7280]">
                  {populationStats.total} total responses
                </span>
              </div>

              {/* Donut Chart with Legend */}
              <div className="py-4">
                <NpsDonutChart
                  promoters={populationStats.promotersCount}
                  passives={populationStats.passivesCount}
                  detractors={populationStats.detractorsCount}
                  total={populationStats.total}
                />
              </div>

              {/* Card Footer */}
              <div className="pt-4 border-t border-[#F3F4F6] flex items-center justify-between text-xs text-[#6B7280]">
                <span>Tasa de Detracción: <strong className="text-red-600">{populationStats.detractorsPct}%</strong></span>
                <button
                  onClick={() => setActiveSubTab('responses')}
                  className="font-bold text-[#4F46E5] hover:underline"
                >
                  Ver Lista de Detractores →
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* 5. NPS HISTORY / BREAKDOWN STACKED BARS                   */}
          {/* ========================================================= */}
          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#111827]">
                  NPS History & Distribución Operativa
                </h3>
                <p className="text-xs text-[#6B7280]">
                  {npsHistoryBuckets.length === 0
                    ? 'Evolución temporal según grabaciones analizadas'
                    : npsHistoryBuckets.length === 1
                    ? 'Datos 100% reales de la fecha registrada (se expande al cargar audios de otros días)'
                    : `Evolución real en ${npsHistoryBuckets.length} fechas registradas`}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-[#374151]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#111827]" /> Score tNPS
                </span>
                <span className="flex items-center gap-1.5 text-[#374151]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#10B981]" /> Promoters
                </span>
                <span className="flex items-center gap-1.5 text-[#374151]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#D1D5DB]" /> Passives
                </span>
                <span className="flex items-center gap-1.5 text-[#374151]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" /> Detractors
                </span>
              </div>
            </div>

            {npsHistoryBuckets.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="h-12 w-12 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-3 text-[#9CA3AF]">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <p className="font-bold text-[#374151] text-xs">Sin grabaciones en el período seleccionado</p>
                <p className="text-[11px] text-[#6B7280] mt-1 max-w-sm">
                  Carga audios en la Mesa de Operaciones para registrar la distribución y evolución temporal del tNPS.
                </p>
              </div>
            ) : (
              <div className="relative pt-4 pb-2 px-2">
                {/* Chart Area with Dual Y-Axis Labels and Grid */}
                <div className="relative h-48 w-full flex items-end">
                  {/* Left Y-Axis: Score Scale */}
                  <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-[10px] font-bold text-[#9CA3AF] pointer-events-none pr-2">
                    <span>100</span>
                    <span>50</span>
                    <span>0</span>
                    <span>-50</span>
                    <span>-100</span>
                  </div>

                  {/* Right Y-Axis: Responses % Scale */}
                  <div className="absolute right-0 top-0 bottom-6 flex flex-col justify-between text-[10px] font-bold text-[#9CA3AF] pointer-events-none pl-2">
                    <span>100%</span>
                    <span>75%</span>
                    <span>50%</span>
                    <span>25%</span>
                    <span>0%</span>
                  </div>

                  {/* Horizontal Grid Lines */}
                  <div className="absolute left-8 right-10 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
                    <div className="border-b border-dashed border-[#E5E7EB] w-full" />
                    <div className="border-b border-dashed border-[#E5E7EB] w-full" />
                    <div className="border-b border-[#D1D5DB] w-full" />
                    <div className="border-b border-dashed border-[#E5E7EB] w-full" />
                    <div className="border-b border-[#E5E7EB] w-full" />
                  </div>

                  {/* Bars Container */}
                  <div className="ml-8 mr-10 w-full h-full pb-6 flex items-end justify-around relative">
                    {/* SVG Connecting Polyline for Net Score */}
                    {npsHistoryBuckets.length > 1 && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                        viewBox="0 0 1000 100"
                        preserveAspectRatio="none"
                      >
                        <polyline
                          fill="none"
                          stroke="#111827"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={npsHistoryBuckets
                            .map((b, i) => {
                              const x = ((i + 0.5) / npsHistoryBuckets.length) * 1000;
                              // Score goes from -100 to +100. Normalize to 0 (top = 100) .. 100 (bottom = -100)
                              // clamp inside 10 .. 90 to prevent clipping
                              const y = 90 - ((b.score + 100) / 200) * 80;
                              return `${x},${y}`;
                            })
                            .join(' ')}
                        />
                      </svg>
                    )}

                    {/* Stacked Bars */}
                    {npsHistoryBuckets.map((bucket, idx) => {
                      // Calculate score dot position percentage from bottom:
                      const scoreBottomPct = Math.max(5, Math.min(95, ((bucket.score + 100) / 200) * 100));

                      return (
                        <div
                          key={idx}
                          className="flex flex-col items-center h-full justify-end relative group px-2"
                          style={{ width: `${Math.max(14, Math.min(28, 100 / npsHistoryBuckets.length))}%` }}
                        >
                          {/* Stacked Vertical Bar */}
                          <div className="w-12 sm:w-16 h-full flex flex-col rounded-t-lg overflow-hidden relative shadow-2xs border border-white/50 bg-[#F3F4F6]">
                            {/* Green (Promoters) */}
                            <div
                              style={{ height: `${bucket.p}%` }}
                              className="bg-[#10B981] w-full transition-all duration-500"
                              title={`Promotores: ${bucket.promotersCount} (${bucket.p}%)`}
                            />
                            {/* Grey (Passives) */}
                            <div
                              style={{ height: `${bucket.n}%` }}
                              className="bg-[#D1D5DB] w-full transition-all duration-500"
                              title={`Pasivos: ${bucket.passivesCount} (${bucket.n}%)`}
                            />
                            {/* Red (Detractors) */}
                            <div
                              style={{ height: `${bucket.d}%` }}
                              className="bg-[#EF4444] w-full transition-all duration-500"
                              title={`Detractores: ${bucket.detractorsCount} (${bucket.d}%)`}
                            />
                          </div>

                          {/* Score Dot Indicator over Bar */}
                          <div
                            className="absolute z-20 flex flex-col items-center pointer-events-none transition-all duration-500"
                            style={{ bottom: `calc(${scoreBottomPct}% + 18px)` }}
                          >
                            <span className="h-3 w-3 rounded-full bg-[#111827] ring-2 ring-white shadow-xs" />
                            <span className="text-[10px] font-black text-[#111827] bg-white/90 px-1 rounded-sm shadow-2xs -mt-5">
                              {bucket.score > 0 ? `+${bucket.score}` : bucket.score}
                            </span>
                          </div>

                          {/* X-Axis Label */}
                          <div className="flex flex-col items-center mt-2">
                            <span className="text-[11px] font-bold text-[#374151] whitespace-nowrap">
                              {bucket.label}
                            </span>
                            <span className="text-[10px] text-[#9CA3AF] whitespace-nowrap">
                              {bucket.total} llamada{bucket.total > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ========================================================= */}
      {/* 6. RESPONSES / RESCUE TABLE (Embudo de Rescate Detractores) */}
      {/* ========================================================= */}
      {(activeSubTab === 'overview' || activeSubTab === 'responses') && (
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#111827]">
                  Matriz de Rescate de Detractores
                </h3>
                <span className="rounded-full bg-red-100 text-red-700 text-xs font-bold px-2.5 py-0.5">
                  {filteredDetractorCalls.length} casos para gestión
                </span>
              </div>
              <p className="text-xs text-[#6B7280] mt-0.5">
                Auditoría con reproducción, identificación de causas raíz y seguimiento para convertir en promotores
              </p>
            </div>

            {/* Live Search Input */}
            <div className="relative min-w-[260px] flex-1 max-w-sm">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#9CA3AF]" />
              <input
                type="text"
                placeholder="Buscar por cliente, teléfono o asesor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-full border border-[#D1D5DB] bg-[#F9FAFB] py-2 pl-9 pr-4 text-xs text-[#111827] focus:border-[#4F46E5] focus:bg-white focus:outline-hidden"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-[#E5E7EB]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  <th className="py-3 px-4">Fecha & Llamada</th>
                  <th className="py-3 px-4">Cliente / Teléfono</th>
                  <th className="py-3 px-4">Asesor Responsable</th>
                  <th className="py-3 px-4">Motivo IA Detracción</th>
                  <th className="py-3 px-4">tNPS / QA</th>
                  <th className="py-3 px-4">Estado Rescate</th>
                  <th className="py-3 px-4 text-right">Acción Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6] text-[#111827]">
                {filteredDetractorCalls.length > 0 ? (
                  filteredDetractorCalls.map((call) => {
                    const ops = call.effectiveOps;
                    const isHighRisk = ops.riesgo_churn === 'critico' || ops.amenaza_subtel_sernac;

                    return (
                      <tr 
                        key={call.id}
                        className={`transition cursor-pointer ${
                          isHighRisk 
                            ? 'border-l-4 border-l-red-600 bg-red-50/40 hover:bg-red-50/70' 
                            : 'hover:bg-[#F9FAFB]'
                        }`}
                        onClick={() => handleOpenDrawer(call)}
                      >
                        {/* Fecha */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#111827]">{call.codigo_llamada}</div>
                          <div className="text-[11px] text-[#6B7280]">
                            {call.fecha_hora ? new Date(call.fecha_hora).toLocaleDateString('es-CL', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                            }) : 'Hoy'}
                          </div>
                        </td>

                        {/* Cliente */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#111827]">{call.cliente_nombre || 'Cliente Claro'}</div>
                          <div className="text-[11px] font-mono text-[#6B7280]">{call.cliente_telefono || '+56 9 **** ****'}</div>
                          <span className="text-[10px] text-[#9CA3AF]">{call.cola_atencion}</span>
                        </td>

                        {/* Asesor */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F46E5] font-bold text-xs shrink-0">
                              {(call.agente_nombre || 'A').charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-[#111827]">{call.agente_nombre || 'Asesor Claro'}</div>
                              <div className="text-[10px] text-[#6B7280]">{call.agente_id || 'AG-000'}</div>
                            </div>
                          </div>
                        </td>

                        {/* Motivo IA */}
                        <td className="py-3 px-4 max-w-xs">
                          <div className="font-bold text-[#111827] flex items-center gap-1.5 truncate">
                            {isHighRisk && <Flame className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                            <span>{ops.causa_raiz_nombre}</span>
                          </div>
                          <div className="text-[11px] text-[#6B7280] truncate">
                            {ops.causa_raiz_detalle || call.resumen}
                          </div>
                        </td>

                        {/* tNPS / QA */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-md bg-red-100 text-red-700 font-extrabold px-1.5 py-0.5 text-xs">
                              {call.nps_pronostico?.score ?? 0}/10
                            </span>
                            <span className="text-[11px] text-[#6B7280]">
                              (QA {call.qa_score_global}%)
                            </span>
                          </div>
                          {isHighRisk && (
                            <span className="inline-block rounded-full bg-red-600 text-white font-extrabold px-2 py-0.2 text-[9px] mt-1">
                              🚨 ALERTA SUBTEL
                            </span>
                          )}
                        </td>

                        {/* Estado Rescate */}
                        <td className="py-3 px-4">
                          {call.estado_gestion === 'convertido_promotor' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-0.5 text-[10px]">
                              <CheckCircle className="h-3 w-3 text-emerald-600" />
                              <span>Convertido a Promotor</span>
                            </span>
                          ) : call.estado_gestion === 'contactado' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 text-[10px]">
                              <PhoneCall className="h-3 w-3 text-blue-600" />
                              <span>Contactado</span>
                            </span>
                          ) : call.estado_gestion === 'en_gestion' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 font-bold px-2.5 py-0.5 text-[10px]">
                              <Clock3 className="h-3 w-3 text-amber-600" />
                              <span>En Plan de Mejora</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 font-bold px-2 py-0.5 text-[10px]">
                              <span>Pendiente Feedback</span>
                            </span>
                          )}
                        </td>

                        {/* Botón Auditar */}
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenDrawer(call);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#4F46E5] px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#4338CA] transition"
                          >
                            <Headphones className="h-3 w-3" />
                            <span>Auditar</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-[#6B7280]">
                      No se encontraron llamadas detractoras para los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. COACHING & ASESORES SUB-TAB                             */}
      {/* ========================================================= */}
      {activeSubTab === 'coaching' && (
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#111827]">
                Ranking de Oportunidades de Mejora por Asesor (Coaching Data)
              </h3>
              <p className="text-xs text-[#6B7280]">
                Asesores con mayor concentración de llamadas detractoras y su falla recurrente para la sesión de feedback
              </p>
            </div>
            <span className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-xs font-bold text-[#374151]">
              Top Feedback
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[#E5E7EB]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F9FAFB] text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">
                  <th className="py-2.5 px-3">Asesor</th>
                  <th className="py-2.5 px-3">Detractores</th>
                  <th className="py-2.5 px-3">Tasa Detracción</th>
                  <th className="py-2.5 px-3">Promedio QA</th>
                  <th className="py-2.5 px-3">Falla Recurrente Detectada</th>
                  <th className="py-2.5 px-3 text-right">Acción Coaching</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {coachingAgentRanking.length > 0 ? (
                  coachingAgentRanking.map((agent) => (
                    <tr key={agent.agente_id} className="hover:bg-[#F9FAFB]">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-[#111827]">{agent.agente_nombre}</div>
                        <div className="text-[10px] text-[#6B7280] font-mono">{agent.agente_id}</div>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-red-600">
                        {agent.detractorCount} casos
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded-md bg-red-100 text-red-700 font-bold px-1.5 py-0.5 text-[10px]">
                          {agent.detractionRate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#111827]">
                        {agent.avgQaScore}%
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 font-bold px-2 py-0.5 text-[10px]">
                          <Zap className="h-2.5 w-2.5 text-amber-600" />
                          <span>{agent.primaryFailure}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedAgent(agent.agente_id);
                            setActiveSubTab('responses');
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-[#D1D5DB] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF] transition"
                        >
                          <span>Ver Casos</span>
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-xs text-[#6B7280]">
                      No hay suficientes datos de asesores para generar el ranking en este período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 8. DRAWER LATERAL DE AUDITORÍA & TRAZABILIDAD (Bloque C)  */}
      {/* ========================================================= */}
      {drawerCall && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in">
          <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E5E7EB] bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm">
                  <Headphones className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#111827]">
                      Auditoría & Trazabilidad de Rescate
                    </h3>
                    <span className="rounded-md bg-red-100 text-red-700 font-extrabold px-2 py-0.5 text-xs">
                      tNPS {drawerCall.nps_pronostico?.score ?? 0}/10
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    {drawerCall.codigo_llamada} · Cliente: {drawerCall.cliente_nombre || 'Cliente Claro'} ({drawerCall.cliente_telefono})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSelectCall(drawerCall)}
                  className="rounded-full border border-[#D1D5DB] bg-white px-3 py-1.5 text-xs font-semibold text-[#4F46E5] hover:bg-[#EEF2FF] transition"
                  title="Abrir en Visor Completo de Auditoría"
                >
                  Visor Completo
                </button>
                <button
                  onClick={handleCloseDrawer}
                  className="rounded-full p-2 text-[#6B7280] hover:bg-[#F3F4F6] transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="p-6 space-y-6">
              {saveSuccessNotice && (
                <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 font-semibold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccessNotice}</span>
                </div>
              )}

              {/* 1. Reproductor de Audio Sincronizado */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] flex items-center gap-1.5">
                    <Headphones className="h-4 w-4 text-[#4F46E5]" />
                    Reproducción de Audio Sincronizada
                  </span>
                  <span className="text-xs text-[#6B7280] font-mono">
                    {drawerCall.duracion_total || '00:00'}
                  </span>
                </div>

                <EnterpriseAudioPlayer
                  call={drawerCall}
                  currentTime={audioCurrentTime}
                  onTimeUpdate={(t) => setAudioCurrentTime(t)}
                  externalSeekTime={externalSeekTime}
                  onSeekComplete={() => setExternalSeekTime(null)}
                />
              </div>

              {/* 2. Resumen Ejecutivo de IA (Causa Raíz) */}
              <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
                <div className="flex items-center gap-2 text-red-900 font-bold text-xs uppercase tracking-wider mb-1.5">
                  <Flame className="h-4 w-4 text-red-600" />
                  <span>Motivo Exacto de Detracción (Diagnóstico IA)</span>
                </div>
                <h4 className="text-sm font-bold text-[#111827]">
                  {drawerCall.effectiveOps?.causa_raiz_nombre}
                </h4>
                <p className="text-xs text-[#374151] mt-1 leading-relaxed">
                  {drawerCall.effectiveOps?.causa_raiz_detalle || drawerCall.resumen}
                </p>

                {/* Citas textuales críticas de quiebre */}
                {drawerCall.effectiveOps?.citas_quiebre_cliente && drawerCall.effectiveOps.citas_quiebre_cliente.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">Frases de Quiebre del Cliente:</span>
                    {drawerCall.effectiveOps.citas_quiebre_cliente.map((cita, i) => (
                      <div key={i} className="rounded-xl border border-red-200 bg-white p-2 text-xs italic text-red-900 flex items-start gap-1.5">
                        <MessageSquareQuote className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span>"{cita}"</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Checklist de Calidad del Asesor */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xs">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] block mb-3">
                  Checklist de Calidad del Asesor (Ajuste de Supervisor)
                </span>
                <div className="space-y-2.5">
                  {/* Pregunta 1 */}
                  <div className="flex items-center justify-between rounded-xl border border-[#F3F4F6] bg-[#F9FAFB] p-3 text-xs">
                    <div>
                      <div className="font-bold text-[#111827]">¿Aplicó protocolo de validación de identidad?</div>
                      <div className="text-[11px] text-[#6B7280]">Confirmación de RUT, nombre y número de contacto</div>
                    </div>
                    <button
                      onClick={() => setCheckIdentidad(!checkIdentidad)}
                      className={`rounded-full px-3 py-1 font-bold text-xs transition ${
                        checkIdentidad ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {checkIdentidad ? 'SÍ (Cumplido)' : 'NO (Falla)'}
                    </button>
                  </div>

                  {/* Pregunta 2 */}
                  <div className="flex items-center justify-between rounded-xl border border-[#F3F4F6] bg-[#F9FAFB] p-3 text-xs">
                    <div>
                      <div className="font-bold text-[#111827]">¿Mostró empatía ante el reclamo?</div>
                      <div className="text-[11px] text-[#6B7280]">Validación emocional, escucha activa y sin interrupciones</div>
                    </div>
                    <button
                      onClick={() => setCheckEmpatia(!checkEmpatia)}
                      className={`rounded-full px-3 py-1 font-bold text-xs transition ${
                        checkEmpatia ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {checkEmpatia ? 'SÍ (Cumplido)' : 'NO (Falla)'}
                    </button>
                  </div>

                  {/* Pregunta 3 */}
                  <div className="flex items-center justify-between rounded-xl border border-[#F3F4F6] bg-[#F9FAFB] p-3 text-xs">
                    <div>
                      <div className="font-bold text-[#111827]">¿Brindó solución clara o derivó correctamente?</div>
                      <div className="text-[11px] text-[#6B7280]">Resolución en primer contacto o entrega de ticket formal</div>
                    </div>
                    <button
                      onClick={() => setCheckSolucion(!checkSolucion)}
                      className={`rounded-full px-3 py-1 font-bold text-xs transition ${
                        checkSolucion ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {checkSolucion ? 'SÍ (Cumplido)' : 'NO (Falla)'}
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Transcripción con Frases Críticas */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-2xs">
                <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] block mb-3">
                  Diálogo & Transcripción (Clic para saltar en audio)
                </span>
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
                  {drawerCall.segmentos && drawerCall.segmentos.length > 0 ? (
                    drawerCall.segmentos.map((seg, i) => {
                      const isClient = seg.hablante === 'cliente';
                      const isNegative = (seg.sentimientoScore || 0) < -0.2 || /molesto|enojad|cancela|baja|reclamo|robo|engano|mal servicio|subtel/i.test(seg.texto);
                      return (
                        <div
                          key={i}
                          onClick={() => setExternalSeekTime(seg.inicio || 0)}
                          className={`rounded-xl p-2.5 transition cursor-pointer border ${
                            isNegative
                              ? 'border-red-300 bg-red-50 text-red-950 font-medium'
                              : isClient
                              ? 'border-[#E5E7EB] bg-[#F9FAFB] text-[#111827]'
                              : 'border-blue-100 bg-blue-50/50 text-[#4F46E5]'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-[#6B7280] mb-1">
                            <span className="font-bold uppercase tracking-wider">
                              {isClient ? '👤 Cliente' : '🎧 Asesor'}
                            </span>
                            <span className="font-mono">
                              {Math.floor((seg.inicio || 0) / 60)}:{(Math.floor((seg.inicio || 0) % 60)).toString().padStart(2, '0')}
                            </span>
                          </div>
                          <p className="leading-relaxed">{seg.texto}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-xs text-[#6B7280]">
                      Cargando transcripción optimizada de la llamada...
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Bitácora de Acciones Correctivas (Persistencia Supabase) */}
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-2xs space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <HeartHandshake className="h-4 w-4 text-emerald-600" />
                    Bitácora de Trazabilidad & Coaching
                  </span>
                  <span className="text-[10px] text-emerald-700 font-semibold">Persistencia Supabase</span>
                </div>

                <div>
                  <label className="font-bold text-[#111827] block mb-1">Estado de Gestión del Caso</label>
                  <select
                    value={manageStatus}
                    onChange={(e) => setManageStatus(e.target.value as any)}
                    className="w-full rounded-xl border border-[#D1D5DB] bg-white p-2.5 font-medium text-[#111827] focus:border-[#4F46E5] focus:outline-hidden"
                  >
                    <option value="en_gestion">🟡 En Plan de Mejora / Feedback Asesor</option>
                    <option value="contactado">🔵 Contactado con Cliente (En proceso de rescate)</option>
                    <option value="convertido_promotor">🟢 Fidelizado / Convertido a Promotor (NPS 9-10)</option>
                    <option value="pendiente">🔴 Pendiente de Retroalimentación</option>
                    <option value="caso_cerrado">⚫ Caso Cerrado / Resuelto Definitivo</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#111827] block mb-1">Acción Inmediata con el Cliente</label>
                  <input
                    type="text"
                    placeholder="Ej: Nota de crédito $15.000 autorizada, técnico visita hoy a las 16:00"
                    value={manageAction}
                    onChange={(e) => setManageAction(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] bg-white p-2.5 text-[#111827] focus:border-[#4F46E5] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#111827] block mb-1">Notas de Coaching dadas al Asesor ({drawerCall.agente_nombre})</label>
                  <textarea
                    rows={3}
                    placeholder="Acuerdos de mejora con el asesor: pauta de escucha activa, no dejar hold superior a 1 min..."
                    value={manageCoachingNotes}
                    onChange={(e) => setManageCoachingNotes(e.target.value)}
                    className="w-full rounded-xl border border-[#D1D5DB] bg-white p-2.5 text-[#111827] focus:border-[#4F46E5] focus:outline-hidden"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    disabled={isSavingAction}
                    onClick={handleSaveDrawerManagement}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <span>{isSavingAction ? 'Guardando...' : 'Guardar Trazabilidad'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
