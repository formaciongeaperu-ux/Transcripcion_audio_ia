import React, { useState, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileAudio, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sliders, 
  Sparkles, 
  Trash2, 
  Zap,
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { CallRecord, UploadItem } from '../types';
import { downsampleTo16kHzMonoWav } from '../utils/audioOptimizer';
import { normalizeAudioForPlayback } from '../utils/telephonyAudio';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCallsProcessed: (newCalls: CallRecord[]) => void;
  onAddToDeferredQueue: (item: UploadItem) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onCallsProcessed,
  onAddToDeferredQueue,
}) => {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [concurrency, setConcurrency] = useState<number>(3);
  const [optimizeAudio, setOptimizeAudio] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [overallProgress, setOverallProgress] = useState<number>(0);
  const [agentName, setAgentName] = useState('Asesor Claro');
  const [queueName, setQueueName] = useState('Exclusivo Postpago Chile');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newItems: UploadItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (
        file.type.startsWith('audio/') ||
        file.name.endsWith('.wav') ||
        file.name.endsWith('.mp3') ||
        file.name.endsWith('.m4a') ||
        file.name.endsWith('.ogg') ||
        file.name.endsWith('.webm')
      ) {
        newItems.push({
          id: `up-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
          file,
          originalSize: file.size,
          progress: 0,
          status: 'pending',
        });
      }
    }

    setItems((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearAll = () => {
    setItems([]);
  };

  // Process files with concurrency control
  const startProcessing = async () => {
    if (items.length === 0 || isProcessing) return;

    setIsProcessing(true);
    const completedCalls: CallRecord[] = [];
    const pendingItems = [...items];

    // Worker pool logic with max concurrent workers
    let currentIndex = 0;
    const activeWorkers: Promise<void>[] = [];

    const processSingleItem = async (item: UploadItem) => {
      // 1. Optimize audio step
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'optimizing', progress: 20 } : it))
      );

      let processedBase64 = '';
      let optimizedSize = item.originalSize;

      try {
        if (optimizeAudio) {
          const optResult = await downsampleTo16kHzMonoWav(item.file);
          processedBase64 = optResult.base64;
          optimizedSize = optResult.optimizedSize;
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    optimizedSize,
                    progress: 50,
                    status: 'processing',
                  }
                : it
            )
          );
        } else {
          // Convert file directly to base64
          const arrayBuf = await item.file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          processedBase64 = btoa(binary);
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, progress: 50, status: 'processing' } : it))
          );
        }

        // 2. Send to backend Gemini analysis API
        const response = await fetch('/api/analyze-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: processedBase64,
            mimeType: 'audio/wav',
            fileName: item.file.name,
            agentName,
            queue: queueName,
          }),
        });

        const resData = await response.json();

        if (response.ok && resData.success && resData.data) {
          const callData = resData.data as CallRecord;
          // Normalize telephony formats (G.711 A-law / µ-law) into playable PCM
          let audioUrl = '';
          try {
            const norm = await normalizeAudioForPlayback(item.file);
            audioUrl = URL.createObjectURL(norm.blob);
          } catch {
            audioUrl = URL.createObjectURL(item.file);
          }
          callData.audio_url = audioUrl;
          callData.audioFile = item.file;
          callData.file_name = item.file.name;
          completedCalls.push(callData);

          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: 'completed',
                    progress: 100,
                    resultRecord: callData,
                  }
                : it
            )
          );
        } else {
          // Handle 429 quota exhaustion or API key issue
          const is429 = response.status === 429 || resData.errorType === 'QUOTA_EXHAUSTED_ALL_MODELS';
          const errorMsg = resData.message || 'Error en análisis';

          if (is429) {
            onAddToDeferredQueue({
              ...item,
              status: 'deferred',
              errorMessage: errorMsg,
            });
          }

          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: is429 ? 'deferred' : 'error',
                    progress: 0,
                    errorMessage: errorMsg,
                  }
                : it
            )
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: 'error', errorMessage: msg } : it
          )
        );
      }
    };

    // Run pool
    const runWorker = async () => {
      while (currentIndex < pendingItems.length) {
        const item = pendingItems[currentIndex++];
        if (item.status === 'pending') {
          await processSingleItem(item);
        }
      }
    };

    const numWorkers = Math.min(concurrency, pendingItems.length);
    for (let w = 0; w < numWorkers; w++) {
      activeWorkers.push(runWorker());
    }

    await Promise.all(activeWorkers);

    setIsProcessing(false);
    if (completedCalls.length > 0) {
      onCallsProcessed(completedCalls);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const completedCount = items.filter((it) => it.status === 'completed').length;
  const errorCount = items.filter((it) => it.status === 'error').length;
  const deferredCount = items.filter((it) => it.status === 'deferred').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-3xl border border-[#DADCE0] bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#DADCE0] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1A73E8] text-white">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-['Google_Sans',sans-serif] text-base font-bold text-[#202124]">
                Carga Masiva de Grabaciones
              </h2>
              <p className="text-xs text-[#5F6368]">
                Procesador con optimizador Web Audio 16kHz y control de concurrencia
              </p>
            </div>
          </div>

          <button
            id="btn-close-upload-modal"
            onClick={onClose}
            className="rounded-full p-2 text-[#5F6368] hover:bg-[#F1F3F4]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Concurrency & Optimizer Configuration Bar */}
          <div className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-4 sm:grid-cols-2">
            {/* Concurrency Control */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#202124]">Concurrencia Simultánea:</span>
                <span className="rounded-full bg-[#1A73E8] px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  {concurrency} llamadas a la vez
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={concurrency}
                disabled={isProcessing}
                onChange={(e) => setConcurrency(Number(e.target.value))}
                className="w-full cursor-pointer accent-[#1A73E8]"
              />
              <span className="text-[10px] text-[#5F6368]">
                Protege contra límites de cuota (TPM/RPM) en Gemini API.
              </span>
            </div>

            {/* Audio Optimizer Switch */}
            <div className="flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#202124]">
                  <Zap className="h-4 w-4 text-[#FBBC05]" />
                  <span>Optimizador en Navegador</span>
                </div>
                <input
                  type="checkbox"
                  checked={optimizeAudio}
                  disabled={isProcessing}
                  onChange={(e) => setOptimizeAudio(e.target.checked)}
                  className="h-4 w-4 rounded-sm border-[#DADCE0] text-[#1A73E8] focus:ring-[#1A73E8]"
                />
              </div>
              <p className="mt-1 text-[10px] text-[#5F6368]">
                Re-muestrea a 16kHz mono WAV vía Web Audio API antes del envío (Ahorro ~80% de ancho de banda).
              </p>
            </div>
          </div>

          {/* Context Fields */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-bold text-[#5F6368]">Asesor Asignado:</label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Ej. Camila Navarro V."
                className="mt-1 h-9 w-full rounded-xl border border-[#DADCE0] px-3 text-xs outline-none focus:border-[#1A73E8]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#5F6368]">Cola de Atención Claro:</label>
              <input
                type="text"
                value={queueName}
                onChange={(e) => setQueueName(e.target.value)}
                placeholder="Ej. Exclusivo Postpago Chile"
                className="mt-1 h-9 w-full rounded-xl border border-[#DADCE0] px-3 text-xs outline-none focus:border-[#1A73E8]"
              />
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#1A73E8]/40 bg-[#E8F0FE]/20 p-8 text-center transition hover:border-[#1A73E8] hover:bg-[#E8F0FE]/40 cursor-pointer"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F0FE] text-[#1A73E8]">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-bold text-[#202124]">
              Arrastra tus archivos de audio aquí o <span className="text-[#1A73E8] underline">explora</span>
            </p>
            <p className="mt-1 text-xs text-[#5F6368]">
              Formatos soportados: MP3, WAV, M4A, OGG, WEBM (Grabaciones de Contact Center)
            </p>
          </div>

          {/* Items List */}
          {items.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-bold text-[#202124]">
                  Archivos en Cola ({items.length})
                </span>
                {!isProcessing && (
                  <button
                    onClick={clearAll}
                    className="flex items-center gap-1 text-[11px] font-semibold text-[#EA4335] hover:underline"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Limpiar todo</span>
                  </button>
                )}
              </div>

              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
                {items.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center justify-between rounded-xl border border-[#DADCE0] bg-[#F8F9FA] p-3 text-xs"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileAudio className="h-5 w-5 shrink-0 text-[#1A73E8]" />
                      <div className="overflow-hidden">
                        <div className="truncate font-bold text-[#202124]">{it.file.name}</div>
                        <div className="text-[10px] text-[#5F6368]">
                          Original: {formatBytes(it.originalSize)}
                          {it.optimizedSize && (
                            <span className="ml-1 font-bold text-[#34A853]">
                              → Optimizado: {formatBytes(it.optimizedSize)} (
                              {Math.round((1 - it.optimizedSize / it.originalSize) * 100)}% ahorro)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                      {it.status === 'pending' && (
                        <span className="rounded-full bg-[#E8EAED] px-2 py-0.5 text-[10px] font-bold text-[#5F6368]">
                          En espera
                        </span>
                      )}
                      {it.status === 'optimizing' && (
                        <span className="flex items-center gap-1 rounded-full bg-[#FEF7E0] px-2 py-0.5 text-[10px] font-bold text-[#B06000]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>16kHz Mono</span>
                        </span>
                      )}
                      {it.status === 'processing' && (
                        <span className="flex items-center gap-1 rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-bold text-[#1A73E8]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Gemini AI</span>
                        </span>
                      )}
                      {it.status === 'completed' && (
                        <span className="flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-bold text-[#137333]">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Listo</span>
                        </span>
                      )}
                      {it.status === 'deferred' && (
                        <span className="flex items-center gap-1 rounded-full bg-[#FEF7E0] px-2 py-0.5 text-[10px] font-bold text-[#B06000]" title="429 rate limit - en cola">
                          <RefreshCw className="h-3 w-3" />
                          <span>Cola 429</span>
                        </span>
                      )}
                      {it.status === 'error' && (
                        <span className="flex items-center gap-1 rounded-full bg-[#FCE8E6] px-2 py-0.5 text-[10px] font-bold text-[#EA4335]" title={it.errorMessage}>
                          <AlertCircle className="h-3 w-3" />
                          <span>Error</span>
                        </span>
                      )}

                      {!isProcessing && it.status === 'pending' && (
                        <button
                          onClick={() => removeItem(it.id)}
                          className="text-[#5F6368] hover:text-[#EA4335]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#DADCE0] px-6 py-4">
          <div className="text-xs text-[#5F6368]">
            {completedCount > 0 && (
              <span className="font-bold text-[#137333]">
                {completedCount} procesadas con éxito.{' '}
              </span>
            )}
            {deferredCount > 0 && (
              <span className="font-bold text-[#B06000]">
                {deferredCount} derivadas a cola diferida 429.{' '}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-full border border-[#DADCE0] px-4 py-2 text-xs font-semibold text-[#3C4043] hover:bg-[#F8F9FA]"
            >
              Cerrar
            </button>

            <button
              id="btn-process-audios"
              onClick={startProcessing}
              disabled={isProcessing || items.length === 0}
              className="flex items-center gap-2 rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#1557B0] disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Auditando en Cascada...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Comenzar Auditoría ({items.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
