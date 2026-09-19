'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  KeyRound,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset-password';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
}

export default function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const { isRecoveryMode, signIn, signUp, resetPasswordForEmail, updatePassword } = useAuth();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // If URL indicates password recovery, auto-switch to reset-password mode
  useEffect(() => {
    if (isRecoveryMode) {
      setMode('reset-password');
    } else if (initialMode) {
      setMode(initialMode);
    }
  }, [isRecoveryMode, initialMode, isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsLoading(true);

    try {
      if (mode === 'login') {
        if (!email.trim() || !password) {
          setErrorMsg('Please provide both email and password.');
          setIsLoading(false);
          return;
        }
        const { error } = await signIn(email, password);
        if (error) {
          setErrorMsg(error.message || 'Failed to sign in. Please check your credentials.');
        } else {
          onClose();
        }
      } else if (mode === 'signup') {
        if (!email.trim() || !password) {
          setErrorMsg('Please fill in all fields.');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('Password must be at least 6 characters long.');
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Passwords do not match.');
          setIsLoading(false);
          return;
        }
        const { data, error } = await signUp(email, password);
        if (error) {
          setErrorMsg(error.message || 'Failed to create account.');
        } else {
          if (data?.session) {
            setSuccessMsg('Account created successfully! Welcome to freeFlow.');
            setTimeout(() => onClose(), 1200);
          } else {
            setSuccessMsg(
              'Account created! If confirmation is required, please check your email, or sign in now.'
            );
            setTimeout(() => setMode('login'), 2000);
          }
        }
      } else if (mode === 'forgot') {
        if (!email.trim()) {
          setErrorMsg('Please enter your email address.');
          setIsLoading(false);
          return;
        }
        const { error } = await resetPasswordForEmail(email);
        if (error) {
          setErrorMsg(error.message || 'Failed to send password reset link.');
        } else {
          setSuccessMsg(
            'Password reset link has been dispatched to your email! Please check your inbox and click the link to choose a new password.'
          );
        }
      } else if (mode === 'reset-password') {
        if (!password) {
          setErrorMsg('Please enter a new password.');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setErrorMsg('Password must be at least 6 characters long.');
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setErrorMsg('Passwords do not match.');
          setIsLoading(false);
          return;
        }
        const { error } = await updatePassword(password);
        if (error) {
          setErrorMsg(error.message || 'Failed to update password.');
        } else {
          setSuccessMsg('Your password has been successfully updated! You are now logged in.');
          setTimeout(() => {
            onClose();
          }, 1500);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden transition-all z-10">
        {/* Header decoration */}
        <div className="h-2 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500" />

        <div className="p-6 sm:p-8 space-y-5">
          {/* Close Button & Logo */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
                <RefreshCw className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-indigo-900 via-indigo-700 to-violet-800 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                freeFlow
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {mode === 'login' && 'Sign In to freeFlow'}
              {mode === 'signup' && 'Create Your Account'}
              {mode === 'forgot' && 'Reset Password'}
              {mode === 'reset-password' && 'Set New Password'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {mode === 'login' && 'Access your habit automations, streaks, and telemetry logs.'}
              {mode === 'signup' && 'Create an account to track and automatically loop your Todoist habits.'}
              {mode === 'forgot' &&
                "Enter your registered email address and we'll dispatch a secure recovery link."}
              {mode === 'reset-password' &&
                'Choose a new strong password for your account.'}
            </p>
          </div>

          {/* Privacy Guarantee Note (Especially on Sign Up & Forgot) */}
          {(mode === 'signup' || mode === 'forgot') && (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[11px] flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <span>
                <strong>Privacy Guarantee:</strong> We only take your email to perform password resets and account recovery. We will never send marketing, spam, or promotional emails.
              </span>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Quick Dev/Test Account Pill */}
          {mode === 'login' && (
            <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs transition">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                    Dev Test Account
                  </p>
                  <p className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    dev@freeflow.dev
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmail('dev@freeflow.dev');
                  setPassword('freeflow2026');
                  setErrorMsg(null);
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] transition shrink-0 shadow-xs"
              >
                Fill Credentials
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field (for login, signup, forgot) */}
            {mode !== 'reset-password' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 transition"
                  />
                </div>
              </div>
            )}

            {/* Password Field (for login, signup, reset-password) */}
            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {mode === 'reset-password' ? 'New Password' : 'Password'}
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setSuccessMsg(null);
                        setMode('forgot');
                      }}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'reset-password' ? 'At least 6 characters' : '••••••••'}
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password (for signup, reset-password) */}
            {(mode === 'signup' || mode === 'reset-password') && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Confirm Password
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 transition"
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
            >
              {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {mode === 'login' && 'Sign In'}
              {mode === 'signup' && 'Create Account'}
              {mode === 'forgot' && 'Send Password Reset Link'}
              {mode === 'reset-password' && 'Update Password & Sign In'}
            </button>
          </form>

          {/* Mode Switchers */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login' && (
              <p>
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setMode('signup');
                  }}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Sign Up
                </button>
              </p>
            )}

            {mode === 'signup' && (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setMode('login');
                  }}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Sign In
                </button>
              </p>
            )}

            {mode === 'forgot' && (
              <p>
                Remember your password?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setMode('login');
                  }}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Back to Sign In
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
