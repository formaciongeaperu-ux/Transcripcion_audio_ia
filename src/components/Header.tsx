import React from 'react';
import { 
  Sparkles, 
  Upload, 
  Download, 
  Clock, 
  Search, 
  Menu, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  PhoneCall,
  FileSpreadsheet
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
}) => {
  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#DADCE0] bg-white px-4 shadow-[0_1px_2px_rgba(60,64,67,0.06)] md:px-6">
      {/* Left: Hamburger & Brand */}
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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1A73E8] text-white shadow-sm">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-['Google_Sans',sans-serif] text-base font-bold tracking-tight text-[#202124]">
                Claro Speech Analytics
              </span>
              <span className="hidden rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[11px] font-medium text-[#1A73E8] sm:inline-block">
                Google Cloud AI
              </span>
            </div>
            <span className="text-[11px] text-[#5F6368]">
              Contact Center Quality & NPS Predictor
            </span>
          </div>
        </div>
      </div>

      {/* Middle: Search input (Google Cloud search bar style) */}
      <div className="hidden max-w-md flex-1 items-center px-4 md:flex">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5F6368]" />
          <input
            id="input-global-search"
            type="text"
            placeholder="Buscar por asesor, ID, motivo o palabra clave..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 w-full rounded-full border border-transparent bg-[#F1F3F4] pl-10 pr-4 text-sm text-[#202124] placeholder-[#5F6368] outline-none transition focus:border-[#1A73E8] focus:bg-white focus:shadow-sm"
          />
        </div>
      </div>

      {/* Right: Status badges and action buttons */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Cascade status indicator */}
        <div className="hidden items-center gap-1.5 rounded-full border border-[#DADCE0] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#3C4043] lg:flex">
          <Sparkles className="h-3.5 w-3.5 text-[#1A73E8]" />
          <span className="font-medium text-[#202124]">Cascade:</span>
          <span className="font-mono text-[11px] text-[#1A73E8]">gemini-3.6-flash</span>
          <span className="text-[10px] text-[#5F6368]">→ 3.5 → cascade</span>
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
          className="flex items-center gap-1.5 rounded-full border border-[#DADCE0] bg-white px-3 py-1.5 text-xs font-medium text-[#3C4043] shadow-sm transition hover:bg-[#F8F9FA] active:bg-[#F1F3F4]"
          title="Exportar base completa a Excel (.xlsx)"
        >
          <Download className="h-3.5 w-3.5 text-[#1A73E8]" />
          <span className="hidden sm:inline">Exportar Excel</span>
        </button>

        {/* Upload Audio Primary Button (Google Blue) */}
        <button
          id="btn-primary-upload"
          onClick={onOpenUpload}
          className="flex items-center gap-2 rounded-full bg-[#1A73E8] px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-[#1557B0] hover:shadow active:bg-[#174EA6]"
        >
          <Upload className="h-4 w-4" />
          <span>Cargar Audios</span>
        </button>
      </div>
    </header>
  );
};
