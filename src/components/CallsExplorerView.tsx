import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  FileText, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  X,
  ArrowUpDown,
  Plus,
  GraduationCap,
  Columns,
  Eye,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { CallRecord, getNormalizedNPS } from '../types';
import { OjtDiagnosisCard } from './OjtDiagnosisCard';

interface CallsExplorerViewProps {
  calls: CallRecord[];
  onSelectCall: (call: CallRecord) => void;
  onOpenUpload: () => void;
  onExportFiltered: (filtered: CallRecord[]) => void;
}

export const CallsExplorerView: React.FC<CallsExplorerViewProps> = ({
  calls,
  onSelectCall,
  onOpenUpload,
  onExportFiltered,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQueue, setSelectedQueue] = useState('all');
  const [selectedSentiment, setSelectedSentiment] = useState('all');
  const [selectedNPS, setSelectedNPS] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [minQA, setMinQA] = useState<number>(0);
  const [sortField, setSortField] = useState<'fecha' | 'qa' | 'nps' | 'silencio'>('fecha');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Quick status filter chips
  const [quickFilter, setQuickFilter] = useState<'all' | 'tutor' | 'quiebres' | 'detractor' | 'promotor' | 'listo'>('all');

  // Slide-over preview drawer state
  const [previewCall, setPreviewCall] = useState<CallRecord | null>(null);

  const queues = useMemo(() => {
    const set = new Set(calls.map((c) => c.cola_atencion));
    return Array.from(set);
  }, [calls]);

  const categories = useMemo(() => {
    const set = new Set(calls.map((c) => c.motivo_categoria));
    return Array.from(set);
  }, [calls]);

  // Counts for quick chips
  const tutorCount = useMemo(() => calls.filter((c) => c.diagnostico_ojt?.requiere_intervencion_tutor).length, [calls]);
  const quiebresCount = useMemo(() => calls.filter((c) => c.quiebres_atencion && c.quiebres_atencion.length > 0).length, [calls]);
  const detractorCount = useMemo(() => calls.filter((c) => getNormalizedNPS(c.nps_pronostico, c.qa_score_global) === 'DETRACTOR').length, [calls]);
  const promotorCount = useMemo(() => calls.filter((c) => getNormalizedNPS(c.nps_pronostico, c.qa_score_global) === 'PROMOTOR').length, [calls]);
  const listoCount = useMemo(() => calls.filter((c) => c.diagnostico_ojt?.nivel_madurez === 'LISTO_PRODUCCION').length, [calls]);

  const filteredCalls = useMemo(() => {
    return calls
      .filter((c) => {
        const normalizedNPS = getNormalizedNPS(c.nps_pronostico, c.qa_score_global);

        // Quick filter pill
        if (quickFilter === 'tutor' && !c.diagnostico_ojt?.requiere_intervencion_tutor) return false;
        if (quickFilter === 'quiebres' && (!c.quiebres_atencion || c.quiebres_atencion.length === 0)) return false;
        if (quickFilter === 'detractor' && normalizedNPS !== 'DETRACTOR') return false;
        if (quickFilter === 'promotor' && normalizedNPS !== 'PROMOTOR') return false;
        if (quickFilter === 'listo' && c.diagnostico_ojt?.nivel_madurez !== 'LISTO_PRODUCCION') return false;

        const matchesSearch =
          searchTerm === '' ||
          c.codigo_llamada.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (c.file_name && c.file_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
          c.agente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.agente_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.cliente_telefono.includes(searchTerm) ||
          c.motivo_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.resumen.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.keywords.some((k) => k.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesQueue = selectedQueue === 'all' || c.cola_atencion === selectedQueue;
        const matchesSentiment = selectedSentiment === 'all' || c.sentimiento_label === selectedSentiment;
        const matchesNPS = selectedNPS === 'all' || normalizedNPS === selectedNPS;
        const matchesCategory = selectedCategory === 'all' || c.motivo_categoria === selectedCategory;
        const matchesQA = c.qa_score_global >= minQA;

        return matchesSearch && matchesQueue && matchesSentiment && matchesNPS && matchesCategory && matchesQA;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'fecha') {
          diff = new Date(b.fecha_hora).getTime() - new Date(a.fecha_hora).getTime();
        } else if (sortField === 'qa') {
          diff = b.qa_score_global - a.qa_score_global;
        } else if (sortField === 'nps') {
          diff = (b.nps_pronostico?.score ?? 0) - (a.nps_pronostico?.score ?? 0);
        } else if (sortField === 'silencio') {
          diff = (b.silencio_analisis?.porcentaje_silencio ?? 0) - (a.silencio_analisis?.porcentaje_silencio ?? 0);
        }
        return sortOrder === 'asc' ? -diff : diff;
      });
  }, [calls, searchTerm, selectedQueue, selectedSentiment, selectedNPS, selectedCategory, minQA, sortField, sortOrder, quickFilter]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedQueue('all');
    setSelectedSentiment('all');
    setSelectedNPS('all');
    setSelectedCategory('all');
    setMinQA(0);
    setQuickFilter('all');
  };

  const hasActiveFilters =
    searchTerm !== '' ||
    selectedQueue !== 'all' ||
    selectedSentiment !== 'all' ||
    selectedNPS !== 'all' ||
    selectedCategory !== 'all' ||
    minQA > 0 ||
    quickFilter !== 'all';

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Title & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-['Google_Sans',sans-serif] text-2xl font-bold tracking-tight text-[#202124]">
              Explorador de Grabaciones & Auditorías
            </h1>
            <span className="rounded-full bg-[#E8F0FE] px-2.5 py-0.5 text-xs font-bold text-[#1A73E8]">
              {filteredCalls.length} registros
            </span>
          </div>
          <p className="mt-1 text-xs text-[#5F6368]">
            Panel de supervisión y monitoreo continuo de calidad acústica y desempeño formativo OJT.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-export-filtered"
            onClick={() => onExportFiltered(filteredCalls)}
            className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-white px-4 py-2 text-xs font-semibold text-[#3C4043] transition hover:bg-[#F8F9FA]"
          >
            <Download className="h-4 w-4 text-[#1A73E8]" />
            <span>Exportar Vista ({filteredCalls.length})</span>
          </button>

          <button
            id="btn-explorer-upload"
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 rounded-full bg-[#DA291C] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#C5221F]"
          >
            <Plus className="h-4 w-4" />
            <span>Cargar Audios</span>
          </button>
        </div>
      </div>

      {/* Quick Filter Chips for Supervisors & OJT Tutors */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setQuickFilter('all')}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            quickFilter === 'all'
              ? 'bg-[#202124] text-white shadow-xs'
              : 'border border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA]'
          }`}
        >
          Todas ({calls.length})
        </button>

        <button
          onClick={() => setQuickFilter('tutor')}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            quickFilter === 'tutor'
              ? 'bg-[#EA4335] text-white shadow-xs'
              : 'border border-[#FCE8E6] bg-[#FCE8E6]/60 text-[#C5221F] hover:bg-[#FCE8E6]'
          }`}
        >
          <GraduationCap className="h-3.5 w-3.5" />
          <span>Intervención Tutor OJT ({tutorCount})</span>
        </button>

        <button
          onClick={() => setQuickFilter('quiebres')}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            quickFilter === 'quiebres'
              ? 'bg-[#FBBC05] text-[#202124] shadow-xs'
              : 'border border-[#FEF7E0] bg-[#FEF7E0] text-[#B06000] hover:bg-[#FEEFC3]'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Con Quiebres ({quiebresCount})</span>
        </button>

        <button
          onClick={() => setQuickFilter('detractor')}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            quickFilter === 'detractor'
              ? 'bg-[#EA4335] text-white shadow-xs'
              : 'border border-[#DADCE0] bg-white text-[#EA4335] hover:bg-[#FCE8E6]'
          }`}
        >
          Detractores tNPS ({detractorCount})
        </button>

        <button
          onClick={() => setQuickFilter('promotor')}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            quickFilter === 'promotor'
              ? 'bg-[#137333] text-white shadow-xs'
              : 'border border-[#DADCE0] bg-white text-[#137333] hover:bg-[#E6F4EA]'
          }`}
        >
          Promotores ({promotorCount})
        </button>

        <button
          onClick={() => setQuickFilter('listo')}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            quickFilter === 'listo'
              ? 'bg-[#1A73E8] text-white shadow-xs'
              : 'border border-[#DADCE0] bg-white text-[#1A73E8] hover:bg-[#E8F0FE]'
          }`}
        >
          Listos Producción ({listoCount})
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        {/* Top Search bar */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6368]" />
          <input
            id="input-explorer-search"
            type="text"
            placeholder="Buscar por código de llamada, asesor, RUT/teléfono, motivo, alerta o palabra clave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-11 w-full rounded-full border border-[#DADCE0] bg-[#F8F9FA] pl-10 pr-10 text-xs text-[#202124] placeholder-[#5F6368] outline-none transition focus:border-[#1A73E8] focus:bg-white focus:shadow-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5F6368] hover:text-[#202124]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Queue Filter */}
          <div className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#3C4043]">
            <span className="font-semibold text-[#5F6368]">Cola:</span>
            <select
              value={selectedQueue}
              onChange={(e) => setSelectedQueue(e.target.value)}
              className="cursor-pointer bg-transparent font-medium text-[#202124] outline-none"
            >
              <option value="all">Todas las colas</option>
              {queues.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>

          {/* NPS Filter */}
          <div className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#3C4043]">
            <span className="font-semibold text-[#5F6368]">NPS:</span>
            <select
              value={selectedNPS}
              onChange={(e) => setSelectedNPS(e.target.value)}
              className="cursor-pointer bg-transparent font-medium text-[#202124] outline-none"
            >
              <option value="all">Todos los segmentos</option>
              <option value="DETRACTOR">Detractor (0-6)</option>
              <option value="NEUTRO">Neutro (7-8)</option>
              <option value="PROMOTOR">Promotor (9-10)</option>
            </select>
          </div>

          {/* Sentiment Filter */}
          <div className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#3C4043]">
            <span className="font-semibold text-[#5F6368]">Sentimiento:</span>
            <select
              value={selectedSentiment}
              onChange={(e) => setSelectedSentiment(e.target.value)}
              className="cursor-pointer bg-transparent font-medium text-[#202124] outline-none"
            >
              <option value="all">Todos</option>
              <option value="Positivo">Positivo</option>
              <option value="Neutro">Neutro</option>
              <option value="Negativo">Negativo</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#3C4043]">
            <span className="font-semibold text-[#5F6368]">Categoría:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="cursor-pointer bg-transparent font-medium text-[#202124] outline-none"
            >
              <option value="all">Todas</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Min QA */}
          <div className="flex items-center gap-2 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#3C4043]">
            <span className="font-semibold text-[#5F6368]">QA Min:</span>
            <input
              type="range"
              min="0"
              max="90"
              step="10"
              value={minQA}
              onChange={(e) => setMinQA(Number(e.target.value))}
              className="w-20 cursor-pointer accent-[#1A73E8]"
            />
            <span className="font-bold text-[#1A73E8]">{minQA}%</span>
          </div>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-[#EA4335] hover:bg-[#FCE8E6]"
            >
              <X className="h-3.5 w-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table + Optional Slide-Over Drawer */}
      <div className="flex items-start gap-6">
        {/* Calls Table Container */}
        <div className={`overflow-hidden rounded-3xl border border-[#DADCE0] bg-white shadow-sm transition-all ${
          previewCall ? 'flex-1 min-w-0' : 'w-full'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#DADCE0] bg-[#F8F9FA] text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
                  <th className="py-3.5 px-4">Código / Fecha</th>
                  <th className="py-3.5 px-4">Asesor</th>
                  <th className="py-3.5 px-4">Estado OJT</th>
                  <th className="py-3.5 px-4">Cliente / Teléfono</th>
                  <th className="py-3.5 px-4">Driver / Motivo</th>
                  <th className="py-3.5 px-4">TMO / Silencio</th>
                  <th
                    onClick={() => {
                      if (sortField === 'qa') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortField('qa'); setSortOrder('desc'); }
                    }}
                    className="cursor-pointer py-3.5 px-4 hover:text-[#1A73E8]"
                  >
                    <div className="flex items-center gap-1">
                      <span>Calidad QA (0-100%)</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortField === 'nps') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortField('nps'); setSortOrder('desc'); }
                    }}
                    className="cursor-pointer py-3.5 px-4 hover:text-[#1A73E8]"
                  >
                    <div className="flex items-center gap-1">
                      <span>tNPS Predicho (0-10)</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                  <th className="py-3.5 px-4">Quiebres</th>
                  <th className="py-3.5 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F4]">
                {filteredCalls.length > 0 ? (
                  filteredCalls.map((call) => {
                    const isPreviewed = previewCall?.id === call.id;
                    const madurez = call.diagnostico_ojt?.nivel_madurez;
                    const requiresTutor = call.diagnostico_ojt?.requiere_intervencion_tutor;

                    return (
                      <tr
                        key={call.id}
                        onClick={() => setPreviewCall(call)}
                        className={`group cursor-pointer transition ${
                          isPreviewed ? 'bg-[#E8F0FE]/60' : 'hover:bg-[#F8F9FA]'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-mono font-bold text-[#1A73E8]">
                            {call.codigo_llamada}
                          </div>
                          {call.file_name && (
                            <div className="text-[11px] font-medium text-[#5F6368] truncate max-w-[170px]" title={`Audio original: ${call.file_name}`}>
                              📁 {call.file_name}
                            </div>
                          )}
                          <div className="text-[10px] text-[#80868B]">{call.fecha_hora}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#202124]">{call.agente_nombre}</div>
                          <div className="inline-block mt-0.5 rounded bg-[#F1F3F4] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#3C4043]">
                            ID: {call.agente_id}
                          </div>
                        </td>

                        {/* OJT Diagnosis Status */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              madurez === 'LISTO_PRODUCCION'
                                ? 'bg-[#E6F4EA] text-[#137333]'
                                : madurez === 'EN_DESARROLLO'
                                ? 'bg-[#FEF7E0] text-[#B06000]'
                                : 'bg-[#FCE8E6] text-[#EA4335]'
                            }`}>
                              {madurez === 'LISTO_PRODUCCION' ? 'Listo Prod' : madurez === 'EN_DESARROLLO' ? 'En Desarrollo' : 'Refuerzo'}
                            </span>
                            {requiresTutor && (
                              <span className="flex items-center gap-1 text-[10px] font-bold text-[#EA4335]">
                                <GraduationCap className="h-3 w-3" />
                                Alerta Tutor
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-[#202124]">{call.cliente_nombre}</div>
                          <div className="font-mono text-[11px] text-[#5F6368]">{call.cliente_telefono}</div>
                        </td>

                        <td className="max-w-xs py-3.5 px-4">
                          <div className="line-clamp-1 font-bold text-[#202124]" title={call.motivo_nombre}>
                            {call.motivo_nombre}
                          </div>
                          <div className="text-[11px] text-[#5F6368]">{call.cola_atencion}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-mono font-medium text-[#202124]">{call.duracion_total}</div>
                          <div className="text-[11px] text-[#5F6368]">
                            Silencio: <strong className="text-[#FBBC05]">{call.silencio_analisis?.porcentaje_silencio ?? 0}%</strong>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-base font-extrabold ${
                                call.qa_score_global >= 85
                                  ? 'text-[#137333]'
                                  : call.qa_score_global >= 65
                                  ? 'text-[#B06000]'
                                  : 'text-[#C5221F]'
                              }`}
                            >
                              {call.qa_score_global}%
                            </span>
                          </div>
                          <div className="text-[10px] font-medium text-[#5F6368]">Pauta de Calidad</div>
                        </td>

                        <td className="py-3.5 px-4">
                          {(() => {
                            const npsClasif = getNormalizedNPS(call.nps_pronostico, call.qa_score_global);
                            const effectiveScore = typeof call.nps_pronostico?.score === 'number'
                              ? (npsClasif === 'PROMOTOR' && call.nps_pronostico.score < 9 ? 9 : call.nps_pronostico.score)
                              : (npsClasif === 'PROMOTOR' ? 9 : npsClasif === 'DETRACTOR' ? 3 : 7);
                            return (
                              <div>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                                    npsClasif === 'DETRACTOR'
                                      ? 'bg-[#FCE8E6] text-[#C5221F] border-[#FAD2CF]'
                                      : npsClasif === 'PROMOTOR'
                                      ? 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]'
                                      : 'bg-[#FEF7E0] text-[#B06000] border-[#FEEFC3]'
                                  }`}
                                >
                                  {effectiveScore}/10 • {npsClasif}
                                </span>
                                <div className="mt-0.5 text-[10px] text-[#80868B]">Satisfacción Cliente</div>
                              </div>
                            );
                          })()}
                        </td>

                        <td className="py-3.5 px-4">
                          {call.quiebres_atencion && call.quiebres_atencion.length > 0 ? (
                            <span className="flex items-center gap-1 font-bold text-[#EA4335]">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {call.quiebres_atencion.length}
                            </span>
                          ) : (
                            <span className="font-medium text-[#34A853]">0</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewCall(call);
                              }}
                              className="rounded-full p-1.5 text-[#5F6368] hover:bg-[#E8EAED]"
                              title="Vista previa rápida lateral"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCall(call);
                              }}
                              className="inline-flex items-center gap-1 rounded-full bg-[#1A73E8] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#1557B0]"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Auditoría</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <p className="text-xs font-bold text-[#202124]">
                          {calls.length === 0
                            ? 'No hay llamadas auditadas todavía'
                            : 'No se encontraron llamadas con los filtros seleccionados'}
                        </p>
                        <p className="max-w-md text-[11px] text-[#5F6368]">
                          {calls.length === 0
                            ? 'Sube tus grabaciones de audio (.mp3, .wav, .m4a, .ogg) para procesar el análisis acústico, transcripción y auditoría con IA.'
                            : 'Prueba ajustando los términos de búsqueda o limpiando los filtros para ver otros registros.'}
                        </p>
                        {calls.length === 0 ? (
                          <button
                            onClick={onOpenUpload}
                            className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#1557B0]"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Cargar Llamadas</span>
                          </button>
                        ) : (
                          <button
                            onClick={resetFilters}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#3C4043] transition hover:bg-[#F1F3F4]"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Limpiar Filtros</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Side Drawer Preview when clicking a call */}
        {previewCall && (
          <div className="w-full shrink-0 lg:w-96 flex flex-col gap-4 rounded-3xl border border-[#DADCE0] bg-white p-5 shadow-lg sticky top-20 max-h-[calc(100vh-120px)] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#DADCE0] pb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-[#1A73E8]">{previewCall.codigo_llamada}</span>
                <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold text-[#1A73E8]">
                  QA {previewCall.qa_score_global}%
                </span>
              </div>
              <button
                onClick={() => setPreviewCall(null)}
                className="rounded-full p-1 text-[#5F6368] hover:bg-[#F1F3F4]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Asesor info */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#5F6368]">Asesor Evaluado</span>
              <p className="font-bold text-[#202124]">{previewCall.agente_nombre} ({previewCall.agente_id})</p>
              <p className="text-xs text-[#5F6368]">{previewCall.cola_atencion} • Duración: {previewCall.duracion_total}</p>
            </div>

            {/* Quick Metrics Badge Summary */}
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-3">
              <div>
                <span className="text-[10px] text-[#5F6368]">QA Global</span>
                <p className={`text-base font-extrabold ${
                  previewCall.qa_score_global >= 85
                    ? 'text-[#34A853]'
                    : previewCall.qa_score_global >= 65
                    ? 'text-[#FBBC05]'
                    : 'text-[#EA4335]'
                }`}>
                  {previewCall.qa_score_global}%
                </p>
              </div>
              <div>
                <span className="text-[10px] text-[#5F6368]">tNPS Pronóstico</span>
                {(() => {
                  const npsClasif = getNormalizedNPS(previewCall.nps_pronostico, previewCall.qa_score_global);
                  const effectiveScore = typeof previewCall.nps_pronostico?.score === 'number'
                    ? (npsClasif === 'PROMOTOR' && previewCall.nps_pronostico.score < 9 ? 9 : previewCall.nps_pronostico.score)
                    : (npsClasif === 'PROMOTOR' ? 9 : npsClasif === 'DETRACTOR' ? 3 : 7);
                  return (
                    <p className={`text-base font-extrabold ${
                      npsClasif === 'PROMOTOR'
                        ? 'text-[#137333]'
                        : npsClasif === 'NEUTRO'
                        ? 'text-[#B06000]'
                        : 'text-[#EA4335]'
                    }`}>
                      {effectiveScore}/10 ({npsClasif})
                    </p>
                  );
                })()}
              </div>
            </div>

            {/* OJT Diagnosis snippet */}
            {previewCall.diagnostico_ojt && (
              <OjtDiagnosisCard diagnostico={previewCall.diagnostico_ojt} />
            )}

            {/* Action button to open full audit */}
            <button
              onClick={() => onSelectCall(previewCall)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[#1A73E8] py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1557B0]"
            >
              <span>Abrir Auditoría Completa</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
