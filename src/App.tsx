import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { CallsExplorerView } from './components/CallsExplorerView';
import { CallDetailView } from './components/CallDetailView';
import { CalibrationView } from './components/CalibrationView';
import { UploadModal } from './components/UploadModal';
import { DeferredQueueModal } from './components/DeferredQueueModal';
import { SheetsModal } from './components/SheetsModal';
import { CommandPalette } from './components/CommandPalette';
import { AuthModal } from './components/AuthModal';
import { AuthGate } from './components/AuthGate';
import { UserManagementModal } from './components/UserManagementModal';
import { Loader2 } from 'lucide-react';
import { CallRecord, UploadItem } from './types';
import { exportCallsToExcel, exportCallsToCSV, exportSingleCallReport } from './utils/exportUtils';
import { SpreadsheetInfo, appendCallsToSpreadsheet } from './services/sheetsService';
import { DriveFolderInfo, uploadAudioToDrive } from './services/driveService';
import { getAccessToken } from './services/googleAuth';
import { fetchCallRecordsFromSupabase, saveCallRecordToSupabase } from './services/supabaseService';
import { analyzeUploadedCall } from './services/analyzeCall';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  const [calls, setCalls] = useState<CallRecord[]>(() => {
    try {
      const saved = localStorage.getItem('claro_speech_calls_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error al recuperar llamadas guardadas', e);
    }
    return [];
  });

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(() => {
    return calls.length > 0 ? calls[0] : null;
  });
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [uploadModalOpen, setUploadModalOpen] = useState<boolean>(false);
  const [queueModalOpen, setQueueModalOpen] = useState<boolean>(false);
  const [sheetsModalOpen, setSheetsModalOpen] = useState<boolean>(false);
  const [userManagementOpen, setUserManagementOpen] = useState<boolean>(false);
  const [deferredQueue, setDeferredQueue] = useState<UploadItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isRetryingQueue, setIsRetryingQueue] = useState<boolean>(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [selectedCohort, setSelectedCohort] = useState<string>('all');
  const [dbNotice, setDbNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const unsavedRef = React.useRef<Map<string, CallRecord>>(new Map());

  const { user, loading: authLoading } = useAuth();

  const applyDatabaseRows = React.useCallback((rows: CallRecord[]) => {
    const ids = new Set(rows.map((row) => row.id));
    const pending: CallRecord[] = [];
    unsavedRef.current.forEach((row) => {
      if (!ids.has(row.id)) pending.push(row);
    });
    setCalls([...pending, ...rows]);
  }, []);

  const reloadFromDatabase = React.useCallback(async () => {
    const { data, error } = await fetchCallRecordsFromSupabase();
    if (error || !data) {
      setDbNotice({ tone: 'error', text: error?.message || 'No se pudo leer call_records.' });
      return null;
    }
    applyDatabaseRows(data);
    return data;
  }, [applyDatabaseRows]);

  // La base es la fuente del listado. Lo que solo está en este navegador se reintenta una vez.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      unsavedRef.current.clear();
      setCalls([]);
      setSelectedCall(null);
      setDbNotice(null);
      return;
    }

    let isMounted = true;
    (async () => {
      const first = await fetchCallRecordsFromSupabase();
      if (!isMounted) return;
      if (first.error || !first.data) {
        setDbNotice({ tone: 'error', text: first.error?.message || 'No se pudo leer call_records.' });
        return;
      }

      const present = new Set(first.data.map((row) => row.id));
      let local: CallRecord[] = [];
      try {
        const raw = localStorage.getItem('claro_speech_calls_v2');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) local = parsed;
        }
      } catch {}

      const missing = local.filter((row) => row?.id && !present.has(row.id));
      const failures: string[] = [];
      for (const call of missing) {
        const saved = await saveCallRecordToSupabase(call, user.id);
        if (!isMounted) return;
        if (saved.success) unsavedRef.current.delete(call.id);
        else {
          unsavedRef.current.set(call.id, call);
          failures.push(saved.error?.message || 'error desconocido');
        }
      }

      const second = missing.length > 0 ? await fetchCallRecordsFromSupabase() : first;
      if (!isMounted) return;
      applyDatabaseRows(second.data || first.data);
      if (failures.length > 0) {
        setDbNotice({
          tone: 'error',
          text: `Hay ${failures.length} auditoría(s) de este navegador que la base rechazó: ${failures[0]}`
        });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading, applyDatabaseRows]);

  useEffect(() => {
    if (!user) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadFromDatabase();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, reloadFromDatabase]);

  // Global keyboard shortcut Ctrl+K / Cmd+K to open Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter calls by selected OJT cohort / campaign
  const visibleCalls = React.useMemo(() => {
    if (selectedCohort === 'all') return calls;
    if (selectedCohort === 'nido_movil') {
      return calls.filter((c) => /móvil|postpago|prepago/i.test(c.cola_atencion) || /postpago/i.test(c.motivo_nombre));
    }
    if (selectedCohort === 'nido_fibra') {
      return calls.filter((c) => /hogar|fibra|fija|internet/i.test(c.cola_atencion) || /fibra|hfc/i.test(c.motivo_nombre));
    }
    if (selectedCohort === 'nido_retenciones') {
      return calls.filter((c) => /retencion|baja|churn/i.test(c.cola_atencion) || /baja|renuncia|portabilidad/i.test(c.motivo_nombre));
    }
    if (selectedCohort === 'graduados') {
      return calls.filter((c) => c.diagnostico_ojt?.nivel_madurez === 'LISTO_PRODUCCION');
    }
    return calls;
  }, [calls, selectedCohort]);

  // Google Sheets state
  const [connectedSpreadsheet, setConnectedSpreadsheet] = useState<SpreadsheetInfo | null>(() => {
    try {
      const saved = localStorage.getItem('claro_connected_sheet');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [autoSyncSheets, setAutoSyncSheets] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('claro_autosync_sheets');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Google Drive state
  const [connectedDriveFolder, setConnectedDriveFolder] = useState<DriveFolderInfo | null>(() => {
    try {
      const saved = localStorage.getItem('claro_drive_folder_info');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [autoUploadDrive, setAutoUploadDrive] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('claro_autoupload_drive');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Sync connected sheet to local storage
  const handleUpdateConnectedSpreadsheet = (info: SpreadsheetInfo | null) => {
    setConnectedSpreadsheet(info);
    if (info) {
      localStorage.setItem('claro_connected_sheet', JSON.stringify(info));
    } else {
      localStorage.removeItem('claro_connected_sheet');
    }
  };

  const handleUpdateConnectedDriveFolder = (info: DriveFolderInfo | null) => {
    setConnectedDriveFolder(info);
    if (info) {
      localStorage.setItem('claro_drive_folder_info', JSON.stringify(info));
    } else {
      localStorage.removeItem('claro_drive_folder_info');
    }
  };

  const handleToggleAutoSync = (enabled: boolean) => {
    setAutoSyncSheets(enabled);
    localStorage.setItem('claro_autosync_sheets', JSON.stringify(enabled));
  };

  const handleToggleAutoUploadDrive = (enabled: boolean) => {
    setAutoUploadDrive(enabled);
    localStorage.setItem('claro_autoupload_drive', JSON.stringify(enabled));
  };

  // Sync calls to local storage. No escribir mientras la sesión todavía se está leyendo:
  // en ese momento user es null y borrar el listado eliminaría auditorías que aún no entraron a la base.
  useEffect(() => {
    if (authLoading) return;
    try {
      const serializable = calls.map((c) => {
        const { audioFile, ...rest } = c;
        return rest;
      });
      localStorage.setItem('claro_speech_calls_v2', JSON.stringify(serializable));
    } catch (e) {
      console.warn('Error al persistir llamadas en localStorage', e);
    }
  }, [calls, authLoading]);

  // Keep selectedCall in sync if calls change
  useEffect(() => {
    if (calls.length > 0) {
      if (!selectedCall || !calls.some((c) => c.id === selectedCall.id)) {
        setSelectedCall(calls[0]);
      }
    } else {
      setSelectedCall(null);
    }
  }, [calls, selectedCall]);

  // Handle call selection
  const handleSelectCall = (call: CallRecord) => {
    setSelectedCall(call);
    setActiveTab('audit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle new calls processed via upload modal
  const handleCallsProcessed = async (newCalls: CallRecord[]): Promise<{ failedIds: string[]; message: string }> => {
    if (newCalls.length === 0) return { failedIds: [], message: '' };
    setCalls((prev) => [...newCalls, ...prev]);
    setSelectedCall(newCalls[0]);
    setActiveTab('audit');

    // Auto-sync with connected Google Sheets & Drive if enabled
      if (connectedSpreadsheet && autoSyncSheets) {
        try {
          const token = await getAccessToken();
          if (token) {
            // Optional: Auto-upload audio to Google Drive if configured
            if (autoUploadDrive) {
              for (const call of newCalls) {
                if (call.audioFile) {
                  try {
                    const uploaded = await uploadAudioToDrive(
                      token,
                      call.audioFile,
                      call.file_name || `audio-${call.codigo_llamada}.wav`,
                      connectedDriveFolder?.id
                    );
                    if (uploaded?.webViewLink) {
                      call.audio_url = uploaded.webViewLink;
                    }
                  } catch (driveErr) {
                    console.warn('Audio drive upload skipped:', driveErr);
                  }
                }
              }
            }
            await appendCallsToSpreadsheet(token, connectedSpreadsheet.id, newCalls);
          }
        } catch (err) {
          console.warn('Auto-sync to Google Sheets failed:', err);
        }
      }

      const failedIds: string[] = [];
      let firstError = '';
      for (const call of newCalls) {
        const saved = await saveCallRecordToSupabase(call, user?.id);
        if (saved.success) {
          unsavedRef.current.delete(call.id);
        } else {
          unsavedRef.current.set(call.id, call);
          failedIds.push(call.id);
          if (!firstError) firstError = saved.error?.message || 'error desconocido';
        }
      }

      await reloadFromDatabase();
      if (failedIds.length > 0) {
        const message = `No se guardó en la base: ${firstError}`;
        setDbNotice({ tone: 'error', text: message });
        return { failedIds, message };
      }

      const message = newCalls.length === 1
        ? 'La auditoría quedó guardada en la base y en el listado.'
        : `Quedaron ${newCalls.length} auditorías guardadas en la base y en el listado.`;
      setDbNotice({ tone: 'ok', text: message });
      return { failedIds: [], message };
  };

  // Import calls from Google Sheets
  const handleImportCallsFromSheets = (importedCalls: CallRecord[]) => {
    setCalls((prev) => {
      // Merge avoiding duplicate IDs/codes
      const existingCodes = new Set(prev.map((c) => c.codigo_llamada));
      const filteredNew = importedCalls.filter((c) => !existingCodes.has(c.codigo_llamada));
      return [...filteredNew, ...prev];
    });
  };

  // Add to deferred queue (429 rate limit)
  const handleAddToDeferredQueue = (item: UploadItem) => {
    setDeferredQueue((prev) => [...prev, item]);
  };

  const handleRemoveDeferredItem = (id: string) => {
    setDeferredQueue((prev) => prev.filter((it) => it.id !== id));
  };

  const handleClearDeferredQueue = () => {
    setDeferredQueue([]);
  };

  // Retry item in deferred queue
  const handleRetryItem = async (item: UploadItem) => {
    setIsRetryingQueue(true);
    try {
      const response = await analyzeUploadedCall(item.file, {
        fileName: item.file.name,
        agentName: item.agentName || 'Asesor Claro',
        agentId: item.agentId || '',
        queue: 'Exclusivo Postpago Chile',
      });
      const resData = response.data;
      if (response.ok && resData.success && resData.data) {
        const newCall = resData.data as CallRecord;
        newCall.audio_url = URL.createObjectURL(item.file);
        newCall.audioFile = item.file;
        newCall.file_name = item.file.name;
        await handleCallsProcessed([newCall]);
        handleRemoveDeferredItem(item.id);
      }
    } catch {
      // error handled
    } finally {
      setIsRetryingQueue(false);
    }
  };

  // Retry all deferred items
  const handleRetryAll = async () => {
    setIsRetryingQueue(true);
    try {
      for (const item of deferredQueue) {
        await handleRetryItem(item);
      }
    } finally {
      setIsRetryingQueue(false);
    }
  };

  // Export handlers
  const handleExportFull = () => {
    exportCallsToExcel(calls);
  };

  const handleExportFiltered = (filtered: CallRecord[]) => {
    exportCallsToExcel(filtered, 'Auditorias_Claro_Filtradas.xlsx');
  };

  const handleExportSingle = (call: CallRecord) => {
    exportSingleCallReport(call);
  };

  // Pantalla de carga mientras verifica sesión en Supabase
  if (authLoading) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#F8F9FA] text-[#202124]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#DA291C]" />
          <span className="text-xs font-semibold text-[#5F6368]">Verificando sesión segura en Claro QA...</span>
        </div>
      </div>
    );
  }

  // Si no ha iniciado sesión, protege los datos operativos y muestra el formulario de acceso/registro
  if (!user) {
    return <AuthGate />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FA] text-[#202124] antialiased">
      {/* Top Google Cloud Header */}
      <Header
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onOpenUpload={() => setUploadModalOpen(true)}
        onOpenQueue={() => setQueueModalOpen(true)}
        onExport={handleExportFull}
        deferredCount={deferredQueue.length}
        activeCallsCount={visibleCalls.length}
        isOnline={true}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onOpenSheets={() => setSheetsModalOpen(true)}
        isSheetsConnected={!!connectedSpreadsheet}
        sheetsTitle={connectedSpreadsheet?.title}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        selectedCohort={selectedCohort}
        setSelectedCohort={setSelectedCohort}
      />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab === 'queue') {
              setQueueModalOpen(true);
            } else if (tab === 'users') {
              setUserManagementOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          onOpenUpload={() => setUploadModalOpen(true)}
          onOpenExport={handleExportFull}
          onOpenSheets={() => setSheetsModalOpen(true)}
          onOpenUserManagement={() => setUserManagementOpen(true)}
          isSheetsConnected={!!connectedSpreadsheet}
          sheetsTitle={connectedSpreadsheet?.title}
          deferredCount={deferredQueue.length}
          totalCalls={visibleCalls.length}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5">
          <div className="mx-auto max-w-[1600px] w-full">
            {dbNotice && (
              <div
                className={`mb-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
                  dbNotice.tone === 'error'
                    ? 'border-[#F6AEA9] bg-[#FCE8E6] text-[#C5221F]'
                    : 'border-[#CEEAD6] bg-[#E6F4EA] text-[#137333]'
                }`}
              >
                <p>{dbNotice.text}</p>
                <button
                  type="button"
                  onClick={() => setDbNotice(null)}
                  className="shrink-0 text-xs font-bold uppercase"
                >
                  Cerrar
                </button>
              </div>
            )}
            {activeTab === 'dashboard' && (
              <DashboardView
                calls={visibleCalls}
                onSelectCall={handleSelectCall}
                onOpenUpload={() => setUploadModalOpen(true)}
              />
            )}

            {activeTab === 'explorer' && (
              <CallsExplorerView
                calls={visibleCalls}
                onSelectCall={handleSelectCall}
                onOpenUpload={() => setUploadModalOpen(true)}
                onExportFiltered={handleExportFiltered}
              />
            )}

            {activeTab === 'audit' && (
              <CallDetailView
                call={selectedCall}
                onBackToList={() => setActiveTab('explorer')}
                onExportCall={handleExportSingle}
                onOpenUpload={() => setUploadModalOpen(true)}
                calls={visibleCalls}
                onSelectCall={handleSelectCall}
              />
            )}

            {activeTab === 'calibration' && (
              <CalibrationView
                calls={calls}
                onNotify={(msg, type) => {
                  console.log(`[Calibration Notification] [${type || 'info'}]: ${msg}`);
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        calls={calls}
        onSelectCall={handleSelectCall}
        onOpenUpload={() => setUploadModalOpen(true)}
        onExport={handleExportFull}
        onOpenSheets={() => setSheetsModalOpen(true)}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onCallsProcessed={handleCallsProcessed}
        onAddToDeferredQueue={handleAddToDeferredQueue}
      />

      <DeferredQueueModal
        isOpen={queueModalOpen}
        onClose={() => setQueueModalOpen(false)}
        deferredItems={deferredQueue}
        onRemoveItem={handleRemoveDeferredItem}
        onClearQueue={handleClearDeferredQueue}
        onRetryItem={handleRetryItem}
        onRetryAll={handleRetryAll}
        isRetrying={isRetryingQueue}
      />

      <SheetsModal
        isOpen={sheetsModalOpen}
        onClose={() => setSheetsModalOpen(false)}
        calls={calls}
        onImportCallsFromSheets={handleImportCallsFromSheets}
        connectedSpreadsheet={connectedSpreadsheet}
        onUpdateConnectedSpreadsheet={handleUpdateConnectedSpreadsheet}
        autoSyncEnabled={autoSyncSheets}
        onToggleAutoSync={handleToggleAutoSync}
        connectedDriveFolder={connectedDriveFolder}
        onUpdateConnectedDriveFolder={handleUpdateConnectedDriveFolder}
        autoUploadDrive={autoUploadDrive}
        onToggleAutoUploadDrive={handleToggleAutoUploadDrive}
      />

      <AuthModal />

      <UserManagementModal
        isOpen={userManagementOpen}
        onClose={() => setUserManagementOpen(false)}
      />
    </div>
  );
}
