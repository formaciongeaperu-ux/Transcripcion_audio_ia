import React from 'react';
import { 
  LayoutDashboard, 
  ListFilter, 
  Headphones, 
  UploadCloud, 
  Clock, 
  FileSpreadsheet, 
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sparkles
} from 'lucide-react';

export type TabType = 'dashboard' | 'explorer' | 'audit' | 'queue';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onOpenUpload: () => void;
  onOpenExport: () => void;
  onOpenSheets: () => void;
  isSheetsConnected: boolean;
  sheetsTitle?: string;
  deferredCount: number;
  totalCalls: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  setIsOpen,
  onOpenUpload,
  onOpenExport,
  onOpenSheets,
  isSheetsConnected,
  sheetsTitle,
  deferredCount,
  totalCalls
}) => {
  const navItems = [
    {
      id: 'dashboard' as TabType,
      label: 'Dashboard de Rendimiento',
      sublabel: 'Métricas clave y quiebres',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'explorer' as TabType,
      label: 'Explorador de Llamadas',
      sublabel: `${totalCalls} grabaciones`,
      icon: ListFilter,
      badge: totalCalls,
    },
    {
      id: 'audit' as TabType,
      label: 'Visor de Auditoría',
      sublabel: 'Reproductor & NPS Claro',
      icon: Headphones,
      badge: null,
    },
    {
      id: 'queue' as TabType,
      label: 'Cola Diferida 429',
      sublabel: 'Resiliencia de cuotas',
      icon: Clock,
      badge: deferredCount > 0 ? deferredCount : null,
      badgeColor: 'bg-[#FBBC05] text-[#202124]',
    },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-20 flex flex-col border-r border-[#DADCE0] bg-white pt-16 transition-all duration-300 md:static ${
        isOpen ? 'w-64' : 'w-18'
      }`}
    >
      {/* Navigation list */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5F6368]">
            {isOpen ? 'Módulos Principales' : 'Menú'}
          </p>
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-item-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className={`group flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-[#E8F0FE] text-[#1A73E8]'
                  : 'text-[#3C4043] hover:bg-[#F1F3F4] hover:text-[#202124]'
              }`}
              title={!isOpen ? item.label : undefined}
            >
              <Icon
                className={`h-5 w-5 shrink-0 transition ${
                  isActive ? 'text-[#1A73E8]' : 'text-[#5F6368] group-hover:text-[#202124]'
                }`}
              />
              {isOpen && (
                <div className="flex flex-1 items-center justify-between text-left">
                  <div>
                    <div className="leading-tight">{item.label}</div>
                    <div className="text-[11px] font-normal text-[#5F6368]">{item.sublabel}</div>
                  </div>
                  {item.badge !== null && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        item.badgeColor || 'bg-[#E8EAED] text-[#3C4043]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}

        <div className="my-3 border-t border-[#DADCE0]" />

        {/* Action triggers */}
        <div className="px-3 py-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#5F6368]">
            {isOpen ? 'Acciones Rápidas' : 'Acciones'}
          </p>
        </div>

        <button
          id="btn-sidebar-upload"
          onClick={onOpenUpload}
          className="group flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium text-[#3C4043] transition hover:bg-[#F1F3F4]"
          title={!isOpen ? 'Procesar Nuevos Audios' : undefined}
        >
          <UploadCloud className="h-5 w-5 shrink-0 text-[#1A73E8]" />
          {isOpen && (
            <div className="text-left">
              <div className="leading-tight text-[#1A73E8]">Cargar Nuevos Audios</div>
              <div className="text-[11px] font-normal text-[#5F6368]">Con optimización 16kHz</div>
            </div>
          )}
        </button>

        <button
          id="btn-sidebar-sheets"
          onClick={onOpenSheets}
          className={`group flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium transition ${
            isSheetsConnected ? 'bg-[#F6FBF7] text-[#137333] hover:bg-[#E6F4EA]' : 'text-[#3C4043] hover:bg-[#F1F3F4]'
          }`}
          title={!isOpen ? 'Base de Datos Google Sheets' : undefined}
        >
          <FileSpreadsheet className={`h-5 w-5 shrink-0 ${isSheetsConnected ? 'text-[#137333]' : 'text-[#0F9D58]'}`} />
          {isOpen && (
            <div className="flex-1 text-left">
              <div className="flex items-center gap-1.5 leading-tight">
                <span className={isSheetsConnected ? 'font-bold text-[#137333]' : 'text-[#202124]'}>
                  Base Google Sheets
                </span>
                {isSheetsConnected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#137333]"></span>
                )}
              </div>
              <div className="text-[11px] font-normal text-[#5F6368] truncate max-w-[140px]">
                {isSheetsConnected ? (sheetsTitle || 'Conectado') : 'Vincular o Crear'}
              </div>
            </div>
          )}
        </button>

        <button
          id="btn-sidebar-export"
          onClick={onOpenExport}
          className="group flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-sm font-medium text-[#3C4043] transition hover:bg-[#F1F3F4]"
          title={!isOpen ? 'Exportar Reporte Excel' : undefined}
        >
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-[#34A853]" />
          {isOpen && (
            <div className="text-left">
              <div className="leading-tight text-[#202124]">Exportar Base (.xlsx)</div>
              <div className="text-[11px] font-normal text-[#5F6368]">Formato oficial Claro QA</div>
            </div>
          )}
        </button>
      </div>

      {/* Bottom Info Card (Google Cloud Project context) */}
      {isOpen && (
        <div className="m-3 rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#1A73E8]" />
            <span className="text-xs font-semibold text-[#202124]">Motor de Auditoría</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#5F6368]">
            Análisis de quiebres, NPS Claro y silencio conversacional con Gemini 3 Series y resiliencia 429.
          </p>
        </div>
      )}

      {/* Collapse Toggle Footer */}
      <div className="border-t border-[#DADCE0] p-2">
        <button
          id="btn-toggle-sidebar-width"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-center rounded-lg p-2 text-[#5F6368] hover:bg-[#F1F3F4]"
          title={isOpen ? 'Colapsar menú' : 'Expandir menú'}
        >
          {isOpen ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </button>
      </div>
    </aside>
  );
};
