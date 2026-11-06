import React from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Flame, 
  HelpCircle, 
  PhoneCall, 
  Building2, 
  UserX, 
  Users, 
  Layers, 
  ArrowRight, 
  ExternalLink,
  MessageSquareQuote,
  Wrench,
  FileCheck
} from 'lucide-react';
import { CallRecord, DiagnosticoOperaciones, CausaRaizOperativa, ResponsabilidadFalla, RiesgoChurn } from '../types';
import { resolveEffectiveOperationsDiagnosis } from './OperationsEngineeringView';

interface OperationsRootCauseCardProps {
  call: CallRecord;
  onJumpToTime?: (second: number) => void;
}

export const OperationsRootCauseCard: React.FC<OperationsRootCauseCardProps> = ({ call, onJumpToTime }) => {
  const ops: DiagnosticoOperaciones = resolveEffectiveOperationsDiagnosis(call);

  const getCategoriaLabel = (cat: CausaRaizOperativa) => {
    switch (cat) {
      case 'falla_servicio_red':
        return { label: 'Falla Técnica / Red Claro', color: 'bg-red-50 text-red-700 border-red-200' };
      case 'facturacion_cobranza':
        return { label: 'Facturación / Cobro Indebido', color: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'logistica_terreno':
        return { label: 'Logística / Visita Técnica Incumplida', color: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'friccion_procesos':
        return { label: 'Fricción en Procesos / Trabas Claro', color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'llamada_reiterada':
        return { label: 'Llamada Reiterada (Falla en Primer Contacto)', color: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'atencion_asesor':
        return { label: 'Mala Atención / Trato del Asesor', color: 'bg-slate-50 text-slate-700 border-slate-200' };
      case 'consulta_informativa':
      default:
        return { label: 'Consulta Informativa / Gestión Exitosa', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
  };

  const getResponsabilidadLabel = (resp: ResponsabilidadFalla) => {
    switch (resp) {
      case 'claro_empresa':
        return {
          label: 'Falla de Claro (Empresa / Sistemas / Red)',
          desc: 'La causa raíz es de la compañía; el asesor no es responsable de la falla de origen.',
          badge: 'bg-[#FCE8E6] text-[#C5221F] border-[#FAD2CF]',
          icon: Building2
        };
      case 'asesor':
        return {
          label: 'Falla del Asesor (Gestión / Protocolo)',
          desc: 'El descontento fue detonado o agravado por falta de empatía, desinformación o error del agente.',
          badge: 'bg-[#FEF7E0] text-[#B06000] border-[#FEEFC3]',
          icon: UserX
        };
      case 'compartida':
        return {
          label: 'Responsabilidad Compartida (Marca + Asesor)',
          desc: 'Hubo falla de servicio de Claro y además un mal manejo por parte del ejecutivo.',
          badge: 'bg-[#F3E8FD] text-[#8430CE] border-[#E9D5FF]',
          icon: Users
        };
      case 'externa_cliente':
      default:
        return {
          label: 'Externa / Requerimiento Conforme',
          desc: 'Duda o situación imputable a factores externos o sin detracción atribuible.',
          badge: 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]',
          icon: CheckCircle2
        };
    }
  };

  const getChurnBadge = (churn: RiesgoChurn) => {
    switch (churn) {
      case 'critico':
        return {
          label: 'RIESGO DE CHURN CRÍTICO',
          color: 'bg-red-600 text-white animate-pulse',
          icon: Flame
        };
      case 'medio':
        return {
          label: 'RIESGO DE CHURN MODERADO',
          color: 'bg-amber-500 text-white',
          icon: AlertTriangle
        };
      case 'bajo':
      default:
        return {
          label: 'BAJO RIESGO DE FUGA',
          color: 'bg-emerald-600 text-white',
          icon: CheckCircle2
        };
    }
  };

  const catStyle = getCategoriaLabel(ops.causa_raiz_categoria);
  const respInfo = getResponsabilidadLabel(ops.responsabilidad);
  const RespIcon = respInfo.icon;
  const churnBadge = getChurnBadge(ops.riesgo_churn);
  const ChurnIcon = churnBadge.icon;

  return (
    <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F3F4] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0B192C] text-white shadow-xs">
            <ShieldAlert className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Diagnóstico de Operaciones & Causa Raíz de Detracción
              </h3>
              <span className="rounded-full bg-[#0B192C] px-2.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider">
                Mesa Operativa Claro
              </span>
            </div>
            <p className="text-xs text-[#5F6368]">
              Análisis causal de por qué el cliente llegó molesto y plan de acción para evitar la fuga (Churn).
            </p>
          </div>
        </div>

        {/* Churn Risk Badge */}
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tracking-wide shadow-xs ${churnBadge.color}`}>
          <ChurnIcon className="h-3.5 w-3.5" />
          <span>{churnBadge.label}</span>
        </div>
      </div>

      {/* Critical Alerts Banner (SUBTEL / SERNAC / Reiteración) */}
      {(ops.amenaza_subtel_sernac || ops.llamada_reiterada || ops.es_detractor) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-red-50/80 border border-red-200/80 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>Alertas Operativas Detectadas:</span>
          </div>

          {ops.amenaza_subtel_sernac && (
            <span className="rounded-md bg-red-700 px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
              🚨 Amenaza Reclamo SUBTEL / SERNAC
            </span>
          )}

          {ops.llamada_reiterada && (
            <span className="rounded-md bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
              🔄 Llamada Reiterada (Falla 1er Contacto)
            </span>
          )}

          {ops.es_detractor && (
            <span className="rounded-md bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 text-[11px] font-bold">
              tNPS Detractor ({call.nps_pronostico?.score ?? 0}/10)
            </span>
          )}
        </div>
      )}

      {/* Main Grid: Causa Raiz & Desacoplamiento */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Left Column: Causa Raiz */}
        <div className="flex flex-col rounded-2xl border border-[#E8EAED] bg-[#F8F9FA] p-4.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
              1. Causa Raíz de la Detracción
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${catStyle.color}`}>
              {catStyle.label}
            </span>
          </div>

          <h4 className="text-sm font-bold text-[#202124] mb-1.5">
            {ops.causa_raiz_nombre}
          </h4>

          <p className="text-xs leading-relaxed text-[#3C4043] flex-1">
            {ops.causa_raiz_detalle}
          </p>

          <div className="mt-3 pt-3 border-t border-[#E8EAED] flex items-center justify-between text-[11px]">
            <span className="text-[#5F6368] font-medium">Área Operativa Responsable:</span>
            <span className="font-bold text-[#202124] bg-white border border-[#DADCE0] px-2 py-0.5 rounded-md">
              {ops.area_responsable}
            </span>
          </div>
        </div>

        {/* Right Column: Desacoplamiento (Marca vs Asesor) */}
        <div className="flex flex-col rounded-2xl border border-[#E8EAED] bg-[#F8F9FA] p-4.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
              2. Desacoplamiento Operativo
            </span>
            <span className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${respInfo.badge}`}>
              <RespIcon className="h-3 w-3" />
              <span>{respInfo.label}</span>
            </span>
          </div>

          <h4 className="text-sm font-bold text-[#202124] mb-1.5">
            Atribución de Responsabilidad
          </h4>

          <p className="text-xs leading-relaxed text-[#3C4043] flex-1">
            {ops.responsabilidad_justificacion || respInfo.desc}
          </p>

          <div className="mt-3 pt-3 border-t border-[#E8EAED] flex items-center justify-between text-[11px]">
            <span className="text-[#5F6368]">Calificación tNPS Asesor:</span>
            <span className="font-bold text-[#1A73E8]">
              {call.nps_pronostico?.score_agente ?? 8}/10 (Evaluación humana)
            </span>
          </div>
        </div>
      </div>

      {/* Citas Textuales del Cliente */}
      {ops.citas_quiebre_cliente && ops.citas_quiebre_cliente.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[#E8EAED] bg-[#FFFFFF] p-4">
          <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[#202124]">
            <MessageSquareQuote className="h-4 w-4 text-[#1A73E8]" />
            <span>Citas Textuales del Cliente donde Verbaliza la Detracción:</span>
          </div>
          <div className="space-y-2">
            {ops.citas_quiebre_cliente.map((cita, idx) => (
              <div 
                key={idx}
                className="flex items-start gap-2 rounded-xl bg-[#F8F9FA] p-2.5 border border-[#F1F3F4] text-xs text-[#3C4043] italic"
              >
                <span className="text-[#80868B] font-bold not-italic">“</span>
                <span className="flex-1">{cita}</span>
                <span className="text-[#80868B] font-bold not-italic">”</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan de Acción Operativo (Inmediato + Proceso) */}
      <div className="mt-4 rounded-2xl border border-[#AECBFA] bg-[#E8F0FE]/40 p-4.5">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-4.5 w-4.5 text-[#1A73E8]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A73E8]">
            Plan de Acción Operativo para Mitigar la Detracción
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Acción con el Cliente */}
          <div className="rounded-xl bg-white border border-[#DADCE0] p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-[#137333]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Acción Inmediata con el Cliente (Rescate)</span>
            </div>
            <p className="text-xs text-[#3C4043] leading-relaxed">
              {ops.plan_accion_cliente}
            </p>
          </div>

          {/* Acción de Proceso Claro */}
          <div className="rounded-xl bg-white border border-[#DADCE0] p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-[#1A73E8]">
              <FileCheck className="h-3.5 w-3.5" />
              <span>Acción Preventiva de Proceso ({ops.area_responsable})</span>
            </div>
            <p className="text-xs text-[#3C4043] leading-relaxed">
              {ops.plan_accion_proceso}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

