import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { VaultUserRow } from '@card-vault/shared';

interface AuthState {
  user: User | null;
  session: Session | null;
  vaultUser: VaultUserRow | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    vaultUser: null,
    loading: true,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchVaultUser(session.user.id).then((vaultUser) => {
          setState({ user: session.user, session, vaultUser, loading: false });
        });
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchVaultUser(session.user.id).then((vaultUser) => {
          setState({ user: session.user, session, vaultUser, loading: false });
        });
      } else {
        setState({ user: null, session: null, vaultUser: null, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  return { ...state, login, logout };
}

async function fetchVaultUser(userId: string): Promise<VaultUserRow | null> {
  const { data, error } = await supabase
    .from('vault_users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data;
}
