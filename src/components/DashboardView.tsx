import React from 'react';
import { 
  Users, 
  TrendingUp, 
  Clock, 
  Smile, 
  AlertTriangle, 
  CheckCircle2, 
  PhoneCall, 
  BarChart2, 
  Sparkles, 
  ArrowUpRight,
  ShieldCheck,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  VolumeX,
  Play
} from 'lucide-react';
import { CallRecord } from '../types';

interface DashboardViewProps {
  calls: CallRecord[];
  onSelectCall: (call: CallRecord) => void;
  onOpenUpload: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  calls,
  onSelectCall,
  onOpenUpload,
}) => {
  // Aggregate Metrics
  const totalCalls = calls.length;

  // Average QA Score
  const avgQA = totalCalls > 0
    ? Math.round(calls.reduce((sum, c) => sum + c.qa_score_global, 0) / totalCalls)
    : 0;

  // NPS Calculation: % Promotores - % Detractores
  const promotoresCount = calls.filter((c) => c.nps_pronostico?.clasificacion === 'PROMOTOR').length;
  const neutrosCount = calls.filter((c) => c.nps_pronostico?.clasificacion === 'NEUTRO').length;
  const detractoresCount = calls.filter((c) => c.nps_pronostico?.clasificacion === 'DETRACTOR').length;

  const promotoresPct = totalCalls > 0 ? Math.round((promotoresCount / totalCalls) * 100) : 0;
  const neutrosPct = totalCalls > 0 ? Math.round((neutrosCount / totalCalls) * 100) : 0;
  const detractoresPct = totalCalls > 0 ? Math.round((detractoresCount / totalCalls) * 100) : 0;
  const netNPS = promotoresPct - detractoresPct;

  // CSAT Average
  const avgCSAT = totalCalls > 0
    ? (calls.reduce((sum, c) => sum + (c.csat_estimado || 3), 0) / totalCalls).toFixed(1)
    : '0.0';

  // Average TMO (Duration in seconds)
  const avgDurationSec = totalCalls > 0
    ? Math.round(calls.reduce((sum, c) => sum + c.duracion_segundos, 0) / totalCalls)
    : 0;
  const avgTMOMin = Math.floor(avgDurationSec / 60);
  const avgTMOSec = avgDurationSec % 60;
  const avgTMOStr = `${avgTMOMin.toString().padStart(2, '0')}:${avgTMOSec.toString().padStart(2, '0')}`;

  // Average Conversational Silence
  const avgSilencePct = totalCalls > 0
    ? Math.round(
        calls.reduce((sum, c) => sum + (c.silencio_analisis?.porcentaje_silencio ?? 0), 0) / totalCalls
      )
    : 0;

  // FCR Rate
  const fcrCount = calls.filter((c) => c.resolucion_primer_contacto).length;
  const fcrRate = totalCalls > 0 ? Math.round((fcrCount / totalCalls) * 100) : 0;

  // Total Quiebres
  const totalQuiebres = calls.reduce((sum, c) => sum + (c.quiebres_atencion?.length || 0), 0);

  // Script compliance average
  const totalScriptChecks = totalCalls * 5;
  const passedScriptChecks = calls.reduce((sum, c) => {
    let p = 0;
    if (c.cumplimiento_guion?.saludo_institucional) p++;
    if (c.cumplimiento_guion?.verificacion_identidad) p++;
    if (c.cumplimiento_guion?.ofrecimiento_ayuda) p++;
    if (c.cumplimiento_guion?.despedida_cordial) p++;
    if (c.cumplimiento_guion?.politica_privacidad) p++;
    return sum + p;
  }, 0);
  const scriptComplianceRate = totalScriptChecks > 0 ? Math.round((passedScriptChecks / totalScriptChecks) * 100) : 0;

  // Quiebres breakdown by type
  const quiebresByType: Record<string, number> = {};
  calls.forEach((c) => {
    (c.quiebres_atencion || []).forEach((q) => {
      quiebresByType[q.tipo] = (quiebresByType[q.tipo] || 0) + 1;
    });
  });
  const topQuiebres = Object.entries(quiebresByType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Top Banner with Real-Time Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#34A853] animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#137333]">
              Monitoreo en Tiempo Real
            </span>
          </div>
          <h1 className="mt-1 font-['Google_Sans',sans-serif] text-2xl font-bold tracking-tight text-[#202124]">
            Panel Ejecutivo de Speech Analytics & Calidad
          </h1>
          <p className="mt-0.5 text-xs text-[#5F6368]">
            Análisis consolidado de {totalCalls} llamadas auditadas con Gemini AI en Claro Chile.
          </p>
        </div>

        <button
          onClick={onOpenUpload}
          className="flex items-center gap-2 rounded-full bg-[#1A73E8] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1557B0]"
        >
          <Sparkles className="h-4 w-4" />
          <span>Analizar Nuevo Lote de Audios</span>
        </button>
      </div>

      {/* 7 KPI Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
        {/* 1. QA Score Promedio */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">QA GLOBAL</span>
          <div className="mt-2 text-3xl font-extrabold text-[#1A73E8]">{avgQA}%</div>
          <div className="mt-1 text-[11px] text-[#5F6368]">Meta: ≥ 85%</div>
        </div>

        {/* 2. NPS Predictivo */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">NET NPS</span>
          <div
            className={`mt-2 text-3xl font-extrabold ${
              netNPS >= 30 ? 'text-[#34A853]' : netNPS >= 0 ? 'text-[#FBBC05]' : 'text-[#EA4335]'
            }`}
          >
            {netNPS > 0 ? `+${netNPS}` : netNPS}
          </div>
          <div className="mt-1 text-[11px] text-[#5F6368]">
            {promotoresPct}% Prom. / {detractoresPct}% Detr.
          </div>
        </div>

        {/* 3. CSAT */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">CSAT</span>
          <div className="mt-2 text-3xl font-extrabold text-[#202124]">{avgCSAT} <span className="text-sm font-normal text-[#5F6368]">/ 5.0</span></div>
          <div className="mt-1 text-[11px] text-[#5F6368]">Satisfacción</div>
        </div>

        {/* 4. TMO Promedio */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">TMO MEDIO</span>
          <div className="mt-2 text-3xl font-extrabold text-[#202124]">{avgTMOStr}</div>
          <div className="mt-1 text-[11px] text-[#5F6368]">Tiempo Operación</div>
        </div>

        {/* 5. Silencio Conversacional */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">SILENCIO</span>
          <div
            className={`mt-2 text-3xl font-extrabold ${
              avgSilencePct > 18 ? 'text-[#EA4335]' : avgSilencePct > 10 ? 'text-[#FBBC05]' : 'text-[#34A853]'
            }`}
          >
            {avgSilencePct}%
          </div>
          <div className="mt-1 text-[11px] text-[#5F6368]">Dead Air Asesor</div>
        </div>

        {/* 6. Cumplimiento Guion */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">GUION</span>
          <div className="mt-2 text-3xl font-extrabold text-[#34A853]">{scriptComplianceRate}%</div>
          <div className="mt-1 text-[11px] text-[#5F6368]">5 Pasos Clave</div>
        </div>

        {/* 7. FCR */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-sm col-span-2 sm:col-span-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">FCR</span>
          <div className="mt-2 text-3xl font-extrabold text-[#1A73E8]">{fcrRate}%</div>
          <div className="mt-1 text-[11px] text-[#5F6368]">1er Contacto</div>
        </div>
      </div>

      {/* Row 2: NPS Visualizer + Quiebres Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: NPS Breakdown (7 cols) */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm lg:col-span-7">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                  Distribución de Lealtad (NPS Predictivo Claro)
                </h3>
                <p className="text-xs text-[#5F6368]">
                  "¿Qué tan probable es que recomiendes Claro a un amigo o familiar?"
                </p>
              </div>
              <span className="rounded-full bg-[#E8F0FE] px-2.5 py-1 text-xs font-bold text-[#1A73E8]">
                {totalCalls} Evaluaciones
              </span>
            </div>

            {/* Stacked Percentage Bar */}
            <div className="mt-6 flex h-6 w-full overflow-hidden rounded-full bg-[#F1F3F4]">
              <div
                className="bg-[#34A853] transition-all"
                style={{ width: `${promotoresPct}%` }}
                title={`Promotores: ${promotoresPct}%`}
              />
              <div
                className="bg-[#FBBC05] transition-all"
                style={{ width: `${neutrosPct}%` }}
                title={`Neutros: ${neutrosPct}%`}
              />
              <div
                className="bg-[#EA4335] transition-all"
                style={{ width: `${detractoresPct}%` }}
                title={`Detractores: ${detractoresPct}%`}
              />
            </div>

            {/* Category Cards */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-[#DADCE0] bg-[#E6F4EA]/40 p-3 text-center">
                <span className="text-[11px] font-bold text-[#137333]">PROMOTORES (9-10)</span>
                <div className="mt-1 text-2xl font-extrabold text-[#137333]">{promotoresCount}</div>
                <div className="text-[11px] font-medium text-[#5F6368]">{promotoresPct}% de la base</div>
              </div>

              <div className="rounded-2xl border border-[#DADCE0] bg-[#FEF7E0]/40 p-3 text-center">
                <span className="text-[11px] font-bold text-[#B06000]">NEUTROS (7-8)</span>
                <div className="mt-1 text-2xl font-extrabold text-[#B06000]">{neutrosCount}</div>
                <div className="text-[11px] font-medium text-[#5F6368]">{neutrosPct}% de la base</div>
              </div>

              <div className="rounded-2xl border border-[#DADCE0] bg-[#FCE8E6]/40 p-3 text-center">
                <span className="text-[11px] font-bold text-[#EA4335]">DETRACTORES (0-6)</span>
                <div className="mt-1 text-2xl font-extrabold text-[#EA4335]">{detractoresCount}</div>
                <div className="text-[11px] font-medium text-[#5F6368]">{detractoresPct}% de la base</div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-[#F8F9FA] p-3 text-xs text-[#5F6368]">
            💡 <strong>Insight Estratégico Claro:</strong> El {detractoresPct}% de detractores se concentra en falta de claridad sobre vencimiento de descuentos en boleta y tiempos muertos sin música de espera.
          </div>
        </div>

        {/* Right: Quiebres de Asesores (5 cols) */}
        <div className="flex flex-col justify-between rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[#EA4335]" />
                <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                  Top Quiebres de Atención
                </h3>
              </div>
              <span className="rounded-full bg-[#FCE8E6] px-2 py-0.5 text-xs font-bold text-[#EA4335]">
                {totalQuiebres} detectados
              </span>
            </div>
            <p className="mt-1 text-xs text-[#5F6368]">
              Infracciones conductuales o de protocolo identificadas automáticamente
            </p>

            <div className="mt-4 flex flex-col gap-3">
              {topQuiebres.length > 0 ? (
                topQuiebres.map(([tipo, count], idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-[#DADCE0] bg-[#F8F9FA] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-[#EA4335] shadow-xs">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-[#202124]">{tipo}</span>
                    </div>
                    <span className="rounded-full bg-[#EA4335] px-2.5 py-0.5 text-xs font-bold text-white">
                      {count} veces
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-[#5F6368]">
                  No se registraron quiebres de atención.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-[#DADCE0] pt-3 text-[11px] text-[#5F6368]">
            Prioridad de intervención: Reforzar talleres de empatía y manejo de pausas técnicas en CRM.
          </div>
        </div>
      </div>

      {/* Row 3: Recent Audited Calls Table */}
      <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#DADCE0] pb-4">
          <div>
            <h3 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
              Llamadas Auditadas Recientemente
            </h3>
            <p className="text-xs text-[#5F6368]">
              Selecciona cualquier grabación para ingresar al Visor Sincronizado y ver el pronóstico NPS
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#DADCE0] text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
                <th className="py-3 pr-3">Código</th>
                <th className="py-3 px-3">Asesor</th>
                <th className="py-3 px-3">Cola / Driver</th>
                <th className="py-3 px-3">TMO</th>
                <th className="py-3 px-3">Silencio</th>
                <th className="py-3 px-3">QA Score</th>
                <th className="py-3 px-3">NPS Pronóstico</th>
                <th className="py-3 px-3">Quiebres</th>
                <th className="py-3 pl-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F3F4]">
              {calls.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F0FE] text-[#1A73E8]">
                        <PhoneCall className="h-6 w-6" />
                      </div>
                      <p className="text-xs font-bold text-[#202124]">Aún no hay llamadas registradas</p>
                      <p className="max-w-md text-[11px] text-[#5F6368]">
                        Los indicadores, gráficas y métricas se construirán dinámicamente a medida que cargues grabaciones de audio de tus clientes y asesores.
                      </p>
                      <button
                        onClick={onOpenUpload}
                        className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#1557B0]"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Cargar Primer Audio</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                calls.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => onSelectCall(c)}
                    className="group cursor-pointer transition hover:bg-[#F8F9FA]"
                  >
                    <td className="py-3 pr-3 font-mono font-bold text-[#1A73E8]">
                      {c.codigo_llamada}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#202124]">{c.agente_nombre}</div>
                      <div className="text-[11px] text-[#5F6368]">{c.agente_id}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-[#202124] line-clamp-1">{c.motivo_nombre}</div>
                      <div className="text-[11px] text-[#5F6368]">{c.cola_atencion}</div>
                    </td>
                    <td className="py-3 px-3 font-mono font-medium text-[#202124]">
                      {c.duracion_total}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          c.silencio_analisis?.nivel_silencio === 'CRÍTICO'
                            ? 'bg-[#FCE8E6] text-[#EA4335]'
                            : c.silencio_analisis?.nivel_silencio === 'MODERADO'
                            ? 'bg-[#FEF7E0] text-[#B06000]'
                            : 'bg-[#E6F4EA] text-[#137333]'
                        }`}
                      >
                        {c.silencio_analisis?.porcentaje_silencio ?? 0}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-sm font-extrabold ${
                          c.qa_score_global >= 85
                            ? 'text-[#34A853]'
                            : c.qa_score_global >= 65
                            ? 'text-[#FBBC05]'
                            : 'text-[#EA4335]'
                        }`}
                      >
                        {c.qa_score_global}%
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          c.nps_pronostico?.clasificacion === 'DETRACTOR'
                            ? 'bg-[#FCE8E6] text-[#EA4335]'
                            : c.nps_pronostico?.clasificacion === 'PROMOTOR'
                            ? 'bg-[#E6F4EA] text-[#137333]'
                            : 'bg-[#FEF7E0] text-[#B06000]'
                        }`}
                      >
                        {c.nps_pronostico?.score}/10 ({c.nps_pronostico?.clasificacion})
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {c.quiebres_atencion && c.quiebres_atencion.length > 0 ? (
                        <span className="flex items-center gap-1 font-bold text-[#EA4335]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {c.quiebres_atencion.length}
                        </span>
                      ) : (
                        <span className="text-[#34A853] font-medium">0</span>
                      )}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCall(c);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-[#1A73E8] px-3 py-1 text-[11px] font-bold text-white shadow-xs transition hover:bg-[#1557B0]"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Auditar</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
