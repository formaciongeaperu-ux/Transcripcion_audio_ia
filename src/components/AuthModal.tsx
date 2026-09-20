import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, signIn, signUp } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Status
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (tab === 'login') {
        const res = await signIn(email, password);
        if (res.error) {
          if (res.error.message.includes('Invalid login credentials')) {
            setErrorMessage('Correo o contraseña incorrectos. Verifica tus credenciales.');
          } else if (res.error.message.includes('Email not confirmed')) {
            setErrorMessage('El correo no estaba confirmado en Supabase. Ya fue validado en el sistema; por favor pulsa "Acceder a la Plataforma" nuevamente.');
          } else {
            setErrorMessage(res.error.message);
          }
        }
      } else {
        if (!fullName.trim()) {
          setErrorMessage('Por favor, ingresa tu nombre completo.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
          setLoading(false);
          return;
        }

        // El rol por defecto para nuevos usuarios es 'agent' (el Administrador asigna roles en el panel de gestión)
        const defaultRole: UserRole = 'agent';
        const res = await signUp(email, password, fullName, defaultRole);
        if (res.error) {
          if (res.error.message.includes('Database error saving new user')) {
            setErrorMessage('Error en Supabase: Ejecuta el script de actualización del trigger en el SQL Editor de Supabase (ver instrucciones en el chat).');
          } else {
            setErrorMessage(res.error.message);
          }
        } else {
          setSuccessMessage('¡Cuenta creada con éxito! Sesión iniciada como Asesor.');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuthModal();
      }}
    >
      <div
        id="auth-modal-container"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#DADCE0] bg-white shadow-2xl transition-all"
      >
        {/* Cabecera Superior */}
        <div className="border-b border-[#F1F3F4] bg-[#F8F9FA] px-6 py-5">
          <button
            onClick={closeAuthModal}
            className="absolute top-4 right-4 rounded-lg p-1.5 text-[#5F6368] hover:bg-[#E8EAED] hover:text-[#202124] transition"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B192C] text-white shadow-xs">
              <KeyRound className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#202124]">
                {tab === 'login' ? 'Iniciar Sesión en Claro QA' : 'Crear Cuenta de Acceso'}
              </h3>
              <p className="text-xs text-[#5F6368]">
                Plataforma de Speech Analytics & Calidad Operativa
              </p>
            </div>
          </div>

          {/* Selector de Pestañas */}
          <div className="mt-4 flex rounded-xl bg-[#E8EAED] p-1">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                tab === 'login'
                  ? 'bg-white text-[#202124] shadow-xs'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                tab === 'register'
                  ? 'bg-white text-[#202124] shadow-xs'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              Crear Cuenta
            </button>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-[#FCE8E6] p-3 text-xs font-medium text-[#C5221F] border border-[#FAD2CF]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2 rounded-xl bg-[#E6F4EA] p-3 text-xs font-medium text-[#137333] border border-[#CEEAD6]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Campo Nombre si es registro */}
          {tab === 'register' && (
            <div>
              <label className="mb-1 block text-xs font-bold text-[#202124]">
                Nombre y Apellido
              </label>
              <div className="relative">
                <User className="absolute top-2.5 left-3 h-4 w-4 text-[#80868B]" />
                <input
                  type="text"
                  required
                  placeholder="Ej: Marcelo Morales"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border border-[#DADCE0] bg-white py-2 pl-9 pr-3 text-xs text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:outline-hidden focus:ring-1 focus:ring-[#1A73E8]"
                />
              </div>
            </div>
          )}

          {/* Campo Email */}
          <div>
            <label className="mb-1 block text-xs font-bold text-[#202124]">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail className="absolute top-2.5 left-3 h-4 w-4 text-[#80868B]" />
              <input
                type="email"
                required
                placeholder="ejemplo@claro-qa.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[#DADCE0] bg-white py-2 pl-9 pr-3 text-xs text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:outline-hidden focus:ring-1 focus:ring-[#1A73E8]"
              />
            </div>
          </div>

          {/* Campo Contraseña */}
          <div>
            <label className="mb-1 block text-xs font-bold text-[#202124]">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute top-2.5 left-3 h-4 w-4 text-[#80868B]" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#DADCE0] bg-white py-2 pl-9 pr-3 text-xs text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:outline-hidden focus:ring-1 focus:ring-[#1A73E8]"
              />
            </div>
          </div>

          {/* Botón Principal */}
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B192C] py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#1E293B] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Procesando...</span>
              </>
            ) : (
              <span>{tab === 'login' ? 'Acceder a la Plataforma' : 'Completar Registro'}</span>
            )}
          </button>
        </form>

        {/* Footer Informativo */}
        <div className="border-t border-[#F1F3F4] bg-[#F8F9FA] px-6 py-3 text-center text-[11px] text-[#80868B]">
          Conexión activa con base de datos en nube Supabase (PostgreSQL RLS)
        </div>
      </div>
    </div>
  );
};
