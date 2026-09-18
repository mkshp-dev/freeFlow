'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabaseClient } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isRecoveryMode: boolean;
  setIsRecoveryMode: (val: boolean) => void;
  signUp: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signIn: (email: string, password: string) => Promise<{ data: any; error: any }>;
  signOut: () => Promise<{ error: any }>;
  resetPasswordForEmail: (email: string) => Promise<{ data: any; error: any }>;
  updatePassword: (password: string) => Promise<{ data: any; error: any }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    // 1. Get initial session
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // 2. Check URL hash for recovery mode tokens
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) {
        setIsRecoveryMode(true);
      }
    }

    // 3. Listen for auth state changes
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);

      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Sign up with email & password
  const signUp = async (email: string, password: string) => {
    try {
      const res = await supabaseClient.auth.signUp({
        email: email.trim(),
        password,
      });
      if (res.data?.user && res.data?.session) {
        setUser(res.data.user);
        setSession(res.data.session);
      }
      return res;
    } catch (err: any) {
      return { data: null, error: err };
    }
  };

  // Sign in with email & password
  const signIn = async (email: string, password: string) => {
    try {
      const res = await supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (res.data?.user && res.data?.session) {
        setUser(res.data.user);
        setSession(res.data.session);
      }
      return res;
    } catch (err: any) {
      return { data: null, error: err };
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      const res = await supabaseClient.auth.signOut();
      setUser(null);
      setSession(null);
      return res;
    } catch (err: any) {
      return { error: err };
    }
  };

  // Send password reset email
  const resetPasswordForEmail = async (email: string) => {
    try {
      const redirectUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}`
          : 'https://freeflow.mkshp.dev';

      const res = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });
      return res;
    } catch (err: any) {
      return { data: null, error: err };
    }
  };

  // Update password after recovery
  const updatePassword = async (password: string) => {
    try {
      const res = await supabaseClient.auth.updateUser({
        password,
      });
      if (res.data?.user) {
        setIsRecoveryMode(false);
        // Clear hash from URL
        if (typeof window !== 'undefined' && window.location.hash) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      }
      return res;
    } catch (err: any) {
      return { data: null, error: err };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isRecoveryMode,
        setIsRecoveryMode,
        signUp,
        signIn,
        signOut,
        resetPasswordForEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
