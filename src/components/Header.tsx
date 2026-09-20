import React, { useState, useRef, useEffect } from 'react';
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
  User,
  LogOut,
  Shield,
  CheckCircle2,
  Database
} from 'lucide-react';
import { GeaLogo } from './GeaLogo';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

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
  const { user, profile, openAuthModal, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadge = (role?: UserRole) => {
    switch (role) {
      case 'super_admin':
        return { label: 'Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'supervisor':
        return { label: 'Supervisor', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'agent':
        return { label: 'Asesor', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'qa_auditor':
      default:
        return { label: 'Auditor QA', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
  };
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

        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center">
            <GeaLogo size={38} className="h-9 w-auto shrink-0 drop-shadow-xs" />
          </div>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <span className="font-['Google_Sans',sans-serif] text-base font-black tracking-tight leading-tight sm:text-lg">
                <span className="text-[#072242]">GEA </span>
                <span className="text-[#0072CE]">PERÚ</span>
              </span>
              <span className="hidden rounded-full border border-[#0072CE]/25 bg-[#EBF3FC] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#0072CE] sm:inline-block">
                SPEECH ANALYTICS
              </span>
            </div>
            <div className="flex items-center text-[10px] leading-tight tracking-tight">
              <span className="font-bold text-[#0072CE] uppercase tracking-wider">WORKFORCE MANAGEMENT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle: Command Bar */}
      <div className="flex max-w-xl flex-1 items-center px-3">
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

        {/* Supabase User Profile & Authentication Button */}
        <div className="relative" ref={menuRef}>
          {user ? (
            <button
              id="btn-user-profile"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 rounded-full border border-[#DADCE0] bg-white py-1 pl-1 pr-2.5 shadow-2xs transition hover:bg-[#F8F9FA]"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B192C] text-xs font-bold text-white shadow-xs">
                {(profile?.full_name || user.email || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div className="hidden flex-col text-left lg:flex">
                <span className="text-xs font-bold leading-tight text-[#202124] max-w-[110px] truncate">
                  {profile?.full_name || user.email?.split('@')[0]}
                </span>
                <span className="text-[10px] text-[#5F6368] leading-tight">
                  {getRoleBadge(profile?.role).label}
                </span>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  getRoleBadge(profile?.role).color
                }`}
              >
                {getRoleBadge(profile?.role).label}
              </span>
            </button>
          ) : (
            <button
              id="btn-login-trigger"
              onClick={openAuthModal}
              className="flex items-center gap-1.5 rounded-full border border-[#1A73E8] bg-[#E8F0FE] px-3 py-1.5 text-xs font-bold text-[#1A73E8] shadow-xs transition hover:bg-[#D2E3FC] active:scale-95"
            >
              <User className="h-3.5 w-3.5" />
              <span>Iniciar Sesión</span>
            </button>
          )}

          {/* User Dropdown Menu */}
          {userMenuOpen && user && (
            <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-2xl border border-[#DADCE0] bg-white p-2 shadow-xl z-50 animate-in fade-in">
              <div className="border-b border-[#F1F3F4] px-3 py-2.5">
                <div className="text-xs font-bold text-[#202124]">
                  {profile?.full_name || 'Usuario'}
                </div>
                <div className="text-[11px] text-[#5F6368] truncate">{user.email}</div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      getRoleBadge(profile?.role).color
                    }`}
                  >
                    Rol: {getRoleBadge(profile?.role).label}
                  </span>
                  {profile?.campana && (
                    <span className="text-[10px] font-medium text-[#80868B]">
                      {profile.campana}
                    </span>
                  )}
                </div>
              </div>

              <div className="px-3 py-2 text-[11px] text-[#5F6368] flex items-center gap-2 border-b border-[#F1F3F4]">
                <Database className="h-3.5 w-3.5 text-[#137333]" />
                <span>Base en Nube: <strong className="text-[#137333]">Supabase Conectado</strong></span>
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  signOut();
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#C5221F] hover:bg-[#FCE8E6] transition"
              >
                <LogOut className="h-4 w-4" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
