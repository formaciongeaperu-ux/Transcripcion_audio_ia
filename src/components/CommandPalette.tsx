import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  PhoneCall, 
  User, 
  AlertTriangle, 
  Upload, 
  Download, 
  FileSpreadsheet, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  X,
  Layers,
  GraduationCap,
  SlidersHorizontal
} from 'lucide-react';
import { CallRecord } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  calls: CallRecord[];
  onSelectCall: (call: CallRecord) => void;
  onOpenUpload: () => void;
  onExport: () => void;
  onOpenSheets: () => void;
  onNavigateTab: (tab: 'dashboard' | 'explorer' | 'calibration') => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  calls,
  onSelectCall,
  onOpenUpload,
  onExport,
  onOpenSheets,
  onNavigateTab,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter results
  const filteredCalls = useMemo(() => {
    if (!query.trim()) return calls.slice(0, 6);
    const q = query.toLowerCase().trim();
    return calls.filter((c) => 
      c.codigo_llamada.toLowerCase().includes(q) ||
      c.agente_nombre.toLowerCase().includes(q) ||
      c.agente_id.toLowerCase().includes(q) ||
      c.cliente_nombre.toLowerCase().includes(q) ||
      c.cliente_telefono.includes(q) ||
      c.motivo_nombre.toLowerCase().includes(q) ||
      c.cola_atencion.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.toLowerCase().includes(q)) ||
      (c.alertas && c.alertas.some((a) => a.toLowerCase().includes(q)))
    ).slice(0, 8);
  }, [calls, query]);

  // Quick action commands
  const quickActions = useMemo(() => {
    const actions = [
      {
        id: 'action-upload',
        label: 'Cargar y Analizar Nuevos Audios',
        category: 'Acciones Rápidas',
        icon: Upload,
        perform: () => { onOpenUpload(); onClose(); }
      },
      {
        id: 'action-export',
        label: 'Exportar Auditorías a Excel (XLSX)',
        category: 'Acciones Rápidas',
        icon: Download,
        perform: () => { onExport(); onClose(); }
      },
      {
        id: 'action-sheets',
        label: 'Conectar Base Google Sheets Corporativa',
        category: 'Acciones Rápidas',
        icon: FileSpreadsheet,
        perform: () => { onOpenSheets(); onClose(); }
      },
      {
        id: 'action-dashboard',
        label: 'Ir al Dashboard de Métricas y SLAs',
        category: 'Navegación',
        icon: Layers,
        perform: () => { onNavigateTab('dashboard'); onClose(); }
      },
      {
        id: 'action-explorer',
        label: 'Ir al Explorador de Llamadas',
        category: 'Navegación',
        icon: PhoneCall,
        perform: () => { onNavigateTab('explorer'); onClose(); }
      },
      {
        id: 'action-calibration',
        label: 'Ir a Calibración de Prompts & Chatbot Consultor',
        category: 'Navegación',
        icon: SlidersHorizontal,
        perform: () => { onNavigateTab('calibration'); onClose(); }
      }
    ];

    if (!query.trim()) return actions;
    const q = query.toLowerCase().trim();
    return actions.filter((a) => a.label.toLowerCase().includes(q));
  }, [query, onOpenUpload, onExport, onOpenSheets, onNavigateTab, onClose]);

  // Combine items for keyboard navigation
  const totalItemsCount = filteredCalls.length + quickActions.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (totalItemsCount || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (totalItemsCount || 1)) % (totalItemsCount || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex < filteredCalls.length) {
          const call = filteredCalls[selectedIndex];
          if (call) {
            onSelectCall(call);
            onClose();
          }
        } else {
          const actionIdx = selectedIndex - filteredCalls.length;
          const action = quickActions[actionIdx];
          if (action) {
            action.perform();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalItemsCount, selectedIndex, filteredCalls, quickActions, onSelectCall, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#202124]/60 p-4 pt-16 backdrop-blur-xs transition-opacity animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl overflow-hidden rounded-3xl border border-[#DADCE0] bg-white shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center border-b border-[#DADCE0] px-4 py-3">
          <Search className="h-5 w-5 text-[#5F6368]" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Buscar por código, asesor, RUT/teléfono, motivo, alerta SERNAC... (o escribe una acción)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="flex-1 bg-transparent px-3 text-sm text-[#202124] placeholder-[#5F6368] outline-none"
          />
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="rounded-full p-1 text-[#5F6368] hover:bg-[#F1F3F4]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden rounded-md border border-[#DADCE0] bg-[#F8F9FA] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#5F6368] sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {/* Section: Calls */}
          {filteredCalls.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
                <span>Llamadas & Auditorías ({filteredCalls.length})</span>
                <span className="text-[10px] font-normal text-[#9AA0A6]">Presiona ENTER para abrir</span>
              </div>
              <div className="space-y-1">
                {filteredCalls.map((call, idx) => {
                  const isSelected = idx === selectedIndex;
                  const isDetractor = call.nps_pronostico?.clasificacion === 'DETRACTOR';
                  const isPromotor = call.nps_pronostico?.clasificacion === 'PROMOTOR';

                  return (
                    <div
                      key={call.id}
                      onClick={() => {
                        onSelectCall(call);
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl px-3.5 py-2.5 transition ${
                        isSelected 
                          ? 'bg-[#E8F0FE] text-[#1A73E8]' 
                          : 'hover:bg-[#F8F9FA] text-[#202124]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold ${
                          isSelected ? 'bg-[#1A73E8] text-white' : 'bg-[#F1F3F4] text-[#5F6368]'
                        }`}>
                          <PhoneCall className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold">{call.codigo_llamada}</span>
                            <span className="rounded-full bg-[#F1F3F4] px-2 py-0.5 text-[10px] font-medium text-[#5F6368]">
                              {call.cola_atencion}
                            </span>
                            {call.diagnostico_ojt?.requiere_intervencion_tutor && (
                              <span className="flex items-center gap-1 rounded-full bg-[#FCE8E6] px-1.5 py-0.5 text-[10px] font-bold text-[#EA4335]">
                                <GraduationCap className="h-3 w-3" />
                                OJT Tutor
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-[#5F6368]">
                            <span>Asesor: <strong className="text-[#202124]">{call.agente_nombre}</strong></span>
                            <span>•</span>
                            <span className="line-clamp-1 max-w-xs">{call.motivo_nombre}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className={`text-xs font-bold ${
                            call.qa_score_global >= 80 ? 'text-[#137333]' : call.qa_score_global >= 65 ? 'text-[#B06000]' : 'text-[#EA4335]'
                          }`}>
                            QA {call.qa_score_global}%
                          </span>
                          <span className={`block text-[10px] font-semibold ${
                            isPromotor ? 'text-[#137333]' : isDetractor ? 'text-[#EA4335]' : 'text-[#B06000]'
                          }`}>
                            tNPS {call.nps_pronostico?.score}/10
                          </span>
                        </div>
                        <ArrowRight className={`h-4 w-4 transition-transform ${isSelected ? 'translate-x-0.5 text-[#1A73E8]' : 'text-[#DADCE0]'}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Quick Actions */}
          {quickActions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#5F6368]">
                Acciones del Sistema & Navegación
              </div>
              <div className="space-y-1">
                {quickActions.map((act, actIdx) => {
                  const itemIndex = filteredCalls.length + actIdx;
                  const isSelected = itemIndex === selectedIndex;
                  const ActionIcon = act.icon;

                  return (
                    <div
                      key={act.id}
                      onClick={() => act.perform()}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl px-3.5 py-2.5 transition ${
                        isSelected 
                          ? 'bg-[#E8F0FE] text-[#1A73E8]' 
                          : 'hover:bg-[#F8F9FA] text-[#202124]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          isSelected ? 'bg-[#1A73E8] text-white' : 'bg-[#F1F3F4] text-[#5F6368]'
                        }`}>
                          <ActionIcon className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-semibold">{act.label}</span>
                      </div>
                      <kbd className="rounded-md border border-[#DADCE0] bg-white px-2 py-0.5 font-mono text-[10px] text-[#5F6368]">
                        ENTER
                      </kbd>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {totalItemsCount === 0 && (
            <div className="py-8 text-center text-xs text-[#5F6368]">
              No se encontraron llamadas ni acciones para "{query}".
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-[#DADCE0] bg-[#F8F9FA] px-4 py-2.5 text-[11px] text-[#5F6368]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#DADCE0] bg-white px-1 font-mono">↑</kbd>
              <kbd className="rounded border border-[#DADCE0] bg-white px-1 font-mono">↓</kbd> Navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-[#DADCE0] bg-white px-1 font-mono">↵</kbd> Seleccionar
            </span>
          </div>
          <span className="text-[10px] text-[#1A73E8] font-medium">Claro Enterprise Command Center</span>
        </div>
      </div>
    </div>
  );
};
