import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { CallsExplorerView } from './components/CallsExplorerView';
import { CallDetailView } from './components/CallDetailView';
import { UploadModal } from './components/UploadModal';
import { DeferredQueueModal } from './components/DeferredQueueModal';
import { SheetsModal } from './components/SheetsModal';
import { CallRecord, UploadItem } from './types';
import { exportCallsToExcel, exportCallsToCSV, exportSingleCallReport } from './utils/exportUtils';
import { SpreadsheetInfo, appendCallsToSpreadsheet } from './services/sheetsService';
import { getAccessToken } from './services/googleAuth';

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
  const [deferredQueue, setDeferredQueue] = useState<UploadItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isRetryingQueue, setIsRetryingQueue] = useState<boolean>(false);

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

  // Sync connected sheet to local storage
  const handleUpdateConnectedSpreadsheet = (info: SpreadsheetInfo | null) => {
    setConnectedSpreadsheet(info);
    if (info) {
      localStorage.setItem('claro_connected_sheet', JSON.stringify(info));
    } else {
      localStorage.removeItem('claro_connected_sheet');
    }
  };

  const handleToggleAutoSync = (enabled: boolean) => {
    setAutoSyncSheets(enabled);
    localStorage.setItem('claro_autosync_sheets', JSON.stringify(enabled));
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

      // Auto-sync with connected Google Sheets database if enabled
      if (connectedSpreadsheet && autoSyncSheets) {
        try {
          const token = await getAccessToken();
          if (token) {
            await appendCallsToSpreadsheet(token, connectedSpreadsheet.id, newCalls);
          }
        } catch (err) {
          console.warn('Auto-sync to Google Sheets failed:', err);
        }
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
        activeCallsCount={calls.length}
        isOnline={true}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onOpenSheets={() => setSheetsModalOpen(true)}
        isSheetsConnected={!!connectedSpreadsheet}
        sheetsTitle={connectedSpreadsheet?.title}
      />

      {/* Main Container */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            if (tab === 'queue') {
              setQueueModalOpen(true);
            } else {
              setActiveTab(tab);
            }
          }}
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          onOpenUpload={() => setUploadModalOpen(true)}
          onOpenExport={handleExportFull}
          onOpenSheets={() => setSheetsModalOpen(true)}
          isSheetsConnected={!!connectedSpreadsheet}
          sheetsTitle={connectedSpreadsheet?.title}
          deferredCount={deferredQueue.length}
          totalCalls={calls.length}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {activeTab === 'dashboard' && (
              <DashboardView
                calls={calls}
                onSelectCall={handleSelectCall}
                onOpenUpload={() => setUploadModalOpen(true)}
              />
            )}

            {activeTab === 'explorer' && (
              <CallsExplorerView
                calls={calls}
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
              />
            )}
          </div>
        </main>
      </div>

      {/* Modals */}
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
      />
    </div>
  );
}
