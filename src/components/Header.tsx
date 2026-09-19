import React from 'react';
import { 
  Upload, 
  Download, 
  Clock, 
  Search, 
  Menu, 
  PhoneCall, 
  FileSpreadsheet,
  Command,
  Activity,
  Filter,
  GraduationCap
} from 'lucide-react';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  onOpenUpload: () => void;
  onOpenQueue: () => void;
  onExport: () => void;
  deferredCount: number;
  activeCallsCount: number;
  isOnline: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onOpenSheets: () => void;
  isSheetsConnected: boolean;
  sheetsTitle?: string;
  onOpenCommandPalette?: () => void;
  selectedCohort?: string;
  setSelectedCohort?: (cohort: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  sidebarOpen,
  setSidebarOpen,
  onOpenUpload,
  onOpenQueue,
  onExport,
  deferredCount,
  activeCallsCount,
  searchTerm,
  setSearchTerm,
  onOpenSheets,
  isSheetsConnected,
  sheetsTitle,
  onOpenCommandPalette,
  selectedCohort = 'all',
  setSelectedCohort,
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#DADCE0] bg-white px-4 shadow-[0_1px_3px_rgba(60,64,67,0.08)] md:px-6">
      {/* Left: Hamburger & Claro Enterprise Brand */}
      <div className="flex items-center gap-3">
        <button
          id="btn-toggle-sidebar"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-full p-2 text-[#5F6368] hover:bg-[#F1F3F4] active:bg-[#E8EAED]"
          title="Alternar menú lateral"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#DA291C] text-white shadow-sm ring-2 ring-[#DA291C]/20">
            <PhoneCall className="h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-['Google_Sans',sans-serif] text-sm font-bold tracking-tight text-[#202124] sm:text-base">
                Claro Speech Analytics
              </span>
              <span className="hidden rounded-full border border-[#DA291C]/20 bg-[#FCE8E6] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#C5221F] sm:inline-block">
                ENTERPRISE QA & OJT
              </span>
            </div>
            <span className="hidden text-[10px] text-[#5F6368] sm:inline-block">
              Aseguramiento de Calidad & Predicción tNPS • Claro Chile
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Command Bar & Cohort Selector */}
      <div className="flex max-w-xl flex-1 items-center gap-2 px-3">
        {/* Cohort / Nido Selector */}
        {setSelectedCohort && (
          <div className="hidden items-center gap-1.5 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#3C4043] xl:flex">
            <GraduationCap className="h-3.5 w-3.5 text-[#1A73E8]" />
            <select
              value={selectedCohort}
              onChange={(e) => setSelectedCohort(e.target.value)}
              className="cursor-pointer bg-transparent text-xs font-semibold text-[#202124] outline-none"
            >
              <option value="all">Todos los Nidos OJT</option>
              <option value="nido_movil">Nido Móvil Postpago</option>
              <option value="nido_fibra">Nido Fibra y Fija</option>
              <option value="nido_retenciones">Nido Retenciones & Bajas</option>
              <option value="graduados">Producción Regular (Graduados)</option>
            </select>
          </div>
        )}

        {/* Global Command Bar (Click opens CommandPalette or search) */}
        <div 
          onClick={onOpenCommandPalette}
          className="group relative flex h-10 w-full cursor-pointer items-center justify-between rounded-full border border-transparent bg-[#F1F3F4] px-3.5 text-xs text-[#5F6368] transition hover:border-[#DADCE0] hover:bg-white hover:shadow-xs focus-within:border-[#1A73E8] focus-within:bg-white"
        >
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-[#5F6368] group-hover:text-[#1A73E8]" />
            <span className="truncate text-xs text-[#5F6368]">
              {searchTerm ? `Búsqueda: "${searchTerm}"` : 'Buscar por asesor, ID, RUT, motivo o alerta...'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="hidden items-center gap-0.5 rounded-md border border-[#DADCE0] bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#5F6368] shadow-2xs sm:inline-flex">
              <Command className="h-2.5 w-2.5" /> K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Live SLA & Operational Buttons */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Live Pipeline Status */}
        <div className="hidden items-center gap-1.5 rounded-full border border-[#CEEAD6] bg-[#E6F4EA] px-3 py-1.5 text-xs font-semibold text-[#137333] lg:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#34A853] opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#34A853]"></span>
          </span>
          <span className="text-[11px]">SLA 99.8% Online</span>
        </div>

        {/* Deferred 429 Queue button */}
        <button
          id="btn-open-queue"
          onClick={onOpenQueue}
          className={`relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
            deferredCount > 0
              ? 'border-[#FBBC05] bg-[#FEF7E0] text-[#B06000] hover:bg-[#FEEFC3]'
              : 'border-[#DADCE0] bg-white text-[#5F6368] hover:bg-[#F8F9FA]'
          }`}
          title="Cola diferida de resiliencia ante errores 429"
        >
          <Clock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Cola 429</span>
          {deferredCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EA4335] text-[10px] font-bold text-white">
              {deferredCount}
            </span>
          )}
        </button>

        {/* Google Sheets Database Button */}
        <button
          id="btn-sheets-integration"
          onClick={onOpenSheets}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-xs transition ${
            isSheetsConnected
              ? 'border-[#CEEAD6] bg-[#E6F4EA] text-[#137333] hover:bg-[#CEEAD6]'
              : 'border-[#DADCE0] bg-white text-[#3C4043] hover:bg-[#F8F9FA]'
          }`}
          title={isSheetsConnected ? `Base conectada: ${sheetsTitle || 'Google Sheets'}` : 'Conectar Base de Datos Google Sheets'}
        >
          <FileSpreadsheet className={`h-3.5 w-3.5 ${isSheetsConnected ? 'text-[#137333]' : 'text-[#0F9D58]'}`} />
          <span className="hidden sm:inline">
            {isSheetsConnected ? 'Sheets Conectado' : 'Google Sheets'}
          </span>
          {isSheetsConnected && (
            <span className="h-2 w-2 rounded-full bg-[#137333]"></span>
          )}
        </button>

        {/* Export Excel / CSV button */}
        <button
          id="btn-export-excel"
          onClick={onExport}
          className="hidden items-center gap-1.5 rounded-full border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-medium text-[#3C4043] shadow-sm transition hover:bg-[#F8F9FA] active:bg-[#F1F3F4] md:flex"
          title="Exportar base completa a Excel (.xlsx)"
        >
          <Download className="h-3.5 w-3.5 text-[#1A73E8]" />
          <span>Exportar</span>
        </button>

        {/* Upload Audio Primary Button (Claro Red / Blue) */}
        <button
          id="btn-primary-upload"
          onClick={onOpenUpload}
          className="flex items-center gap-1.5 rounded-full bg-[#DA291C] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#C5221F] active:scale-95 sm:px-4"
        >
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Cargar Audios</span>
          <span className="sm:hidden">Cargar</span>
        </button>
      </div>
    </header>
  );
};
