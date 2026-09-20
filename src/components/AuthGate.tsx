import React, { useState } from 'react';
import {
  Lock,
  Mail,
  User,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  BarChart3,
  Mic
} from 'lucide-react';
import { GeaLogo } from './GeaLogo';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

interface AuthGateProps {
  initialTab?: 'login' | 'register';
}

export const AuthGate: React.FC<AuthGateProps> = ({ initialTab = 'register' }) => {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Status
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
            setErrorMessage('El correo no ha sido confirmado. Contacta a tu Administrador o desactiva "Confirm email" en Supabase.');
          } else {
            setErrorMessage(res.error.message);
          }
        }
      } else {
        if (!fullName.trim()) {
          setErrorMessage('Por favor ingresa tu Nombre y Apellido.');
          setLoading(false);
          return;
        }

        // Roles son asignados por el Super Administrador; las cuentas nuevas inician como 'agent'
        const defaultRole: UserRole = 'agent';
        const res = await signUp(email, password, fullName, defaultRole);

        if (res.error) {
          if (res.error.message.includes('Database error saving new user')) {
            setErrorMessage('Error al guardar en Supabase. Verifica el trigger en tu base de datos.');
          } else {
            setErrorMessage(res.error.message);
          }
        } else {
          setSuccessMessage('¡Cuenta creada con éxito! Iniciando sesión...');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error inesperado al conectar con Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="auth-gate-screen"
      className="relative flex min-h-screen w-full items-center justify-center bg-[#F8F9FA] px-4 py-12 text-[#202124]"
    >
      {/* Decorative top accent bar */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#DA291C] via-[#0B192C] to-[#1A73E8]" />

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex items-center justify-center gap-3">
            <GeaLogo size={44} className="h-11 w-auto shrink-0 drop-shadow-xs" />
            <div className="flex flex-col items-start justify-center text-left">
              <span className="font-['Google_Sans',sans-serif] text-2xl font-black tracking-tight leading-none">
                <span className="text-[#072242]">GEA </span>
                <span className="text-[#0072CE]">PERÚ</span>
              </span>
              <span className="mt-1 text-[11px] font-extrabold uppercase tracking-widest text-[#0072CE]">
                WORKFORCE
              </span>
            </div>
          </div>
          <h1 className="text-lg font-extrabold text-[#202124] tracking-tight">
            Plataforma de Speech Analytics & Calidad
          </h1>
          <p className="mt-1 text-xs text-[#5F6368]">
            Auditoría de llamadas con IA, transcripción y calibración operativa
          </p>
        </div>

        {/* Auth Card */}
        <div
          id="auth-card-container"
          className="overflow-hidden rounded-3xl border border-[#DADCE0] bg-white p-6 sm:p-8 shadow-xl"
        >
          {/* Tabs: Iniciar Sesión / Crear Cuenta */}
          <div className="mb-6 flex rounded-xl bg-[#F1F3F4] p-1">
            <button
              id="tab-login-btn"
              type="button"
              onClick={() => {
                setTab('login');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                tab === 'login'
                  ? 'bg-white text-[#202124] shadow-xs'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              id="tab-register-btn"
              type="button"
              onClick={() => {
                setTab('register');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                tab === 'register'
                  ? 'bg-white text-[#202124] shadow-xs'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              Crear Cuenta
            </button>
          </div>

          {/* Alert Messages */}
          {errorMessage && (
            <div
              id="auth-error-alert"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#FAD2CF] bg-[#FCE8E6] p-3 text-xs text-[#C5221F] animate-in fade-in"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 font-medium">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div
              id="auth-success-alert"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-[#CEEAD6] bg-[#E6F4EA] p-3 text-xs text-[#137333] animate-in fade-in"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 font-medium">{successMessage}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'register' && (
              <div>
                <label className="mb-1 block text-xs font-bold text-[#202124]">
                  Nombre y Apellido
                </label>
                <div className="relative">
                  <User className="absolute top-2.5 left-3 h-4 w-4 text-[#80868B]" />
                  <input
                    id="input-fullname"
                    type="text"
                    required
                    placeholder="Ej: Ismael García"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl border border-[#DADCE0] bg-white py-2 pl-9 pr-3 text-xs text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:outline-hidden focus:ring-1 focus:ring-[#1A73E8]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold text-[#202124]">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute top-2.5 left-3 h-4 w-4 text-[#80868B]" />
                <input
                  id="input-email"
                  type="email"
                  required
                  placeholder="usuario@claro.cl o gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#DADCE0] bg-white py-2 pl-9 pr-3 text-xs text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:outline-hidden focus:ring-1 focus:ring-[#1A73E8]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-[#202124]">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute top-2.5 left-3 h-4 w-4 text-[#80868B]" />
                <input
                  id="input-password"
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#DADCE0] bg-white py-2 pl-9 pr-3 text-xs text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:outline-hidden focus:ring-1 focus:ring-[#1A73E8]"
                />
              </div>
            </div>

            {/* Note on Role assignment */}
            {tab === 'register' && (
              <div className="rounded-xl border border-[#DADCE0] bg-[#F8F9FA] p-3 text-xs text-[#5F6368]">
                <div className="flex items-center gap-1.5 font-bold text-[#202124]">
                  <ShieldCheck className="h-4 w-4 text-[#1A73E8]" />
                  <span>Asignación de Roles por Administrador</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#5F6368]">
                  Tu cuenta se creará con perfil inicial de <strong>Asesor</strong>. El Administrador te asignará el rol de <strong>Supervisor</strong> o <strong>Auditor QA</strong> desde el panel interno.
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B192C] py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#1E293B] active:scale-98 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Procesando acceso...</span>
                </>
              ) : tab === 'login' ? (
                <span>Acceder a la Plataforma</span>
              ) : (
                <span>Completar Registro</span>
              )}
            </button>

            {tab === 'register' ? (
              <p className="mt-3 text-center text-xs text-[#5F6368]">
                ¿Ya tienes una cuenta registrada?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="font-bold text-[#1A73E8] hover:underline"
                >
                  Inicia Sesión aquí
                </button>
              </p>
            ) : (
              <p className="mt-3 text-center text-xs text-[#5F6368]">
                ¿Eres un nuevo colaborador?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setTab('register');
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="font-bold text-[#1A73E8] hover:underline"
                >
                  Crear Cuenta / Registrarse
                </button>
              </p>
            )}
          </form>

          {/* Quick Feature Pillars */}
          <div className="mt-6 border-t border-[#F1F3F4] pt-4 text-[11px] text-[#5F6368]">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col items-center">
                <Mic className="h-4 w-4 text-[#DA291C]" />
                <span className="mt-1 font-semibold text-[#202124]">Speech AI</span>
                <span className="text-[10px] text-[#80868B]">Transcripción</span>
              </div>
              <div className="flex flex-col items-center">
                <BarChart3 className="h-4 w-4 text-[#1A73E8]" />
                <span className="mt-1 font-semibold text-[#202124]">Calidad QA</span>
                <span className="text-[10px] text-[#80868B]">Rúbrica & tNPS</span>
              </div>
              <div className="flex flex-col items-center">
                <Database className="h-4 w-4 text-[#137333]" />
                <span className="mt-1 font-semibold text-[#202124]">Nube Segura</span>
                <span className="text-[10px] text-[#80868B]">Supabase RLS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-[#80868B]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#137333]" />
          <span>Acceso cifrado y protegido por autenticación segura</span>
        </div>
      </div>
    </div>
  );
};
