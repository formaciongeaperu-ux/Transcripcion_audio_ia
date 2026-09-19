import React, { useState } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  PhoneCall,
  Info,
  Clock,
  ThumbsUp
} from 'lucide-react';
import { CallRecord } from '../types';

interface ComplianceAuditCardProps {
  call: CallRecord;
}

type PhaseKey = 'todas' | 'bienvenida' | 'entender_resolver' | 'informar_accion' | 'cierre';

export const ComplianceAuditCard: React.FC<ComplianceAuditCardProps> = ({ call }) => {
  const [activeTab, setActiveTab] = useState<PhaseKey>('todas');
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  const cg = call.cumplimiento_guion;
  const fases = cg?.fases;

  // Compute or extract phase scores
  const b = fases?.bienvenida;
  const er = fases?.entender_resolver;
  const ia = fases?.informar_accion;
  const c = fases?.cierre;

  // Fallback calculations if not directly in `fases`
  const bPassed = b ? [
    b.generar_experiencia_positiva,
    b.mencionar_empresa_claro,
    b.mencionar_nombre_apellido,
    b.confirmar_nombre_cliente_rut_celular
  ].filter(Boolean).length : (cg?.saludo_institucional ? 3 : 1);
  const bScore = b?.porcentaje ?? Math.round((bPassed / 4) * 100);

  const erPassed = er ? [
    er.parafrasear_problema,
    er.ordenar_multiples_requerimientos,
    er.utilizar_sistemas_oficiales_somos_clave,
    er.cortesia_por_favor_gracias,
    er.validacion_identidad
  ].filter(Boolean).length : (cg?.verificacion_identidad ? 4 : 2);
  const erScore = er?.porcentaje ?? Math.round((erPassed / 5) * 100);

  const iaPassed = ia ? [
    ia.indicar_gestion_espera,
    ia.retomar_en_menos_de_un_minuto,
    ia.claridad_condiciones_comerciales,
    ia.resumen_atencion_gestion
  ].filter(Boolean).length : 3;
  const iaScore = ia?.porcentaje ?? Math.round((iaPassed / 4) * 100);

  const cPassed = c ? [
    c.preguntas_aseguramiento,
    c.esperar_confirmacion_cliente,
    c.guion_encuesta_escala_0_a_10
  ].filter(Boolean).length : (cg?.despedida_cordial ? 2 : 1);
  const cScore = c?.porcentaje ?? Math.round((cPassed / 3) * 100);

  const totalScore = typeof cg?.porcentaje_total === 'number' 
    ? cg.porcentaje_total 
    : Math.round((bScore + erScore + iaScore + cScore) / 4);

  const phasesData = [
    {
      id: 'bienvenida',
      title: 'Fase 1: Bienvenida Cordial',
      description: 'Acogida, identificación institucional y validación inicial',
      score: bScore,
      items: [
        {
          label: 'Generar experiencia positiva desde el primer contacto',
          detail: 'Tono cordial, empático y predispuesto al servicio',
          passed: b?.generar_experiencia_positiva ?? !!cg?.saludo_institucional
        },
        {
          label: 'Mencionar el nombre de la empresa (Bienvenida a Claro)',
          detail: 'Identificación obligatoria de la marca Claro',
          passed: b?.mencionar_empresa_claro ?? !!cg?.saludo_institucional
        },
        {
          label: 'Mencionar primer nombre y primer apellido del asesor',
          detail: 'No solo el nombre de pila (ej: "Soy Carlos Muñoz")',
          passed: b?.mencionar_nombre_apellido ?? (call.agente_nombre?.split(' ').length > 1)
        },
        {
          label: 'Confirmar nombre del cliente (validando celular o RUT)',
          detail: 'Identificación de la persona con quien se interactúa',
          passed: b?.confirmar_nombre_cliente_rut_celular ?? !!cg?.verificacion_identidad
        }
      ]
    },
    {
      id: 'entender_resolver',
      title: 'Fase 2: Entender y Resolver',
      description: 'Comprensión activa, cortesía y herramientas oficiales',
      score: erScore,
      items: [
        {
          label: 'Asegurarse de entender parafraseando lo que el cliente comenta',
          detail: 'Reformular con palabras propias el motivo del contacto',
          passed: er?.parafrasear_problema ?? !!cg?.escucha_activa
        },
        {
          label: 'Ordenar requerimientos múltiples del cliente',
          detail: 'Hacerse cargo de cada consulta de manera secuencial',
          passed: er?.ordenar_multiples_requerimientos ?? true
        },
        {
          label: 'Utilizar sistemas oficiales y procedimientos (Somos Clave)',
          detail: 'Alineamiento estricto a procesos corporativos vigentes',
          passed: er?.utilizar_sistemas_oficiales_somos_clave ?? true
        },
        {
          label: 'Cortesía obligatoria: Pedir "por favor" y "agradecer"',
          detail: 'Uso de cortesía al solicitar datos o dar instrucciones',
          passed: er?.cortesia_por_favor_gracias ?? (call.evaluacion_criterios?.amabilidad_empatia?.nota >= 70)
        },
        {
          label: 'Realizar validación de identidad si el procedimiento lo indica',
          detail: 'Preguntas de seguridad y verificación de titularidad por RUT',
          passed: er?.validacion_identidad ?? !!cg?.verificacion_identidad
        }
      ]
    },
    {
      id: 'informar_accion',
      title: 'Fase 3: Informar Acción al Cliente',
      description: 'Gestión de pausas, condiciones comerciales y síntesis',
      score: iaScore,
      items: [
        {
          label: 'Indicar qué gestión específica se realiza al pedir espera (Hold)',
          detail: 'Explicar la razón técnica o comercial antes de silenciar',
          passed: ia?.indicar_gestion_espera ?? (call.evaluacion_criterios?.tiempos_espera_hold?.nota >= 70)
        },
        {
          label: 'Retomar la llamada en MENOS DE UN MINUTO (<60s)',
          detail: 'No dejar silencios prolongados o dead air sin interacción',
          passed: ia?.retomar_en_menos_de_un_minuto ?? (call.silencio_analisis?.nivel_silencio !== 'CRÍTICO')
        },
        {
          label: 'Claridad en condiciones comerciales (costos, vigencias, promos)',
          detail: 'Explicar costos proporcionales, rebajas y vigencia contractual',
          passed: ia?.claridad_condiciones_comerciales ?? (call.evaluacion_criterios?.claridad_informacion?.nota >= 70)
        },
        {
          label: 'Breve resumen de toda la atención y gestión realizada',
          detail: 'Recapitular soluciones y acuerdos al finalizar la consulta',
          passed: ia?.resumen_atencion_gestion ?? !call.quiebres_atencion?.some(q => q.tipo.toLowerCase().includes('resumen'))
        }
      ]
    },
    {
      id: 'cierre',
      title: 'Fase 4: Cierre y Encuesta',
      description: 'Aseguramiento, confirmación y protocolo de encuesta 0 a 10',
      score: cScore,
      items: [
        {
          label: 'Preguntas de aseguramiento (¿otra consulta? ¿quedó claro?)',
          detail: '"¿Tiene alguna otra consulta? ¿Quedó clara la información?"',
          passed: c?.preguntas_aseguramiento ?? !!cg?.ofrecimiento_ayuda
        },
        {
          label: 'Esperar la confirmación activa por parte del cliente',
          detail: 'No cortar ni despedir sin escuchar la respuesta del cliente',
          passed: c?.esperar_confirmacion_cliente ?? !!cg?.despedida_cordial
        },
        {
          label: 'Guion oficial de Encuesta SMS/Mail en escala de 0 a 10',
          detail: '"Eventual encuesta por mail/SMS en escala 0 más baja a 10 más alta"',
          passed: c?.guion_encuesta_escala_0_a_10 ?? (call.nps_pronostico?.score ? totalScore >= 70 : false)
        }
      ]
    }
  ];

  const filteredPhases = activeTab === 'todas' 
    ? phasesData 
    : phasesData.filter(p => p.id === activeTab);

  return (
    <div className="flex flex-col rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
      {/* Header with Title and Global Score */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DADCE0] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8F0FE] text-[#1A73E8]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Pauta de Atención Claro Chile (4 Fases)
              </h3>
              <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold text-[#1A73E8]">
                OFICIAL
              </span>
            </div>
            <p className="text-xs text-[#5F6368]">
              Matriz de calidad y adherencia al guion de contacto institucional
            </p>
          </div>
        </div>

        {/* Global Compliance Badge */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#5F6368]">
              Adherencia Total
            </span>
            <span className="font-['Google_Sans',sans-serif] text-xl font-extrabold text-[#202124]">
              {totalScore}%
            </span>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
            totalScore >= 85 
              ? 'bg-[#E6F4EA] text-[#137333]' 
              : totalScore >= 70 
                ? 'bg-[#FEF7E0] text-[#B06000]' 
                : 'bg-[#FCE8E6] text-[#EA4335]'
          }`}>
            {totalScore >= 70 ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : (
              <XCircle className="h-6 w-6" />
            )}
          </div>
        </div>
      </div>

      {/* 4 Phases Progress Ribbon */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {phasesData.map(phase => (
          <button
            key={phase.id}
            onClick={() => setActiveTab(activeTab === phase.id ? 'todas' : phase.id as PhaseKey)}
            className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition-all ${
              activeTab === phase.id
                ? 'border-[#1A73E8] bg-[#E8F0FE]/40 shadow-xs'
                : 'border-[#DADCE0] bg-[#F8F9FA] hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#202124] line-clamp-1">
                {phase.title.split(':')[1] || phase.title}
              </span>
              <span className={`text-xs font-extrabold ${
                phase.score >= 80 ? 'text-[#137333]' : phase.score >= 60 ? 'text-[#B06000]' : 'text-[#EA4335]'
              }`}>
                {phase.score}%
              </span>
            </div>
            {/* Mini Progress Bar */}
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#DADCE0]">
              <div
                className={`h-full transition-all duration-300 ${
                  phase.score >= 80 ? 'bg-[#34A853]' : phase.score >= 60 ? 'bg-[#FBBC05]' : 'bg-[#EA4335]'
                }`}
                style={{ width: `${phase.score}%` }}
              />
            </div>
          </button>
        ))}
      </div>

      {/* Phase Filter Tabs */}
      <div className="mt-4 flex items-center gap-1.5 border-b border-[#DADCE0] pb-2 text-xs">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
          Vista:
        </span>
        <button
          onClick={() => setActiveTab('todas')}
          className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
            activeTab === 'todas'
              ? 'bg-[#202124] text-white'
              : 'text-[#5F6368] hover:bg-[#F1F3F4]'
          }`}
        >
          Todas las Fases (16 ítems)
        </button>
        {phasesData.map(phase => (
          <button
            key={phase.id}
            onClick={() => setActiveTab(phase.id as PhaseKey)}
            className={`rounded-lg px-2.5 py-1 font-medium transition-colors ${
              activeTab === phase.id
                ? 'bg-[#1A73E8] text-white'
                : 'text-[#5F6368] hover:bg-[#F1F3F4]'
            }`}
          >
            {phase.title.split(':')[0]} ({phase.score}%)
          </button>
        ))}
      </div>

      {/* Phase Details Cards */}
      <div className={`mt-4 grid gap-4 ${activeTab === 'todas' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'}`}>
        {filteredPhases.map(phase => (
          <div 
            key={phase.id}
            className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-[#FFFFFF] p-4 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F3F4] pb-2.5">
              <div>
                <h4 className="font-['Google_Sans',sans-serif] text-sm font-bold text-[#202124]">
                  {phase.title}
                </h4>
                <p className="text-[11px] text-[#5F6368]">{phase.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#3C4043]">
                  {phase.items.filter(i => i.passed).length} de {phase.items.length} cumplidos
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                  phase.score >= 80 
                    ? 'bg-[#E6F4EA] text-[#137333]' 
                    : phase.score >= 60 
                      ? 'bg-[#FEF7E0] text-[#B06000]' 
                      : 'bg-[#FCE8E6] text-[#EA4335]'
                }`}>
                  {phase.score}%
                </span>
              </div>
            </div>

            {/* Sub-items List */}
            <div className="mt-3 flex flex-col gap-2">
              {phase.items.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-start justify-between gap-3 rounded-xl border p-2.5 transition-colors ${
                    item.passed 
                      ? 'border-[#E6F4EA] bg-[#F8FDF9]' 
                      : 'border-[#FCE8E6] bg-[#FFFBFB]'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {item.passed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#137333]" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#EA4335]" />
                    )}
                    <div>
                      <span className={`text-xs font-semibold ${item.passed ? 'text-[#202124]' : 'text-[#EA4335]'}`}>
                        {item.label}
                      </span>
                      <p className="text-[11px] text-[#5F6368]">{item.detail}</p>
                    </div>
                  </div>

                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    item.passed
                      ? 'bg-[#E6F4EA] text-[#137333]'
                      : 'bg-[#FCE8E6] text-[#EA4335]'
                  }`}>
                    {item.passed ? 'CUMPLE' : 'NO CUMPLE'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Auditoría Observaciones (if present) */}
      {cg?.observaciones_auditoria && (
        <div className="mt-4 rounded-2xl border border-[#DADCE0] bg-[#FEF7E0]/30 p-3.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#B06000]">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
            <span>Diagnóstico de Auditoría Claro Chile:</span>
          </div>
          <p className="mt-1 text-xs italic text-[#3C4043]">
            {cg.observaciones_auditoria}
          </p>
        </div>
      )}
    </div>
  );
};
