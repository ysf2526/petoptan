import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/database.types';
import { parseErrorMessage } from '@/utils/errors';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updatePassword: (newPass: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
      }
    } catch (err) {
      console.error('Profil yükleme hatası:', err);
    }
  };

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    // Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, pass: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) {
        return { success: false, error: parseErrorMessage(error) };
      }

      if (data.user) {
        // Audit log login action
        await supabase.from('audit_logs').insert({
          owner_id: data.user.id,
          action: 'LOGIN',
          entity_type: 'auth',
          details: { email: data.user.email, timestamp: new Date().toISOString() },
        });
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: parseErrorMessage(err) };
    }
  };

  const logout = async () => {
    if (user) {
      try {
        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'LOGOUT',
          entity_type: 'auth',
          details: { email: user.email, timestamp: new Date().toISOString() },
        });
      } catch (e) {
        // ignore log error on logout
      }
    }
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  const updatePassword = async (newPass: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPass,
      });

      if (error) {
        return { success: false, error: parseErrorMessage(error) };
      }

      if (user) {
        await supabase.from('audit_logs').insert({
          owner_id: user.id,
          action: 'PASSWORD_CHANGE',
          entity_type: 'auth',
          details: { timestamp: new Date().toISOString() },
        });
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: parseErrorMessage(err) };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        login,
        logout,
        updatePassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
