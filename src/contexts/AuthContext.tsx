import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, UserProfile } from '../lib/supabase';
import { UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role?: UserRole,
    agentId?: string
  ) => Promise<{ error: AuthError | Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Cargar perfil desde la tabla profiles
  const fetchProfile = async (userId: string, userEmail?: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        // Si no existe fila en profiles, creamos un perfil base
        console.warn('[Auth] Perfil no encontrado, creando por defecto:', error.message);
        const fallbackProfile: UserProfile = {
          id: userId,
          email: userEmail || '',
          full_name: (userEmail || '').split('@')[0] || 'Auditor QA',
          role: 'qa_auditor',
          campana: 'Claro Chile'
        };
        await supabase.from('profiles').upsert(fallbackProfile);
        return fallbackProfile;
      }

      return data as UserProfile;
    } catch (err) {
      console.error('[Auth] Error al obtener perfil:', err);
      return null;
    }
  };

  useEffect(() => {
    // 1. Obtener sesión activa inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        const prof = await fetchProfile(session.user.id, session.user.email);
        setProfile(prof);
      }
      setLoading(false);
    });

    // 2. Escuchar cambios de estado (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        if (newSession?.user) {
          const prof = await fetchProfile(newSession.user.id, newSession.user.email);
          setProfile(prof);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) return { error };

      if (data.user) {
        const prof = await fetchProfile(data.user.id, data.user.email);
        setProfile(prof);
      }

      closeAuthModal();
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole = 'qa_auditor',
    agentId?: string
  ) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            role,
            agent_id: agentId?.trim() || null,
            campana: 'Claro Chile'
          }
        }
      });

      if (error) return { error };

      if (data.user) {
        // Asegurar que la fila del perfil tenga el rol y nombre solicitado
        const newProfile: UserProfile = {
          id: data.user.id,
          email: data.user.email || email,
          full_name: fullName.trim(),
          role,
          agent_id: agentId?.trim(),
          campana: 'Claro Chile'
        };

        await supabase.from('profiles').upsert(newProfile);
        setProfile(newProfile);
      }

      closeAuthModal();
      return { error: null };
    } catch (err: any) {
      return { error: err };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user) {
      const p = await fetchProfile(user.id, user.email);
      setProfile(p);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        isAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        signIn,
        signUp,
        signOut,
        refreshProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};
