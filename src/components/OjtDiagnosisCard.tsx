import React from 'react';
import { 
  GraduationCap, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle, 
  Play, 
  Target, 
  ShieldCheck, 
  Users, 
  ArrowRight,
  TrendingUp,
  Award
} from 'lucide-react';
import { CallRecord, DiagnosticoOJT, OjtMadurez, OjtBrecha } from '../types';

interface OjtDiagnosisCardProps {
  call: CallRecord;
}

export const OjtDiagnosisCard: React.FC<OjtDiagnosisCardProps> = ({ call }) => {
  const ojt: DiagnosticoOJT = call.diagnostico_ojt || {
    nivel_madurez: call.qa_score_global >= 80 ? 'LISTO_PRODUCCION' : call.qa_score_global >= 60 ? 'EN_DESARROLLO' : 'EN_REFUERZO',
    indice_autonomia: call.qa_score_global >= 80 ? 90 : call.qa_score_global >= 60 ? 70 : 45,
    brecha_principal: (call.quiebres_atencion && call.quiebres_atencion.length > 0)
      ? 'PROCEDIMIENTO_GUION'
      : (call.silencio_analisis?.porcentaje_silencio > 15)
      ? 'HERRAMIENTA_SISTEMAS'
      : 'NINGUNA_DOMINIO',
    requiere_intervencion_tutor: call.qa_score_global < 75,
    roleplay_sugerido: 'Roleplay de 5 minutos: Simulación de cliente chileno con reclamo de cobro, practicando consulta rápida en Somos Clave y despedida con encuesta 0-10.',
    feedback_pedagogico: 'El asesor en OJT demuestra buena actitud y respeto. Necesita mayor fluidez al navegar los sistemas de Claro para reducir tiempos muertos.',
    observacion_piso_real: 'Interacción en vivo con cliente real. Mantiene el temple pero requiere reforzar la agilidad de respuesta.'
  };

  const getMadurezBadge = (nivel: OjtMadurez) => {
    switch (nivel) {
      case 'LISTO_PRODUCCION':
        return {
          label: 'LISTO PARA PRODUCCIÓN',
          sub: 'Autónomo en piso',
          bg: 'bg-[#E6F4EA]',
          border: 'border-[#34A853]/40',
          text: 'text-[#137333]',
          icon: Award
        };
      case 'EN_DESARROLLO':
        return {
          label: 'EN DESARROLLO (NIDO)',
          sub: 'Autonomía moderada',
          bg: 'bg-[#FEF7E0]',
          border: 'border-[#FBBC05]/50',
          text: 'text-[#B06000]',
          icon: TrendingUp
        };
      case 'EN_REFUERZO':
      default:
        return {
          label: 'REQUIERE REFUERZO OJT',
          sub: 'Acompañamiento cercano',
          bg: 'bg-[#FCE8E6]',
          border: 'border-[#EA4335]/40',
          text: 'text-[#EA4335]',
          icon: AlertCircle
        };
    }
  };

  const getBrechaInfo = (brecha: OjtBrecha) => {
    switch (brecha) {
      case 'PROCEDIMIENTO_GUION':
        return {
          title: 'Procedimiento & Guion Institucional',
          desc: 'Omisión de pasos de la pauta Claro (saludo con apellido, confirmación activa o escala 0 a 10).'
        };
      case 'HERRAMIENTA_SISTEMAS':
        return {
          title: 'Manejo de Herramientas & Sistemas',
          desc: 'Lentitud o vacilación buscando la información en Somos Clave, CRM o facturación.'
        };
      case 'HABILIDADES_BLANDAS':
        return {
          title: 'Habilidades Blandas & Manejo Emocional',
          desc: 'Inseguridad vocal, tono dubitativo o dificultad para contener la molestia del cliente chileno.'
        };
      case 'NINGUNA_DOMINIO':
      default:
        return {
          title: 'Sin Brecha Significativa (Dominio)',
          desc: 'El asesor se desenvolvió con soltura, empatía y precisión procedimental en vivo.'
        };
    }
  };

  const badge = getMadurezBadge(ojt.nivel_madurez);
  const BadgeIcon = badge.icon;
  const brecha = getBrechaInfo(ojt.brecha_principal);

  return (
    <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DADCE0] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#E8F0FE] text-[#1A73E8]">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Diagnóstico de OJT (Formación en Puesto Real)
              </h3>
              <span className="rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-[10px] font-bold text-[#1A73E8]">
                NIDO EN VIVO
              </span>
            </div>
            <p className="text-xs text-[#5F6368]">
              Evaluación formativa para acelerar la curva de aprendizaje con clientes reales en producción
            </p>
          </div>
        </div>

        {/* Readiness Badge */}
        <div className={`flex items-center gap-2 rounded-2xl border px-3.5 py-1.5 ${badge.bg} ${badge.border} ${badge.text}`}>
          <BadgeIcon className="h-4 w-4" />
          <div className="text-left">
            <span className="block text-xs font-bold leading-tight">{badge.label}</span>
            <span className="block text-[10px] opacity-80">{badge.sub}</span>
          </div>
        </div>
      </div>

      {/* Metrics Row: Autonomy Gauge, Brecha, and Tutor Intervention */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Autonomy Index */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
              Índice de Autonomía en Piso
            </span>
            <Target className="h-4 w-4 text-[#1A73E8]" />
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="font-['Google_Sans',sans-serif] text-3xl font-extrabold text-[#202124]">
              {ojt.indice_autonomia}%
            </span>
            <span className="text-xs font-medium text-[#5F6368]">
              {ojt.indice_autonomia >= 85 ? 'Alta independencia' : ojt.indice_autonomia >= 65 ? 'Autonomía guiada' : 'Dependiente de tutor'}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#DADCE0]">
            <div 
              className={`h-full transition-all duration-500 ${
                ojt.indice_autonomia >= 85 
                  ? 'bg-[#34A853]' 
                  : ojt.indice_autonomia >= 65 
                    ? 'bg-[#FBBC05]' 
                    : 'bg-[#EA4335]'
              }`}
              style={{ width: `${ojt.indice_autonomia}%` }}
            />
          </div>
        </div>

        {/* Brecha Principal */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
              Brecha Clave de Formación
            </span>
            <AlertCircle className="h-4 w-4 text-[#B06000]" />
          </div>
          <div className="mt-1">
            <span className="text-sm font-bold text-[#202124]">{brecha.title}</span>
            <p className="mt-1 text-xs text-[#5F6368] line-clamp-2">{brecha.desc}</p>
          </div>
          <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#1A73E8]">
            Área prioritaria de refuerzo
          </span>
        </div>

        {/* Tutor Intervention Status */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
              Acción del Tutor en Piso
            </span>
            <Users className="h-4 w-4 text-[#5F6368]" />
          </div>
          <div className="mt-1">
            {ojt.requiere_intervencion_tutor ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#EA4335]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Intervención / Feedback inmediato sugerido</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#137333]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Monitoreo estándar sin interrupción</span>
              </div>
            )}
            <p className="mt-1 text-xs text-[#5F6368] line-clamp-2">
              {ojt.observacion_piso_real}
            </p>
          </div>
          <span className="mt-2 text-[10px] text-[#5F6368]">
            Feedback al término del turno
          </span>
        </div>
      </div>

      {/* Roleplay Sugerido & Feedback Pedagógico (2 cols) */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Roleplay de 5 minutos */}
        <div className="rounded-2xl border border-[#1A73E8]/30 bg-[#E8F0FE]/40 p-4">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 fill-current text-[#1A73E8]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#1A73E8]">
              Roleplay / Ejercicio Práctico Sugerido (5 Minutos)
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#202124]">
            {ojt.roleplay_sugerido}
          </p>
          <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-[#1A73E8]">
            <span>Dinámica recomendada antes de tomar la siguiente llamada en vivo</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>

        {/* Feedback Pedagógico Motivacional */}
        <div className="rounded-2xl border border-[#34A853]/30 bg-[#E6F4EA]/40 p-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-[#137333]" strokeWidth={2} />
            <span className="text-xs font-bold uppercase tracking-wider text-[#137333]">
              Feedback Formativo para el Asesor Novel
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#202124]">
            "{ojt.feedback_pedagogico}"
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#137333]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Enfoque formativo: celebrar lo que hizo bien y modelar la corrección</span>
          </div>
        </div>
      </div>
    </div>
  );
};
