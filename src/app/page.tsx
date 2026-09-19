'use client';

import React, { useState, useEffect } from 'react';
import {
  Flame,
  CheckCircle2,
  RefreshCw,
  Plus,
  Play,
  Terminal,
  Settings,
  GitFork,
  Radio,
  ExternalLink,
  Trash2,
  Check,
  AlertCircle,
  Database,
  ArrowRight,
  ShieldCheck,
  Zap,
  Copy,
  Sun,
  Moon,
  LayoutDashboard,
  ListTodo,
  TrendingUp,
  Activity,
  BarChart3,
  Layers,
  Sparkles,
  Menu,
  X,
  Clock,
  Award,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  LogIn,
  LogOut,
  KeyRound,
  Calendar,
} from 'lucide-react';
import { Task, Workflow, WebhookLog, DelayMode, WorkflowDelayConfig } from '@/types';
import { useAuth } from '@/context/AuthContext';
import AuthModal, { AuthMode } from '@/components/AuthModal';

export default function Dashboard() {
  const { user, isRecoveryMode, signOut } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('login');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks' | 'workflows' | 'logs' | 'simulator' | 'settings'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [stats, setStats] = useState({
    totalTasks: 0,
    totalCompletions: 0,
    highestStreak: 0,
    webhookCount: 0,
    workflowsCount: 1,
    hasDbTables: true,
  });

  // Settings state
  const [settings, setSettings] = useState<{
    hasToken: boolean;
    isValid: boolean;
    maskedToken: string | null;
    hasClientId?: boolean;
    clientId?: string;
    hasClientSecret?: boolean;
    maskedClientSecret?: string | null;
    isOAuthActive?: boolean;
    webhookEndpoint?: string;
    oauthRedirectEndpoint?: string;
  }>({
    hasToken: false,
    isValid: false,
    maskedToken: null,
  });
  const [tokenInput, setTokenInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [isSavingToken, setIsSavingToken] = useState(false);
  const [isSavingOAuth, setIsSavingOAuth] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [tokenFeedback, setTokenFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [oauthFeedback, setOauthFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [oauthBanner, setOauthBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('1');
  const [newTaskWorkflow, setNewTaskWorkflow] = useState('repeated_tasks');
  const [newDelayMode, setNewDelayMode] = useState<DelayMode>('immediately');
  const [newDelayHours, setNewDelayHours] = useState('1.5');
  const [newDelayDays, setNewDelayDays] = useState('4');
  const [newDelayTime, setNewDelayTime] = useState('09:00');
  const [newDelayDateTime, setNewDelayDateTime] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [recreatingTaskId, setRecreatingTaskId] = useState<string | null>(null);

  // Simulator state
  const [simTask, setSimTask] = useState<string>('');
  const [simCloseInTodoist, setSimCloseInTodoist] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load all initial data
  const loadData = async (overrideUserId?: unknown) => {
    try {
      const currentUserId = typeof overrideUserId === 'string' ? overrideUserId : user?.id;
      const tasksUrl = currentUserId ? `/api/tasks?userId=${encodeURIComponent(currentUserId)}` : '/api/tasks';

      const [tasksRes, logsRes, statsRes, settingsRes] = await Promise.all([
        fetch(tasksUrl),
        fetch('/api/webhooks/logs'),
        fetch('/api/stats'),
        fetch('/api/settings'),
      ]);

      const tasksData = await tasksRes.json();
      const logsData = await logsRes.json();
      const statsData = await statsRes.json();
      const settingsData = await settingsRes.json();

      if (tasksData.tasks) setTasks(tasksData.tasks);
      if (logsData.logs) setWebhookLogs(logsData.logs);
      if (statsData) setStats(statsData);
      if (settingsData) {
        setSettings(settingsData);
        if (settingsData.clientId) {
          setClientIdInput(settingsData.clientId);
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Listen for recovery mode from URL hash
  useEffect(() => {
    if (isRecoveryMode) {
      setAuthModalMode('reset-password');
      setAuthModalOpen(true);
    }
  }, [isRecoveryMode]);

  // Re-fetch tasks whenever the active user changes
  useEffect(() => {
    loadData(user?.id);
  }, [user?.id]);

  useEffect(() => {
    loadData();

    // Check URL parameters for OAuth return or exchange
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const oauthParam = params.get('oauth');
      const codeParam = params.get('code');
      const errorParam = params.get('error');

      if (oauthParam === 'success') {
        setOauthBanner({
          type: 'success',
          message: '🎉 Todoist OAuth App successfully linked and installed! Real-time webhooks are now active.',
        });
        window.history.replaceState({}, '', window.location.pathname);
      } else if (oauthParam === 'error') {
        setOauthBanner({
          type: 'error',
          message: `OAuth Link Error: ${errorParam || 'Failed to complete authorization'}`,
        });
        window.history.replaceState({}, '', window.location.pathname);
      } else if (codeParam) {
        // Automatically exchange code with the backend
        setOauthBanner({
          type: 'info',
          message: 'Exchanging authorization code with Todoist...',
        });
        fetch('/api/auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: codeParam,
            redirectUri: `${window.location.origin}/api/auth/callback`,
          }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) {
              setOauthBanner({
                type: 'success',
                message: '🎉 Todoist OAuth App linked successfully! Real-time webhooks are now active.',
              });
              loadData();
            } else {
              setOauthBanner({
                type: 'error',
                message: `OAuth Exchange failed: ${res.error || 'Unknown error'}`,
              });
            }
          })
          .catch((err) => {
            setOauthBanner({
              type: 'error',
              message: `OAuth Exchange failed: ${err.message}`,
            });
          })
          .finally(() => {
            window.history.replaceState({}, '', window.location.pathname);
          });
      }
    }

    // Initialize theme from document element class
    if (typeof window !== 'undefined') {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'dark' : 'light');
    }

    // Auto-refresh webhook logs and stats every 8 seconds
    const interval = setInterval(() => {
      loadData();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Theme toggle helper
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', nextTheme);
    } catch (_) {}
  };

  // Helper to format Delay configuration for display
  const getDelayLabel = (task: Task) => {
    const delay = task.workflow_config?.delay;
    if (!delay || delay.mode === 'immediately') {
      return 'Immediately';
    }
    if (delay.mode === 'after_hours') {
      return `After ${delay.hours ?? 1}h`;
    }
    if (delay.mode === 'tomorrow_at') {
      return `Tomorrow at ${delay.time || '09:00'}`;
    }
    if (delay.mode === 'after_days_at') {
      const days = delay.days ?? 4;
      const dayStr = days === 1 ? '1 day' : `${days} days`;
      return `+${dayStr} at ${delay.time || '17:00'}`;
    }
    if (delay.mode === 'exact_datetime') {
      return `At ${delay.datetime}`;
    }
    return 'Immediately';
  };

  // Force immediate recreation of a delayed task
  const handleRecreateNow = async (task: Task) => {
    setRecreatingTaskId(task.id);
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          action: 'recreate_now',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        loadData();
      } else {
        alert(data.error || 'Failed to recreate task now');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRecreatingTaskId(null);
    }
  };

  // Handle task creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    setIsCreatingTask(true);
    try {
      let delayConfig: WorkflowDelayConfig | undefined;
      if (newTaskWorkflow === 'repeated_tasks' || newTaskWorkflow === 'immediate_recreate') {
        delayConfig = { mode: newDelayMode };
        if (newDelayMode === 'after_hours') {
          delayConfig.hours = parseFloat(newDelayHours) || 1;
        } else if (newDelayMode === 'tomorrow_at') {
          delayConfig.time = newDelayTime || '09:00';
        } else if (newDelayMode === 'after_days_at') {
          delayConfig.days = parseInt(newDelayDays, 10) || 4;
          delayConfig.time = newDelayTime || '17:00';
        } else if (newDelayMode === 'exact_datetime') {
          delayConfig.datetime = newDelayDateTime.trim();
        }
      }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDesc,
          priority: parseInt(newTaskPriority, 10),
          workflow_type: newTaskWorkflow,
          workflow_config: {
            delay: delayConfig,
          },
          sync_with_todoist: true,
          user_id: user?.id || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNewTaskTitle('');
        setNewTaskDesc('');
        setNewDelayMode('immediately');
        setNewDelayHours('1.5');
        setNewDelayDays('4');
        setNewDelayTime('09:00');
        setNewDelayDateTime('');
        loadData();
      } else {
        alert(data.error || 'Failed to create task');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Trigger task completion workflow (via simulator or real API)
  const handleTriggerComplete = async (task: Task) => {
    try {
      const res = await fetch('/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          todoistId: task.todoist_id,
          title: task.title,
          closeInTodoist: Boolean(settings.hasToken),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        loadData();
      } else {
        alert(data.error || 'Trigger failed');
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Save Todoist Token
  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsSavingToken(true);
    setTokenFeedback(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json();

      if (res.ok) {
        setTokenFeedback({ type: 'success', message: data.message });
        setTokenInput('');
        loadData();
      } else {
        setTokenFeedback({ type: 'error', message: data.error || 'Failed to verify token' });
      }
    } catch (err: any) {
      setTokenFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSavingToken(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Save OAuth Settings
  const handleSaveOAuthSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingOAuth(true);
    setOauthFeedback(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientIdInput.trim() || undefined,
          clientSecret: clientSecretInput.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setOauthFeedback({ type: 'success', message: 'OAuth App credentials saved successfully.' });
        loadData();
      } else {
        setOauthFeedback({ type: 'error', message: data.error || 'Failed to save OAuth settings' });
      }
    } catch (err: any) {
      setOauthFeedback({ type: 'error', message: err.message });
    } finally {
      setIsSavingOAuth(false);
    }
  };

  // Initiate OAuth Authorization flow
  const handleAuthorizeOAuth = async () => {
    if (!clientIdInput.trim()) {
      setOauthFeedback({
        type: 'error',
        message: 'Please enter your Todoist Client ID before authorizing.',
      });
      return;
    }

    setIsAuthorizing(true);
    setOauthFeedback(null);

    try {
      // Save client ID (and secret if provided) first
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientIdInput.trim(),
          clientSecret: clientSecretInput.trim() || undefined,
        }),
      });

      const redirectUri = `${window.location.origin}/api/auth/callback`;
      const authUrl = `https://todoist.com/oauth/authorize?client_id=${encodeURIComponent(
        clientIdInput.trim()
      )}&scope=data:read_write,data:delete&state=freeflow&redirect_uri=${encodeURIComponent(
        redirectUri
      )}`;

      window.location.href = authUrl;
    } catch (err: any) {
      setOauthFeedback({
        type: 'error',
        message: `Failed to initiate authorization: ${err.message}`,
      });
      setIsAuthorizing(false);
    }
  };

  // Run Simulator
  const handleRunSimulator = async () => {
    if (!simTask) {
      alert('Please select or enter a task to simulate.');
      return;
    }

    setIsSimulating(true);
    setSimResult(null);

    const selectedObj = tasks.find(t => t.id === simTask);
    const todoistId = selectedObj?.todoist_id || 'sim-' + Date.now();
    const title = selectedObj ? selectedObj.title : simTask;

    try {
      const res = await fetch('/api/webhooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: selectedObj?.id,
          todoistId,
          title,
          closeInTodoist: simCloseInTodoist && settings.hasToken,
        }),
      });
      const data = await res.json();
      setSimResult(data);
      loadData();
    } catch (err: any) {
      setSimResult({ error: err.message });
    } finally {
      setIsSimulating(false);
    }
  };

  // Computed analytics for Dashboard
  const topHabit = tasks.length > 0
    ? [...tasks].sort((a, b) => (b.streak_count || 0) - (a.streak_count || 0))[0]
    : null;
  const sortedTasks = [...tasks].sort((a, b) => (b.streak_count || 0) - (a.streak_count || 0));
  const avgStreak = tasks.length > 0 ? Math.round(stats.totalCompletions / tasks.length) : 0;
  const successCount = webhookLogs.filter((l) => l.processed_status === 'success').length;
  const successRate = webhookLogs.length > 0 ? Math.round((successCount / webhookLogs.length) * 100) : 100;
  const autoRecreateCount = tasks.filter((t) => t.workflow_type === 'repeated_tasks' || t.workflow_type === 'immediate_recreate').length;
  const recentLogs = webhookLogs.slice(0, 5);

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
      badgeColor: 'default',
    },
    {
      id: 'tasks',
      label: 'Habits & Tasks',
      icon: ListTodo,
      badge: tasks.length > 0 ? tasks.length.toString() : null,
      badgeColor: 'default',
    },
    {
      id: 'workflows',
      label: 'Workflows',
      icon: GitFork,
      badge: '1 active',
      badgeColor: 'default',
    },
    {
      id: 'logs',
      label: 'Webhook Logs',
      icon: Terminal,
      badge: webhookLogs.length > 0 ? webhookLogs.length.toString() : null,
      badgeColor: 'default',
    },
    {
      id: 'simulator',
      label: 'Webhook Simulator',
      icon: Zap,
      badge: null,
      badgeColor: 'default',
    },
    {
      id: 'settings',
      label: 'Settings & Sync',
      icon: Settings,
      badge: !settings.isOAuthActive ? 'Setup' : null,
      badgeColor: !settings.isOAuthActive ? 'amber' : 'default',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex transition-colors duration-200">
      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between shadow-2xl z-50">
            <div>
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
                    <RefreshCw className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <span className="font-bold text-base tracking-tight bg-gradient-to-r from-indigo-900 via-indigo-700 to-violet-800 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                      freeFlow
                    </span>
                    <span className="block text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                      Habit Engine
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="mt-5 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                        isActive
                          ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            item.badgeColor === 'amber'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Drawer Footer: User Profile & Health Indicators */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              {/* User Account Card */}
              {user ? (
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold uppercase shrink-0 shadow-xs">
                      {user.email?.charAt(0) || 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={user.email}>
                        {user.email}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Signed In
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      signOut();
                      setMobileMenuOpen(false);
                    }}
                    title="Sign Out"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Account
                    </span>
                    <span className="text-[10px] text-slate-400">Guest</span>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => {
                        setAuthModalMode('login');
                        setAuthModalOpen(true);
                        setMobileMenuOpen(false);
                      }}
                      className="flex-1 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        setAuthModalMode('signup');
                        setAuthModalOpen(true);
                        setMobileMenuOpen(false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                    >
                      Sign Up
                    </button>
                  </div>
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Database</span>
                  <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Supabase
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Todoist Webhook</span>
                  <span
                    className={`flex items-center gap-1 font-semibold ${
                      settings.isOAuthActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${settings.isOAuthActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    {settings.isOAuthActive ? 'Active' : 'Unlinked'}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between px-1">
                <span>v0.1.0 • Edge Runtime</span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Desktop Persistent Sidebar (Toggleable) */}
      <aside
        className={`hidden lg:flex lg:flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/70 backdrop-blur-xl shrink-0 sticky top-0 h-screen z-40 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden border-r-0 opacity-0 pointer-events-none'
        }`}
      >
        {/* Brand Area with Collapse Button */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-indigo-900 via-indigo-700 to-violet-800 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                freeFlow
              </span>
              <span className="block text-[10px] uppercase font-semibold tracking-wider text-slate-400">
                Habit Engine
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            title="Collapse sidebar"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Main Menu
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-600/15 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      item.badgeColor === 'amber'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer: User Account & Health Indicators */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {/* User Account Card */}
          {user ? (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold uppercase shrink-0 shadow-xs">
                    {user.email?.charAt(0) || 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={user.email}>
                      {user.email}
                    </p>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Signed In
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Sign Out"
                  className="p-1.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Account</span>
                </div>
                <span className="text-[10px] text-slate-400">Guest</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                Sign in to link habits and sync across devices.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    setAuthModalMode('login');
                    setAuthModalOpen(true);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition text-center shadow-xs"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthModalMode('signup');
                    setAuthModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold transition"
                >
                  Sign Up
                </button>
              </div>
            </div>
          )}

          {/* Engine Status Pill */}
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Database</span>
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Supabase
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Todoist Webhook</span>
              <span
                className={`flex items-center gap-1 font-semibold ${
                  settings.isOAuthActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${settings.isOAuthActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {settings.isOAuthActive ? 'Active' : 'Unlinked'}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between px-1">
            <span>v0.1.0 • Edge Runtime</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/50 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            {/* Sidebar toggle button (mobile drawer & desktop open/close) */}
            <button
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  setMobileMenuOpen(!mobileMenuOpen);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              aria-label="Toggle sidebar"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition flex items-center justify-center"
            >
              <span className="hidden lg:block">
                {sidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
              </span>
              <span className="lg:hidden">
                <Menu className="w-5 h-5" />
              </span>
            </button>

            {/* Brand logo when sidebar is closed on desktop */}
            {!sidebarOpen && (
              <div className="hidden lg:flex items-center gap-2.5 mr-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-sm">
                  <RefreshCw className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-sm tracking-tight bg-gradient-to-r from-indigo-900 via-indigo-700 to-violet-800 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                  freeFlow
                </span>
              </div>
            )}

            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white capitalize flex items-center gap-2">
                {activeTab === 'dashboard' && 'Command Dashboard'}
                {activeTab === 'tasks' && 'Habits & Task Streaks'}
                {activeTab === 'workflows' && 'Automation Workflows'}
                {activeTab === 'logs' && 'Webhook Telemetry Logs'}
                {activeTab === 'simulator' && 'Webhook Simulation Lab'}
                {activeTab === 'settings' && 'Settings & Todoist Sync'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Refresh Data Button */}
            <button
              onClick={loadData}
              title="Refresh data"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle theme"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 transition shadow-xs flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

            {/* Top Row User Auth */}
            {user ? (
              <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold uppercase shadow-sm">
                    {user.email?.charAt(0) || 'U'}
                  </div>
                  <span className="hidden md:inline text-xs font-medium text-slate-700 dark:text-slate-300 max-w-[130px] truncate" title={user.email}>
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Sign Out"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 dark:hover:bg-red-950/40 dark:hover:text-red-400 text-slate-500 dark:text-slate-400 transition flex items-center justify-center"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    setAuthModalMode('login');
                    setAuthModalOpen(true);
                  }}
                  className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
              </div>
            )}

            {/* Quick Action Simulator Button */}
            <button
              onClick={() => setActiveTab('simulator')}
              className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white items-center gap-1.5 transition shadow-sm"
            >
              <Zap className="w-3.5 h-3.5" />
              Simulate Webhook
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Global OAuth / Alert Banners */}
          {oauthBanner && (
            <div
              className={`p-4 rounded-xl border flex items-center justify-between text-xs transition shadow-sm ${
                oauthBanner.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : oauthBanner.type === 'info'
                  ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                  : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 shrink-0" />
                <span>{oauthBanner.message}</span>
              </div>
              <button
                onClick={() => setOauthBanner(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>
          )}

          {!settings.isOAuthActive && !oauthBanner && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200 shadow-sm">
              <div className="flex items-center gap-2.5">
                <Radio className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0 animate-pulse" />
                <span>
                  <strong>Action Required for Real-Time Sync:</strong> Todoist only delivers webhooks for accounts that have authorized the App.
                </span>
              </div>
              <button
                onClick={() => setActiveTab('settings')}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg shrink-0 transition shadow-sm"
              >
                Link App in Settings →
              </button>
            </div>
          )}

          {/* Database Notice if tables aren't created yet */}
          {!stats.hasDbTables && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-200 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-300">Supabase tables need to be created</p>
                  <p className="text-amber-300/80 mt-1">
                    Run the SQL migration script in your Supabase SQL Editor to enable full persistence and analytics.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('settings')}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/30 transition shrink-0"
              >
                View SQL Script
              </button>
            </div>
          )}

          {/* TAB 0: Comprehensive Dashboard */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Hero Welcome & Operational Banner */}
              <div className="relative overflow-hidden p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 text-white border border-indigo-500/20 shadow-xl shadow-indigo-950/30">
                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                      Habit Automation Command Center
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      Automate Your Habits with freeFlow
                    </h2>
                    <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                      Whenever you complete recurring habits in Todoist (mobile, desktop, or web), freeFlow catches the live webhook, updates your streak, and automatically creates the next iteration!
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
                    <button
                      onClick={() => setActiveTab('tasks')}
                      className="px-4 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-100 font-semibold text-xs flex items-center gap-2 shadow-lg transition"
                    >
                      <Plus className="w-4 h-4" />
                      Manage Habits
                    </button>
                    <button
                      onClick={() => setActiveTab('simulator')}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600/60 hover:bg-indigo-600 text-white border border-indigo-400/30 font-semibold text-xs flex items-center gap-2 transition"
                    >
                      <Zap className="w-4 h-4" />
                      Test Simulator
                    </button>
                  </div>
                </div>
              </div>

              {/* KPI Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Tracked Habits */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tracked Habits</span>
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{tasks.length}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{autoRecreateCount} repeated tasks</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Todoist synced</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{tasks.filter(t => t.todoist_id).length} linked</span>
                  </div>
                </div>

                {/* Card 2: Total Completions */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Habit Loops Completed</span>
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Flame className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.totalCompletions}</span>
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">streaks accumulated</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Avg streak / habit</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{avgStreak} completions</span>
                  </div>
                </div>

                {/* Card 3: Top Performing Streak */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Record Streak</span>
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Award className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.highestStreak}</span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[120px]" title={topHabit?.title}>
                      {topHabit?.title || 'None yet'}
                    </span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Best accomplishment</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Rank #1 🥇</span>
                  </div>
                </div>

                {/* Card 4: Webhooks Captured */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Webhook Telemetry</span>
                    <div className="p-2 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                      <Radio className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{stats.webhookCount}</span>
                    <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">events recorded</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                    <span>Success rate</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{successRate}% success</span>
                  </div>
                </div>
              </div>

              {/* Two Column Layout: Left (Leaderboard + Feed) & Right (Quick Create + Architecture) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (8 cols) */}
                <div className="lg:col-span-8 space-y-6">
                  {/* Streak Leaderboard */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Flame className="w-5 h-5 text-amber-500" />
                          Habit Streaks Leaderboard
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Your active habits ranked by completion streak and milestone progress.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTab('tasks')}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        View All ({tasks.length}) <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {tasks.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                        <Flame className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                        No habits tracked yet. Use the Quick Add card on the right to start your first streak!
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {sortedTasks.slice(0, 5).map((task, idx) => {
                          // Calculate milestone
                          const streak = task.streak_count || 0;
                          const nextMilestone = streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : streak < 60 ? 60 : 100;
                          const progress = Math.min(100, Math.round((streak / nextMilestone) * 100));

                          return (
                            <div key={task.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded-xl transition">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  idx === 0
                                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    : idx === 1
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                    : idx === 2
                                    ? 'bg-amber-700/20 text-amber-700 dark:text-amber-500'
                                    : 'text-slate-400 text-xs'
                                }`}>
                                  {idx + 1}
                                </span>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                                      {task.title}
                                    </span>
                                    {(task.workflow_type === 'repeated_tasks' || task.workflow_type === 'immediate_recreate') && (
                                      <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                        <span>Repeated</span>
                                        <span className="text-slate-400 dark:text-slate-500 font-normal">• {getDelayLabel(task)}</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="w-24 sm:w-32 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-amber-500 to-indigo-500 rounded-full"
                                        style={{ width: `${progress}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-slate-400">
                                      {streak}/{nextMilestone} milestone
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                                  {task.streak_count} streak
                                </span>

                                {task.workflow_config?.scheduled_recreate_at ? (
                                  <button
                                    onClick={() => handleRecreateNow(task)}
                                    disabled={recreatingTaskId === task.id}
                                    className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-xs font-semibold flex items-center gap-1 transition"
                                    title={`Scheduled to recreate: ${new Date(task.workflow_config.scheduled_recreate_at).toLocaleString()}`}
                                  >
                                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                                    <span>{recreatingTaskId === task.id ? 'Recreating...' : 'Recreate Now'}</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleTriggerComplete(task)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1 transition"
                                    title="Check off & trigger workflow"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    Check Off
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recent Webhook Events Feed */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <Terminal className="w-5 h-5 text-violet-500" />
                          Live Webhook Telemetry
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Real-time audit log of incoming payloads from Todoist.
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTab('logs')}
                        className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        View All Logs ({webhookLogs.length}) <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {recentLogs.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
                        <Terminal className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                        No webhooks received yet. Complete a task in Todoist or use the simulator.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {recentLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                                {log.event_name}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 truncate">
                                {log.action_taken || 'Processed event'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] text-slate-400 font-mono">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                  log.processed_status === 'success'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                    : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                                }`}
                              >
                                {log.processed_status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column (4 cols) */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Quick Add Habit Widget */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-1">
                      <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Quick Add Habit
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Creates the task in Todoist and initiates streak tracking.
                    </p>

                    <form onSubmit={handleCreateTask} className="space-y-3">
                      <div>
                        <input
                          type="text"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="e.g. Daily Meditation, Run 5k"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400"
                          required
                        />
                      </div>
                      <div>
                        <select
                          value={newTaskWorkflow}
                          onChange={(e) => setNewTaskWorkflow(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white font-medium"
                        >
                          <option value="repeated_tasks">Workflow: Repeated tasks</option>
                          <option value="streak_only">Workflow: Streak Only</option>
                          <option value="none">Standard Task (No workflow)</option>
                        </select>
                      </div>

                      {(newTaskWorkflow === 'repeated_tasks' || newTaskWorkflow === 'immediate_recreate') && (
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/80 space-y-2">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            Delay Before Recreating:
                          </label>
                          <select
                            value={newDelayMode}
                            onChange={(e) => setNewDelayMode(e.target.value as DelayMode)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white font-medium"
                          >
                            <option value="immediately">Immediately (0 delay)</option>
                            <option value="after_hours">After x hours</option>
                            <option value="tomorrow_at">Tomorrow at HH:MM</option>
                            <option value="after_days_at">+ x Days at HH:MM (e.g. +4 days at 5 PM)</option>
                          </select>

                          {newDelayMode === 'after_hours' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={newDelayHours}
                                onChange={(e) => setNewDelayHours(e.target.value)}
                                placeholder="1.5"
                                className="w-20 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                              />
                              <span className="text-[11px] text-slate-500">hours (e.g. 0.5, 1.5, 4)</span>
                            </div>
                          )}

                          {newDelayMode === 'tomorrow_at' && (
                            <div className="flex items-center gap-2">
                              <input
                                type="time"
                                value={newDelayTime}
                                onChange={(e) => setNewDelayTime(e.target.value)}
                                className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                              />
                              <span className="text-[11px] text-slate-500">Tomorrow at this time</span>
                            </div>
                          )}

                          {newDelayMode === 'after_days_at' && (
                            <div className="space-y-1.5 pt-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-500 w-12 shrink-0">After:</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={newDelayDays}
                                  onChange={(e) => setNewDelayDays(e.target.value)}
                                  placeholder="4"
                                  className="w-16 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
                                />
                                <span className="text-[11px] text-slate-500">days</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-500 w-12 shrink-0">At time:</span>
                                <input
                                  type="time"
                                  value={newDelayTime}
                                  onChange={(e) => setNewDelayTime(e.target.value)}
                                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
                                />
                              </div>
                              <div className="text-[10px] text-indigo-600 dark:text-indigo-400">
                                Recreates on completion + {newDelayDays || 4} days at {newDelayTime || '17:00'}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={isCreatingTask || !newTaskTitle.trim()}
                        className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition"
                      >
                        {isCreatingTask ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Push to Todoist
                      </button>
                    </form>
                  </div>

                  {/* Architecture Pipeline Visualizer */}
                  <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors space-y-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <GitFork className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      Automation Pipeline
                    </h3>

                    <div className="space-y-2.5 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                          1
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white">Todoist Check-off</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">User marks item completed</div>
                        </div>
                      </div>

                      <div className="flex justify-center -my-1 text-slate-300 dark:text-slate-600">
                        ↓
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                          2
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white">Webhook Ingestion</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Edge worker validates HMAC</div>
                        </div>
                      </div>

                      <div className="flex justify-center -my-1 text-slate-300 dark:text-slate-600">
                        ↓
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                          3
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white">Supabase State</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Streak +1 & audit saved</div>
                        </div>
                      </div>

                      <div className="flex justify-center -my-1 text-slate-300 dark:text-slate-600">
                        ↓
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                          4
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white">Re-creation in Todoist</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">Spawned for next habit loop</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        {/* TAB 1: Habits & Tasks */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            {/* Create Task Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                Add New Habit / Repeated Task
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Tasks created here will automatically synchronize with Todoist and attach your chosen workflow.
              </p>

              <form onSubmit={handleCreateTask} className="mt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-6">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Habit / Task Title
                    </label>
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder='e.g. "Swimming", "Read 30 mins", "Daily Meditation"'
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
                      required
                    />
                  </div>

                  <div className="sm:col-span-6">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Workflow Mode
                    </label>
                    <select
                      value={newTaskWorkflow}
                      onChange={(e) => setNewTaskWorkflow(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white transition-colors"
                    >
                      <option value="repeated_tasks">Workflow: Repeated tasks</option>
                      <option value="streak_only">Workflow: Streak Tracking Only</option>
                      <option value="none">Standard Task (No workflow)</option>
                    </select>
                  </div>
                </div>

                {(newTaskWorkflow === 'repeated_tasks' || newTaskWorkflow === 'immediate_recreate') && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <Clock className="w-4 h-4 text-indigo-500" />
                      Delay Parameter (Recreation schedule once completed):
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <select
                          value={newDelayMode}
                          onChange={(e) => setNewDelayMode(e.target.value as DelayMode)}
                          className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white font-medium"
                        >
                          <option value="immediately">Immediately (0 delay)</option>
                          <option value="after_hours">After x hours</option>
                          <option value="tomorrow_at">Tomorrow at HH:MM</option>
                          <option value="after_days_at">+ x Days at HH:MM (e.g. +4 days at 5 PM)</option>
                        </select>
                      </div>

                      <div>
                        {newDelayMode === 'immediately' && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 py-2">
                            Immediately respawns the task in Todoist upon check-off.
                          </div>
                        )}

                        {newDelayMode === 'after_hours' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={newDelayHours}
                              onChange={(e) => setNewDelayHours(e.target.value)}
                              placeholder="1.5"
                              className="w-24 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">hours (e.g. 0.5, 1.5, 4)</span>
                          </div>
                        )}

                        {newDelayMode === 'tomorrow_at' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={newDelayTime}
                              onChange={(e) => setNewDelayTime(e.target.value)}
                              className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400">Tomorrow at this time</span>
                          </div>
                        )}

                        {newDelayMode === 'after_days_at' && (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-500">After</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="365"
                                  value={newDelayDays}
                                  onChange={(e) => setNewDelayDays(e.target.value)}
                                  placeholder="4"
                                  className="w-16 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
                                />
                                <span className="text-xs text-slate-500">days</span>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-500">at</span>
                                <input
                                  type="time"
                                  value={newDelayTime}
                                  onChange={(e) => setNewDelayTime(e.target.value)}
                                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 font-semibold"
                                />
                              </div>
                            </div>
                            <p className="text-[11px] text-indigo-600 dark:text-indigo-400">
                              When checked off, recreated on completed date + {newDelayDays || 4} days at {newDelayTime || '17:00'}.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isCreatingTask || !newTaskTitle.trim()}
                    className="py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isCreatingTask ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create & Push to Todoist
                  </button>
                </div>
              </form>
            </div>

            {/* Tasks List */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Active Habits & Workflows ({tasks.length})</h3>
                <button
                  onClick={loadData}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
                  title="Refresh Tasks"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {tasks.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                  <Flame className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
                  No tasks tracked yet. Add your first habit above (e.g. &quot;Swimming&quot;) to start automating!
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-semibold text-slate-900 dark:text-white text-base">{task.title}</span>
                          
                          {/* Streak Badge */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Flame className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                            {task.streak_count} streak
                          </span>

                          {/* Workflow Badge */}
                          {(task.workflow_type === 'repeated_tasks' || task.workflow_type === 'immediate_recreate') && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                              <RefreshCw className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                              <span>Repeated tasks</span>
                              <span className="text-slate-400 dark:text-slate-500 font-normal">• Delay: {getDelayLabel(task)}</span>
                            </span>
                          )}
                          {task.workflow_type === 'streak_only' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
                              Streak Only
                            </span>
                          )}

                          {/* Scheduled recreation indicator if pending */}
                          {task.workflow_config?.scheduled_recreate_at && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              <Clock className="w-3 h-3 text-amber-500" />
                              Due: {new Date(task.workflow_config.scheduled_recreate_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          {task.todoist_id ? (
                            <span className="font-mono text-slate-500 dark:text-slate-400">Todoist ID: {task.todoist_id}</span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              {task.workflow_config?.scheduled_recreate_at ? 'Waiting for scheduled recreation' : 'Local Only (No Todoist ID)'}
                            </span>
                          )}
                          {task.last_completed_at && (
                            <span>Last completed: {new Date(task.last_completed_at).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {task.workflow_config?.scheduled_recreate_at ? (
                          <button
                            onClick={() => handleRecreateNow(task)}
                            disabled={recreatingTaskId === task.id}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
                            title="Bypass delay and recreate in Todoist now"
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-500" />
                            {recreatingTaskId === task.id ? 'Recreating...' : 'Recreate Now'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleTriggerComplete(task)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
                            title="Complete in Todoist & Trigger Workflow"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Check Off
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-1.5 rounded-xl hover:bg-red-500/10 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition"
                          title="Delete Task"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: Workflows */}
        {activeTab === 'workflows' && (
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <GitFork className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Workflow Engine Architecture
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Workflows automate actions triggered by Todoist webhook lifecycle events.
              </p>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Trigger */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 transition-colors">
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">1. Trigger Event</div>
                  <div className="font-semibold text-slate-900 dark:text-white">item:completed</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Fires via Todoist webhook whenever you check off a task in your Todoist app (mobile, desktop, or web).
                  </p>
                </div>

                {/* Condition */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 transition-colors">
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">2. Rule Evaluation</div>
                  <div className="font-semibold text-slate-900 dark:text-white">Workflow = Repeated tasks</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Engine matches task in Supabase DB by Todoist ID, validates workflow rules, increments streak counter, and calculates recreation schedule.
                  </p>
                </div>

                {/* Action */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 transition-colors">
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">3. Action Executed</div>
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400">Recreate with Configured Delay</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    If Delay = Immediately, spawns task in Todoist REST API right away. If delayed, schedules recreation and spawns when due.
                  </p>
                </div>
              </div>
            </div>

            {/* Workflow List */}
            <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-4 transition-colors">
              <h3 className="font-semibold text-sm text-slate-900 dark:text-white">Configured Automation Rules</h3>
              
              <div className="p-5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-indigo-500/30 space-y-3 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">Repeated tasks</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">Active</span>
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">ID: repeated_tasks</div>
                </div>
                
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  When <code className="text-indigo-600 dark:text-indigo-400 font-mono">item:completed</code> occurs for any habit marked with <strong className="text-slate-900 dark:text-white">Repeated tasks</strong>, the engine increments your habit streak and executes or schedules recreation based on your configured <strong className="text-indigo-600 dark:text-indigo-400">Delay</strong> parameter.
                </p>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Supported Delay Options:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-indigo-600 dark:text-indigo-400">Immediately</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">0 delay; recreated right away on check-off</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-indigo-600 dark:text-indigo-400">After x hours</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Fractional hours supported (e.g. 0.5, 1.5, 4)</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-indigo-600 dark:text-indigo-400">Tomorrow at HH:MM</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Schedules task for tomorrow at chosen time</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div className="font-semibold text-indigo-600 dark:text-indigo-400">+ x Days at HH:MM</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Recreates on completed date + x days at target time (e.g. +4 days at 5 PM)</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Webhook Logs */}
        {activeTab === 'logs' && (
          <div className="rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  Live Webhook Activity Feed
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  All incoming Todoist and simulator webhook calls are recorded for diagnostics and dashboard analytics.
                </p>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs text-slate-600 dark:text-slate-300 transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                No webhooks captured yet. Use the Simulator tab or connect Todoist to trigger the first webhook!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                  <thead className="bg-slate-50 dark:bg-slate-950/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Timestamp</th>
                      <th className="px-6 py-3">Event</th>
                      <th className="px-6 py-3">Source</th>
                      <th className="px-6 py-3">Action Taken</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {webhookLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition-colors">
                        <td className="px-6 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-3 text-indigo-600 dark:text-indigo-400 font-semibold">{log.event_name}</td>
                        <td className="px-6 py-3 text-slate-500 dark:text-slate-400">{log.source}</td>
                        <td className="px-6 py-3 text-slate-800 dark:text-slate-200 font-sans">{log.action_taken || 'Processed'}</td>
                        <td className="px-6 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              log.processed_status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : log.processed_status === 'ignored'
                                ? 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20'
                                : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                            }`}
                          >
                            {log.processed_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Webhook Simulator */}
        {activeTab === 'simulator' && (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6 transition-colors">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                Webhook Simulation & Testing Lab
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Test the complete webhook workflow immediately! This simulates the exact payload Todoist sends when you complete a task.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Select Habit to Simulate Complete:
                  </label>
                  <select
                    value={simTask}
                    onChange={(e) => setSimTask(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white transition-colors"
                  >
                    <option value="">-- Choose a tracked task --</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} (Streak: {t.streak_count}, Delay: {getDelayLabel(t)}) {t.todoist_id ? `[Todoist: ${t.todoist_id}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="simClose"
                    checked={simCloseInTodoist}
                    onChange={(e) => setSimCloseInTodoist(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="simClose" className="text-xs text-slate-700 dark:text-slate-300">
                    Also close task in Todoist API (if token is connected)
                  </label>
                </div>

                <button
                  onClick={handleRunSimulator}
                  disabled={isSimulating || !simTask}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 transition"
                >
                  {isSimulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Fire &apos;item:completed&apos; Webhook Event
                </button>
              </div>

              {/* Simulation Result Terminal */}
              <div className="p-4 rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 font-mono text-xs shadow-inner">
                <div className="text-slate-400 uppercase tracking-wider text-[10px] mb-2 font-bold flex items-center justify-between">
                  <span>Engine Response Output</span>
                  {simResult && <span className="text-emerald-400">Status 200 OK</span>}
                </div>
                {simResult ? (
                  <pre className="text-slate-200 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(simResult, null, 2)}
                  </pre>
                ) : (
                  <div className="text-slate-500 py-12 text-center">
                    Select a task and click &quot;Fire Webhook Event&quot; to inspect workflow execution.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Settings & Todoist Sync */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* User Account & Security Section */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/20">
                    {user ? (user.email?.charAt(0).toUpperCase() || 'U') : <User className="w-5 h-5" />}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      User Account & Security
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {user ? `Signed in as ${user.email}` : 'You are currently browsing in Guest Mode.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {user ? (
                    <>
                      <button
                        onClick={() => {
                          setAuthModalMode('forgot');
                          setAuthModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Reset Password
                      </button>
                      <button
                        onClick={() => signOut()}
                        className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/40 dark:hover:bg-red-900/50 dark:text-red-400 text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setAuthModalMode('login');
                          setAuthModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Sign In
                      </button>
                      <button
                        onClick={() => {
                          setAuthModalMode('signup');
                          setAuthModalOpen(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-semibold transition"
                      >
                        Create Account
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Privacy Guarantee Banner */}
              <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Strict Privacy Commitment:</strong> We only collect your email address for account recovery and password resets. We will never sell your data, send marketing emails, or contact you for promotional reasons.
                </div>
              </div>
            </div>

            {/* Real-time Webhooks & OAuth App Setup */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Radio className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Todoist OAuth App & Real-Time Webhooks
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Todoist requires your application to be authorized by your account so it knows where to dispatch live completion webhooks.
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shrink-0 ${
                    settings.isOAuthActive
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      settings.isOAuthActive ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-amber-500 dark:bg-amber-400'
                    }`}
                  />
                  {settings.isOAuthActive ? 'App Linked & Webhooks Active' : 'Authorization Required'}
                </span>
              </div>

              {settings.isOAuthActive && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Your Todoist account is connected! When you check off tasks in Todoist (mobile, desktop, or web), freeFlow will immediately catch the webhook, increment streaks, and recreate habits.
                  </span>
                </div>
              )}

              {/* Form to enter Client ID and Client Secret */}
              <form onSubmit={handleSaveOAuthSettings} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Todoist Client ID:
                    </label>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="e.g. 0123456789abcdef"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Todoist Client Secret:
                    </label>
                    <input
                      type="password"
                      value={clientSecretInput}
                      onChange={(e) => setClientSecretInput(e.target.value)}
                      placeholder={
                        settings.maskedClientSecret
                          ? `Saved (${settings.maskedClientSecret})`
                          : 'Paste Todoist Client Secret'
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleAuthorizeOAuth}
                    disabled={isAuthorizing || !clientIdInput.trim()}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                  >
                    {isAuthorizing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {settings.isOAuthActive ? 'Re-link & Authorize App in Todoist' : 'Authorize & Link App in Todoist'}
                  </button>

                  <button
                    type="submit"
                    disabled={isSavingOAuth}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-transparent text-sm font-semibold transition flex items-center gap-2"
                  >
                    {isSavingOAuth ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save Credentials Only
                  </button>
                </div>
              </form>

              {oauthFeedback && (
                <div
                  className={`text-xs p-3 rounded-xl border ${
                    oauthFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300'
                  }`}
                >
                  {oauthFeedback.message}
                </div>
              )}

              {/* Developer Console Configuration Box */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Required Settings for your{' '}
                    <a
                      href="https://developer.todoist.com/appconsole.html"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
                    >
                      Todoist Developer Console <ExternalLink className="w-3 h-3" />
                    </a>:
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>OAuth redirect URL</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `${typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/auth/callback`,
                            'redirect'
                          )
                        }
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'redirect' ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'redirect' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <code className="text-indigo-600 dark:text-indigo-300 font-mono text-[11px] block break-all">
                      {typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/auth/callback
                    </code>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Webhook callback URL</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `${typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/webhooks/todoist`,
                            'webhook'
                          )
                        }
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'webhook' ? <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'webhook' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <code className="text-indigo-600 dark:text-indigo-300 font-mono text-[11px] block break-all">
                      {typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/webhooks/todoist
                    </code>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  <strong>Watched events:</strong> In Todoist App settings, ensure <code className="text-indigo-600 dark:text-indigo-300 font-mono">item:completed</code>, <code className="text-indigo-600 dark:text-indigo-300 font-mono">item:added</code>, and <code className="text-indigo-600 dark:text-indigo-300 font-mono">item:deleted</code> are checked.
                </p>
              </div>
            </div>

            {/* Todoist Personal API Token (Fallback) */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Personal API Token (Manual Fallback)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                The Personal API Token allows freeFlow to make direct REST API requests. It is automatically filled when you complete the OAuth authorization above, or you can paste one manually.
              </p>

              {settings.hasToken && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    API token active: <strong className="font-mono">{settings.maskedToken}</strong>
                  </span>
                </div>
              )}

              <form onSubmit={handleSaveToken} className="flex gap-3">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste Todoist Personal API Token"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={isSavingToken}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition flex items-center gap-2"
                >
                  {isSavingToken ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Save & Verify'}
                </button>
              </form>

              {tokenFeedback && (
                <div
                  className={`text-xs p-3 rounded-xl border ${
                    tokenFeedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300'
                  }`}
                >
                  {tokenFeedback.message}
                </div>
              )}
            </div>

            {/* Supabase Schema Reference */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    Supabase SQL Schema
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Execute this script in your Supabase SQL Editor if your tables are not yet created.
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`-- freeFlow Database Schema for Supabase
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    todoist_id TEXT,
    todoist_project_id TEXT,
    priority INTEGER DEFAULT 1,
    streak_count INTEGER NOT NULL DEFAULT 0,
    workflow_type TEXT NOT NULL DEFAULT 'repeated_tasks',
    workflow_config JSONB DEFAULT '{}'::jsonb,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    last_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tasks_todoist_id ON public.tasks(todoist_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);

CREATE TABLE IF NOT EXISTS public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    trigger_event TEXT NOT NULL DEFAULT 'item:completed',
    action_type TEXT NOT NULL DEFAULT 'recreate_task',
    is_active BOOLEAN NOT NULL DEFAULT true,
    config JSONB DEFAULT '{ "recreate_delay_seconds": 0, "increment_streak": true }'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'todoist_webhook',
    payload JSONB NOT NULL,
    processed_status TEXT NOT NULL DEFAULT 'success',
    action_taken TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    trigger_event TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success',
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Full access tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access workflows" ON public.workflows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access webhook_logs" ON public.webhook_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access workflow_runs" ON public.workflow_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Full access app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Migration for Repeated tasks workflow:
-- ALTER TABLE public.tasks ALTER COLUMN workflow_type SET DEFAULT 'repeated_tasks';
-- UPDATE public.tasks SET workflow_type = 'repeated_tasks' WHERE workflow_type = 'immediate_recreate';`);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 dark:bg-emerald-600/20 dark:hover:bg-emerald-600/30 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 dark:border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {copySuccess ? <Check className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  {copySuccess ? 'Copied to Clipboard!' : 'Copy SQL Schema'}
                </button>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>

      {/* Authentication & Password Recovery Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />
    </div>
  );
}
