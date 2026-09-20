import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Award,
  Headphones,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, UserRole } from '../types';
import { fetchAllProfiles, updateUserProfileRole } from '../services/supabaseService';

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const { profile: currentProfile } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadProfiles = async () => {
    setLoading(true);
    setFeedback(null);
    const { data, error } = await fetchAllProfiles();
    if (error) {
      setFeedback({ type: 'error', message: `Error al cargar usuarios: ${error.message}` });
    } else {
      setProfiles(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadProfiles();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    setUpdatingId(userId);
    setFeedback(null);

    const { success, error } = await updateUserProfileRole(userId, newRole);

    if (error) {
      setFeedback({ type: 'error', message: `No se pudo actualizar el rol: ${error.message}` });
    } else {
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, role: newRole } : p))
      );
      setFeedback({
        type: 'success',
        message: 'Rol de usuario actualizado exitosamente en Supabase.'
      });
    }
    setUpdatingId(null);
  };

  const handleAgentIdChange = async (userId: string, newAgentId: string) => {
    setUpdatingId(userId);
    const { error } = await updateUserProfileRole(userId, profiles.find((p) => p.id === userId)?.role || 'agent', {
      agent_id: newAgentId.trim()
    });
    if (!error) {
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, agent_id: newAgentId.trim() } : p))
      );
    }
    setUpdatingId(null);
  };

  const filteredProfiles = profiles.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.full_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.agent_id?.toLowerCase().includes(q)
    );
  });

  const getRoleStyle = (role: UserRole) => {
    switch (role) {
      case 'super_admin':
        return {
          badge: 'bg-[#FEEFC3] text-[#B06000] border-[#FDD663]',
          icon: ShieldCheck,
          label: 'Super Admin'
        };
      case 'supervisor':
        return {
          badge: 'bg-[#E8F0FE] text-[#1A73E8] border-[#AECBFA]',
          icon: Users,
          label: 'Supervisor'
        };
      case 'qa_auditor':
        return {
          badge: 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]',
          icon: Award,
          label: 'Auditor QA'
        };
      case 'agent':
      default:
        return {
          badge: 'bg-[#F1F3F4] text-[#3C4043] border-[#DADCE0]',
          icon: Headphones,
          label: 'Asesor'
        };
    }
  };

  return (
    <div
      id="user-mgmt-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="user-mgmt-modal-container"
        className="relative flex flex-col w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#DADCE0] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#F1F3F4] bg-[#F8F9FA] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B192C] text-white shadow-xs">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#202124]">
                  Gestión de Usuarios y Asignación de Roles
                </h3>
                <span className="rounded-full bg-[#E8F0FE] border border-[#AECBFA] px-2.5 py-0.5 text-[10px] font-bold text-[#1A73E8]">
                  Control de Administrador
                </span>
              </div>
              <p className="text-xs text-[#5F6368]">
                Los usuarios crean sus credenciales; como Administrador asignas y controlas sus permisos operativos.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#5F6368] hover:bg-[#E8EAED] hover:text-[#202124] transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`flex items-center gap-2 border-b px-6 py-2.5 text-xs font-medium ${
              feedback.type === 'success'
                ? 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]'
                : 'bg-[#FCE8E6] text-[#C5221F] border-[#FAD2CF]'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Toolbar: Search + Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F1F3F4] px-6 py-3 bg-white">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#80868B]" />
            <input
              type="text"
              placeholder="Buscar por nombre, correo o ID de asesor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#DADCE0] bg-[#F8F9FA] py-1.5 pl-9 pr-3 text-xs text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#1A73E8]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#5F6368]">
              Total usuarios: <strong className="text-[#202124]">{profiles.length}</strong>
            </span>
            <button
              onClick={loadProfiles}
              disabled={loading}
              className="flex items-center gap-1 rounded-lg border border-[#DADCE0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#3C4043] shadow-2xs hover:bg-[#F8F9FA] transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* User Table / List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && profiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-[#5F6368]">
              <Loader2 className="h-8 w-8 animate-spin text-[#1A73E8]" />
              <p className="mt-2 text-xs font-medium">Cargando lista de usuarios desde Supabase...</p>
            </div>
          ) : filteredProfiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#DADCE0] p-8 text-center text-[#5F6368]">
              <Users className="mx-auto h-8 w-8 text-[#BDC1C6]" />
              <p className="mt-2 text-xs font-semibold text-[#3C4043]">No se encontraron usuarios</p>
              <p className="text-[11px] text-[#80868B]">
                {search ? 'Intenta con otro término de búsqueda.' : 'Aún no hay usuarios registrados en la base de datos.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F1F3F4] rounded-xl border border-[#DADCE0] bg-white">
              {filteredProfiles.map((user) => {
                const style = getRoleStyle(user.role);
                const Icon = style.icon;
                const isSelf = currentProfile?.id === user.id;

                return (
                  <div
                    key={user.id}
                    className="flex flex-col gap-3 p-3.5 transition hover:bg-[#F8F9FA] sm:flex-row sm:items-center sm:justify-between"
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0B192C] text-xs font-bold text-white shadow-xs">
                        {(user.full_name || user.email || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#202124]">
                            {user.full_name || 'Sin nombre'}
                          </span>
                          {isSelf && (
                            <span className="rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[9px] font-bold text-[#1A73E8]">
                              Tú
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#5F6368]">{user.email}</div>
                      </div>
                    </div>

                    {/* Role Selector & Agent ID */}
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {/* Asignación de Rol */}
                      <div className="flex items-center gap-1.5">
                        <label className="text-[11px] font-medium text-[#5F6368]">Rol:</label>
                        <select
                          value={user.role}
                          disabled={updatingId === user.id}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                          className={`rounded-lg border py-1 px-2 text-xs font-bold transition focus:outline-hidden ${
                            style.badge
                          }`}
                        >
                          <option value="super_admin">Super Administrador</option>
                          <option value="supervisor">Supervisor / Team Leader</option>
                          <option value="qa_auditor">Auditor QA</option>
                          <option value="agent">Asesor / Agente</option>
                        </select>
                      </div>

                      {/* ID Asesor (opcional) */}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          placeholder="ID Asesor"
                          defaultValue={user.agent_id || ''}
                          onBlur={(e) => {
                            if (e.target.value !== (user.agent_id || '')) {
                              handleAgentIdChange(user.id, e.target.value);
                            }
                          }}
                          className="w-24 rounded-lg border border-[#DADCE0] bg-white py-1 px-2 text-[11px] text-[#202124] placeholder-[#80868B] focus:border-[#1A73E8] focus:outline-hidden"
                          title="Código o ID de Asesor"
                        />
                      </div>

                      {updatingId === user.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-[#1A73E8]" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#F1F3F4] bg-[#F8F9FA] px-6 py-3 text-xs text-[#5F6368]">
          <div className="flex items-center gap-1.5">
            <UserCheck className="h-4 w-4 text-[#137333]" />
            <span>Los cambios de rol se aplican instantáneamente en Supabase.</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-[#0B192C] px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#1E293B] transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
