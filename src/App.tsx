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
import { fetchCallRecordsFromSupabase, saveCallRecordToSupabase, bulkSaveCallRecordsToSupabase } from './services/supabaseService';
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

  const { user, loading: authLoading } = useAuth();

  // Cargar llamadas desde Supabase al iniciar sesión y limpiar memoria al cerrar sesión
  useEffect(() => {
    if (!user) {
      setCalls([]);
      setSelectedCall(null);
      return;
    }

    let isMounted = true;
    fetchCallRecordsFromSupabase().then(({ data, error }) => {
      if (!isMounted) return;
      if (data && data.length > 0) {
        setCalls((prev) => {
          const dbIds = new Set(data.map((d) => d.id));
          const localOnly = prev.filter((p) => !dbIds.has(p.id));
          // Si hay llamadas locales que aún no están en la nube, sincronizarlas
          if (localOnly.length > 0) {
            bulkSaveCallRecordsToSupabase(localOnly, user.id).catch(console.warn);
          }
          return [...data, ...localOnly];
        });
      } else if (data && data.length === 0) {
        // Si la base en Supabase está vacía pero hay historial en el navegador, subirlo
        const saved = localStorage.getItem('claro_speech_calls_v2');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              bulkSaveCallRecordsToSupabase(parsed, user.id).catch(console.warn);
            }
          } catch {}
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, [user]);

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

  // Sync calls to local storage
  useEffect(() => {
    try {
      const serializable = calls.map((c) => {
        const { audioFile, ...rest } = c;
        return rest;
      });
      localStorage.setItem('claro_speech_calls_v2', JSON.stringify(serializable));
    } catch (e) {
      console.warn('Error al persistir llamadas en localStorage', e);
    }
  }, [calls]);

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
  const handleCallsProcessed = async (newCalls: CallRecord[]) => {
    setCalls((prev) => [...newCalls, ...prev]);
    if (newCalls.length > 0) {
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

      // Guardar automáticamente en Supabase Cloud Database
      for (const call of newCalls) {
        saveCallRecordToSupabase(call, user?.id).catch((err) =>
          console.warn('[Supabase] Error al persistir llamada:', err)
        );
      }
    }
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
      const response = await fetch('/api/analyze-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: item.file.name,
          agentName: 'Asesor Claro',
          queue: 'Exclusivo Postpago Chile',
        }),
      });
      const resData = await response.json();
      if (resData.success && resData.data) {
        const newCall = resData.data as CallRecord;
        newCall.audio_url = URL.createObjectURL(item.file);
        newCall.audioFile = item.file;
        newCall.file_name = item.file.name;
        setCalls((prev) => [newCall, ...prev]);
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
