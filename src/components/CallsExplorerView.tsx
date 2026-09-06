import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Play, 
  AlertTriangle, 
  Clock, 
  CheckCircle2, 
  X,
  ArrowUpDown,
  Plus
} from 'lucide-react';
import { CallRecord } from '../types';

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

  const queues = useMemo(() => {
    const set = new Set(calls.map((c) => c.cola_atencion));
    return Array.from(set);
  }, [calls]);

  const categories = useMemo(() => {
    const set = new Set(calls.map((c) => c.motivo_categoria));
    return Array.from(set);
  }, [calls]);

  const filteredCalls = useMemo(() => {
    return calls
      .filter((c) => {
        const matchesSearch =
          searchTerm === '' ||
          c.codigo_llamada.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.agente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.motivo_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.resumen.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.keywords.some((k) => k.toLowerCase().includes(searchTerm.toLowerCase()));

        const matchesQueue = selectedQueue === 'all' || c.cola_atencion === selectedQueue;
        const matchesSentiment = selectedSentiment === 'all' || c.sentimiento_label === selectedSentiment;
        const matchesNPS = selectedNPS === 'all' || c.nps_pronostico?.clasificacion === selectedNPS;
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
  }, [calls, searchTerm, selectedQueue, selectedSentiment, selectedNPS, selectedCategory, minQA, sortField, sortOrder]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedQueue('all');
    setSelectedSentiment('all');
    setSelectedNPS('all');
    setSelectedCategory('all');
    setMinQA(0);
  };

  const hasActiveFilters =
    searchTerm !== '' ||
    selectedQueue !== 'all' ||
    selectedSentiment !== 'all' ||
    selectedNPS !== 'all' ||
    selectedCategory !== 'all' ||
    minQA > 0;

  return (
    <div className="flex flex-col gap-6 pb-16">
      {/* Title & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        <div>
          <h1 className="font-['Google_Sans',sans-serif] text-2xl font-bold tracking-tight text-[#202124]">
            Explorador de Grabaciones & Auditorías
          </h1>
          <p className="mt-0.5 text-xs text-[#5F6368]">
            {filteredCalls.length} de {calls.length} llamadas coinciden con los criterios de búsqueda.
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
            className="flex items-center gap-1.5 rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1557B0]"
          >
            <Plus className="h-4 w-4" />
            <span>Cargar Audios</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-sm">
        {/* Top Search bar */}
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6368]" />
          <input
            id="input-explorer-search"
            type="text"
            placeholder="Buscar por código de llamada, asesor, cliente, motivo o palabra clave..."
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
              className="bg-transparent font-medium text-[#202124] outline-none cursor-pointer"
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
              className="bg-transparent font-medium text-[#202124] outline-none cursor-pointer"
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
              className="bg-transparent font-medium text-[#202124] outline-none cursor-pointer"
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
              className="bg-transparent font-medium text-[#202124] outline-none cursor-pointer"
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

      {/* Calls Table */}
      <div className="overflow-hidden rounded-3xl border border-[#DADCE0] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#DADCE0] bg-[#F8F9FA] text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
                <th className="py-3.5 px-4">Código / Fecha</th>
                <th className="py-3.5 px-4">Asesor</th>
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
                    <span>QA Score</span>
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
                    <span>NPS Predictivo</span>
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-3.5 px-4">Quiebres</th>
                <th className="py-3.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F3F4]">
              {filteredCalls.length > 0 ? (
                filteredCalls.map((call) => (
                  <tr
                    key={call.id}
                    onClick={() => onSelectCall(call)}
                    className="group cursor-pointer transition hover:bg-[#F8F9FA]"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-[#1A73E8]">
                        {call.codigo_llamada}
                      </div>
                      <div className="text-[11px] text-[#5F6368]">{call.fecha_hora}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-[#202124]">{call.agente_nombre}</div>
                      <div className="text-[11px] text-[#5F6368]">{call.agente_id}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-[#202124]">{call.cliente_nombre}</div>
                      <div className="font-mono text-[11px] text-[#5F6368]">{call.cliente_telefono}</div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
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
                      <span
                        className={`text-base font-extrabold ${
                          call.qa_score_global >= 85
                            ? 'text-[#34A853]'
                            : call.qa_score_global >= 65
                            ? 'text-[#FBBC05]'
                            : 'text-[#EA4335]'
                        }`}
                      >
                        {call.qa_score_global}%
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          call.nps_pronostico?.clasificacion === 'DETRACTOR'
                            ? 'bg-[#FCE8E6] text-[#EA4335]'
                            : call.nps_pronostico?.clasificacion === 'PROMOTOR'
                            ? 'bg-[#E6F4EA] text-[#137333]'
                            : 'bg-[#FEF7E0] text-[#B06000]'
                        }`}
                      >
                        {call.nps_pronostico?.score}/10 ({call.nps_pronostico?.clasificacion})
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {call.quiebres_atencion && call.quiebres_atencion.length > 0 ? (
                        <span className="flex items-center gap-1 font-bold text-[#EA4335]">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {call.quiebres_atencion.length}
                        </span>
                      ) : (
                        <span className="text-[#34A853] font-medium">0</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCall(call);
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-[#1A73E8] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#1557B0]"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Ver Auditoría</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
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
    </div>
  );
};
