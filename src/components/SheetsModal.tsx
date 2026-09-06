import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Plus,
  AlertCircle,
  LogOut,
  DownloadCloud,
  UploadCloud,
  Database,
  Link2
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  googleSignIn,
  logout,
  getAccessToken,
  initAuth
} from '../services/googleAuth';
import {
  createAuditSpreadsheet,
  checkSpreadsheetAccess,
  appendCallsToSpreadsheet,
  readCallsFromSpreadsheet,
  extractSpreadsheetId,
  SpreadsheetInfo
} from '../services/sheetsService';
import { CallRecord } from '../types';

interface SheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  calls: CallRecord[];
  onImportCallsFromSheets: (importedCalls: CallRecord[]) => void;
  connectedSpreadsheet: SpreadsheetInfo | null;
  onUpdateConnectedSpreadsheet: (info: SpreadsheetInfo | null) => void;
  autoSyncEnabled: boolean;
  onToggleAutoSync: (enabled: boolean) => void;
}

export const SheetsModal: React.FC<SheetsModalProps> = ({
  isOpen,
  onClose,
  calls,
  onImportCallsFromSheets,
  connectedSpreadsheet,
  onUpdateConnectedSpreadsheet,
  autoSyncEnabled,
  onToggleAutoSync
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [customSheetInput, setCustomSheetInput] = useState('');
  const [showInputExisting, setShowInputExisting] = useState(false);

  // Initialize Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setCurrentUser(user);
      },
      () => {
        setCurrentUser(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setStatusMessage(null);
    try {
      const result = await googleSignIn();
      if (result?.user) {
        setCurrentUser(result.user);
        setStatusMessage({
          type: 'success',
          text: `Conectado exitosamente como ${result.user.email}`
        });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error durante el inicio de sesión con Google.'
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    setCurrentUser(null);
    setStatusMessage({ type: 'info', text: 'Sesión de Google cerrada.' });
  };

  const handleCreateNewSheet = async () => {
    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Debes iniciar sesión con Google para crear la hoja en tu Google Drive.');
      }

      const newSheet = await createAuditSpreadsheet(
        token,
        'Claro QA - Base de Datos de Auditoría de Llamadas'
      );
      onUpdateConnectedSpreadsheet(newSheet);

      // If we already have local calls, sync them right away
      if (calls.length > 0) {
        const count = await appendCallsToSpreadsheet(token, newSheet.id, calls);
        setStatusMessage({
          type: 'success',
          text: `¡Base de datos creada en Google Sheets! Se sincronizaron ${count} llamada(s) existentes.`
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `¡Base de datos creada exitosamente en Google Sheets con pestaña "Auditorias_Llamadas"!`
        });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error al crear la hoja en Google Drive.'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleLinkExistingSheet = async () => {
    if (!customSheetInput.trim()) return;
    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Debes iniciar sesión con Google primero.');
      }
      const cleanId = extractSpreadsheetId(customSheetInput);
      const access = await checkSpreadsheetAccess(token, cleanId);

      const info: SpreadsheetInfo = {
        id: cleanId,
        url: `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
        title: access.title
      };

      onUpdateConnectedSpreadsheet(info);
      setShowInputExisting(false);
      setCustomSheetInput('');
      setStatusMessage({
        type: 'success',
        text: `Hoja "${access.title}" vinculada como base de datos.`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'No se pudo verificar el acceso a la hoja proporcionada.'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSyncLocalCallsToSheets = async () => {
    if (!connectedSpreadsheet) return;
    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Sesión expirada o no iniciada. Por favor vuelve a conectar tu cuenta.');
      }

      const count = await appendCallsToSpreadsheet(token, connectedSpreadsheet.id, calls);
      setStatusMessage({
        type: 'success',
        text: `Se enviaron exitosamente ${count} registro(s) a Google Sheets.`
      });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error al guardar llamadas en Google Sheets.'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleImportFromSheets = async () => {
    if (!connectedSpreadsheet) return;
    setIsActionLoading(true);
    setStatusMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Sesión expirada o no iniciada. Por favor vuelve a conectar tu cuenta.');
      }

      const imported = await readCallsFromSpreadsheet(token, connectedSpreadsheet.id);
      if (imported.length === 0) {
        setStatusMessage({
          type: 'info',
          text: 'No se encontraron registros de llamadas en la hoja de cálculo todavía.'
        });
      } else {
        onImportCallsFromSheets(imported);
        setStatusMessage({
          type: 'success',
          text: `Se cargaron ${imported.length} llamada(s) desde Google Sheets a la plataforma.`
        });
      }
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error al leer datos desde Google Sheets.'
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-xl rounded-3xl border border-[#DADCE0] bg-white p-6 shadow-2xl transition-all sm:p-7">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F1F3F4] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F4EA] text-[#137333]">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-['Google_Sans',sans-serif] text-lg font-bold text-[#202124]">
                Base de Datos en Google Sheets
              </h2>
              <p className="text-xs text-[#5F6368]">
                Almacena y sincroniza todas tus auditorías y métricas directamente en tus hojas de cálculo
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#202124]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-2xl p-3 text-xs font-medium ${
              statusMessage.type === 'success'
                ? 'bg-[#E6F4EA] text-[#137333]'
                : statusMessage.type === 'error'
                ? 'bg-[#FCE8E6] text-[#C5221F]'
                : 'bg-[#E8F0FE] text-[#1A73E8]'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Step 1: Authentication */}
        <div className="mt-5 space-y-4">
          {!currentUser ? (
            <div className="rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-5 text-center">
              <p className="text-xs font-medium text-[#3C4043]">
                Conecta tu cuenta de Google para habilitar el guardado automático de auditorías en Google Sheets.
              </p>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="flex items-center gap-3 rounded-full border border-[#DADCE0] bg-white px-5 py-2.5 shadow-xs transition hover:bg-[#F1F3F4] hover:shadow disabled:opacity-50"
                >
                  <div className="h-5 w-5">
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                  </div>
                  <span className="font-['Google_Sans',sans-serif] text-xs font-semibold text-[#3C4043]">
                    {isSigningIn ? 'Conectando con Google...' : 'Sign in with Google'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-2xl border border-[#CEEAD6] bg-[#F6FBF7] p-3.5">
              <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || ''}
                    className="h-9 w-9 rounded-full border border-[#CEEAD6]"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#137333] text-xs font-bold text-white">
                    {currentUser.email?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#202124]">
                      {currentUser.displayName || 'Usuario Google'}
                    </span>
                    <span className="rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[10px] font-bold text-[#137333]">
                      Conectado
                    </span>
                  </div>
                  <span className="text-[11px] text-[#5F6368]">{currentUser.email}</span>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#5F6368] transition hover:bg-[#E8EAED] hover:text-[#202124]"
                title="Cerrar sesión de Google"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Desconectar</span>
              </button>
            </div>
          )}

          {/* Step 2: Database Sheet Selection */}
          {currentUser && (
            <div className="space-y-3">
              {connectedSpreadsheet ? (
                <div className="rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-xs">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E6F4EA] text-[#137333]">
                        <Database className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#137333]">
                          Hoja Conectada como Base de Datos
                        </span>
                        <h4 className="font-['Google_Sans',sans-serif] text-sm font-bold text-[#202124]">
                          {connectedSpreadsheet.title}
                        </h4>
                      </div>
                    </div>

                    <a
                      href={connectedSpreadsheet.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-full border border-[#DADCE0] px-3 py-1 text-xs font-semibold text-[#1A73E8] transition hover:bg-[#E8F0FE]"
                    >
                      <span>Abrir en Google Sheets</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1F3F4] pt-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoSyncEnabled}
                        onChange={(e) => onToggleAutoSync(e.target.checked)}
                        className="h-4 w-4 rounded text-[#1A73E8] focus:ring-[#1A73E8]"
                      />
                      <span className="text-xs font-medium text-[#3C4043]">
                        Auto-guardar cada nueva llamada analizada en Sheets
                      </span>
                    </label>

                    <button
                      onClick={() => onUpdateConnectedSpreadsheet(null)}
                      className="text-[11px] font-medium text-[#EA4335] hover:underline"
                    >
                      Cambiar Hoja
                    </button>
                  </div>

                  {/* Sync Action Buttons */}
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      onClick={handleSyncLocalCallsToSheets}
                      disabled={isActionLoading || calls.length === 0}
                      className="flex items-center justify-center gap-2 rounded-xl bg-[#137333] px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#0D652D] disabled:opacity-50"
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                      <span>Guardar llamadas actuales ({calls.length})</span>
                    </button>

                    <button
                      onClick={handleImportFromSheets}
                      disabled={isActionLoading}
                      className="flex items-center justify-center gap-2 rounded-xl border border-[#DADCE0] bg-white px-3 py-2 text-xs font-bold text-[#3C4043] transition hover:bg-[#F8F9FA] disabled:opacity-50"
                    >
                      <DownloadCloud className="h-3.5 w-3.5 text-[#1A73E8]" />
                      <span>Cargar registros desde Sheets</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-2xl border border-[#DADCE0] bg-white p-4 shadow-xs">
                  <span className="text-xs font-bold text-[#202124]">Configurar Base de Datos</span>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleCreateNewSheet}
                      disabled={isActionLoading}
                      className="flex flex-col items-start gap-1 rounded-2xl border border-[#CEEAD6] bg-[#F6FBF7] p-3 text-left transition hover:bg-[#E6F4EA] disabled:opacity-50"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[#137333]">
                        <Plus className="h-4 w-4" />
                        <span className="text-xs">Crear Nueva Hoja</span>
                      </div>
                      <p className="text-[11px] text-[#5F6368]">
                        Crea automáticamente "Claro QA - Base de Datos" en tu Google Drive con los encabezados listos.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowInputExisting(!showInputExisting)}
                      className="flex flex-col items-start gap-1 rounded-2xl border border-[#DADCE0] bg-[#F8F9FA] p-3 text-left transition hover:bg-[#F1F3F4]"
                    >
                      <div className="flex items-center gap-1.5 font-bold text-[#3C4043]">
                        <Link2 className="h-4 w-4 text-[#1A73E8]" />
                        <span className="text-xs">Vincular Existente</span>
                      </div>
                      <p className="text-[11px] text-[#5F6368]">
                        Usa una hoja de cálculo que ya tengas en Google Sheets ingresando su URL o ID.
                      </p>
                    </button>
                  </div>

                  {showInputExisting && (
                    <div className="mt-3 flex gap-2 rounded-2xl border border-[#E8F0FE] bg-[#F8F9FA] p-3">
                      <input
                        type="text"
                        placeholder="Pega la URL o el ID de la hoja de Google Sheets..."
                        value={customSheetInput}
                        onChange={(e) => setCustomSheetInput(e.target.value)}
                        className="flex-1 rounded-xl border border-[#DADCE0] bg-white px-3 py-1.5 text-xs text-[#202124] outline-none focus:border-[#1A73E8]"
                      />
                      <button
                        onClick={handleLinkExistingSheet}
                        disabled={isActionLoading || !customSheetInput.trim()}
                        className="rounded-xl bg-[#1A73E8] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#1557B0] disabled:opacity-50"
                      >
                        Vincular
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end border-t border-[#F1F3F4] pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#1A73E8] px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#1557B0]"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
