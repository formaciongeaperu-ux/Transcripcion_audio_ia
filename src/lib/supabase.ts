import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://givdlqjfnctxvarpybht.supabase.co';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_nNtMZhvN0uPRz4QzVnUyPQ_Rs4yyI0D';

import { UserRole } from '../types';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  agent_id?: string;
  campana?: string;
  avatar_url?: string;
  created_at?: string;
}
