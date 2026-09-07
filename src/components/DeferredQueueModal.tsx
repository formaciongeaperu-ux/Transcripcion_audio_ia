import React, { useState } from 'react';
import { 
  X, 
  Clock, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Play, 
  Sparkles,
  ShieldCheck,
  Zap,
  Info
} from 'lucide-react';
import { UploadItem, CallRecord } from '../types';

interface DeferredQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  deferredItems: UploadItem[];
  onRemoveItem: (id: string) => void;
  onClearQueue: () => void;
  onRetryItem: (item: UploadItem) => Promise<void>;
  onRetryAll: () => Promise<void>;
  isRetrying: boolean;
}

export const DeferredQueueModal: React.FC<DeferredQueueModalProps> = ({
  isOpen,
  onClose,
  deferredItems,
  onRemoveItem,
  onClearQueue,
  onRetryItem,
  onRetryAll,
  isRetrying,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-[#DADCE0] bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#DADCE0] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FBBC05] text-[#202124]">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Cola Diferida de Resiliencia (429 Rate Limits)
              </h2>
              <p className="text-xs text-[#5F6368]">
                Protección contra saturación de TPM/RPM con reintento programado
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-[#5F6368] hover:bg-[#F1F3F4]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Explanation Banner */}
          <div className="mb-4 rounded-2xl border border-[#DADCE0] bg-[#FEF7E0]/50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-[#B06000] shrink-0" />
              <div className="text-xs">
                <span className="font-bold text-[#B06000]">Mecanismo de Resiliencia Activo:</span>
                <p className="mt-1 leading-relaxed text-[#3C4043]">
                  Cuando los modelos en cascada (gemini-2.5-flash → gemini-2.0-flash → gemini-1.5-flash) agotan su cuota de peticiones simultáneas, las llamadas se resguardan aquí para ser reintentadas automáticamente sin perder datos.
                </p>
              </div>
            </div>
          </div>

          {/* List of deferred calls */}
          {deferredItems.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-[#5F6368]">
                <span className="font-semibold text-[#202124]">
                  {deferredItems.length} llamadas pendientes de reintento
                </span>
                <button
                  onClick={onClearQueue}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#EA4335] hover:underline"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Limpiar cola</span>
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-2">
                {deferredItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-[#DADCE0] bg-[#F8F9FA] p-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#202124]">{item.file.name}</div>
                      <div className="text-[11px] text-[#B06000]">
                        {item.errorMessage || 'En pausa por límite de cuota (HTTP 429)'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={isRetrying}
                        onClick={() => onRetryItem(item)}
                        className="flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#1A73E8] border border-[#DADCE0] shadow-xs hover:bg-[#E8F0FE]"
                      >
                        <RefreshCw className={`h-3 w-3 ${isRetrying ? 'animate-spin' : ''}`} />
                        <span>Reintentar</span>
                      </button>

                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1 text-[#5F6368] hover:text-[#EA4335]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F4EA] text-[#34A853]">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-sm font-bold text-[#202124]">Cola de resiliencia vacía</h3>
              <p className="mt-1 text-xs text-[#5F6368]">
                Todas las llamadas fueron procesadas exitosamente sin saturación de cuota.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#DADCE0] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-full border border-[#DADCE0] px-4 py-2 text-xs font-semibold text-[#3C4043] hover:bg-[#F8F9FA]"
          >
            Cerrar
          </button>

          {deferredItems.length > 0 && (
            <button
              disabled={isRetrying}
              onClick={onRetryAll}
              className="flex items-center gap-2 rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#1557B0] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              <span>{isRetrying ? 'Reintentando en Cascada...' : 'Reintentar Todas Ahora'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
