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
  Copy
} from 'lucide-react';
import { Task, Workflow, WebhookLog } from '@/types';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'workflows' | 'logs' | 'simulator' | 'settings'>('tasks');
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

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('1');
  const [newTaskWorkflow, setNewTaskWorkflow] = useState('immediate_recreate');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Simulator state
  const [simTask, setSimTask] = useState<string>('');
  const [simCloseInTodoist, setSimCloseInTodoist] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load all initial data
  const loadData = async () => {
    try {
      const [tasksRes, logsRes, statsRes, settingsRes] = await Promise.all([
        fetch('/api/tasks'),
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

    // Auto-refresh webhook logs and stats every 8 seconds
    const interval = setInterval(() => {
      loadData();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Handle task creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    setIsCreatingTask(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          description: newTaskDesc,
          priority: parseInt(newTaskPriority, 10),
          workflow_type: newTaskWorkflow,
          sync_with_todoist: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNewTaskTitle('');
        setNewTaskDesc('');
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                freeFlow
              </span>
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Todoist Habit Engine
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Pills */}
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Supabase
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                  settings.hasToken
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${settings.hasToken ? 'bg-indigo-400' : 'bg-amber-400'}`} />
                {settings.hasToken ? 'API Token' : 'No API Token'}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                  settings.isOAuthActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${settings.isOAuthActive ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
                {settings.isOAuthActive ? 'Webhooks Live' : 'OAuth Unlinked'}
              </span>
            </div>

            <button
              onClick={() => setActiveTab('simulator')}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium flex items-center gap-1.5 transition shadow-sm"
            >
              <Zap className="w-3.5 h-3.5" />
              Simulate Webhook
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Global OAuth / Alert Banners */}
        {oauthBanner && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-xs transition shadow-sm ${
              oauthBanner.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : oauthBanner.type === 'info'
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                : 'bg-red-500/10 border-red-500/20 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 shrink-0" />
              <span>{oauthBanner.message}</span>
            </div>
            <button
              onClick={() => setOauthBanner(null)}
              className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
            >
              ✕
            </button>
          </div>
        )}

        {!settings.isOAuthActive && !oauthBanner && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
              <span>
                <strong>Action Required for Real-Time Sync:</strong> Todoist only delivers webhooks for accounts that have authorized the App.
              </span>
            </div>
            <button
              onClick={() => setActiveTab('settings')}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg shrink-0 transition"
            >
              Link App in Settings →
            </button>
          </div>
        )}
        {/* KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tracked Habits</span>
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-white">{tasks.length}</span>
              <span className="text-xs text-slate-400">active items</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Habit Streaks Logged</span>
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Flame className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-white">{stats.totalCompletions}</span>
              <span className="text-xs text-emerald-400">completions</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Webhooks Captured</span>
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
                <Radio className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-white">{stats.webhookCount}</span>
              <span className="text-xs text-slate-400">events received</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Workflows</span>
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <GitFork className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-white">1</span>
              <span className="text-xs text-cyan-400">Auto-Recreate Active</span>
            </div>
          </div>
        </div>

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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-6">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`pb-3 text-sm font-medium transition relative ${
              activeTab === 'tasks' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Habits & Tasks
            {activeTab === 'tasks' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
          </button>

          <button
            onClick={() => setActiveTab('workflows')}
            className={`pb-3 text-sm font-medium transition relative ${
              activeTab === 'workflows' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Automation Workflows
            {activeTab === 'workflows' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 text-sm font-medium transition relative ${
              activeTab === 'logs' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Live Webhook Logs ({webhookLogs.length})
            {activeTab === 'logs' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
          </button>

          <button
            onClick={() => setActiveTab('simulator')}
            className={`pb-3 text-sm font-medium transition relative ${
              activeTab === 'simulator' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Webhook Simulator
            {activeTab === 'simulator' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 text-sm font-medium transition relative ${
              activeTab === 'settings' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Settings & Todoist Sync
            {activeTab === 'settings' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500" />}
          </button>
        </div>

        {/* TAB 1: Habits & Tasks */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            {/* Create Task Card */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Add New Habit / Repeated Task
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Tasks created here will automatically synchronize with Todoist and attach your chosen workflow.
              </p>

              <form onSubmit={handleCreateTask} className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder='e.g. "Swimming", "Read 30 mins", "Daily Meditation"'
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder:text-slate-500"
                    required
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={newTaskWorkflow}
                    onChange={(e) => setNewTaskWorkflow(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  >
                    <option value="immediate_recreate">Workflow: Recreate Immediately on Complete</option>
                    <option value="streak_only">Workflow: Streak Tracking Only</option>
                    <option value="none">Standard Task (No workflow)</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    disabled={isCreatingTask}
                    className="w-full py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold text-white transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isCreatingTask ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create & Push to Todoist
                  </button>
                </div>
              </form>
            </div>

            {/* Tasks List */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-semibold text-sm text-white">Active Habits & Workflows ({tasks.length})</h3>
                <button
                  onClick={loadData}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                  title="Refresh Tasks"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {tasks.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  <Flame className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                  No tasks tracked yet. Add your first habit above (e.g. &quot;Swimming&quot;) to start automating!
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {tasks.map((task) => (
                    <div key={task.id} className="p-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-900/30 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-white text-base">{task.title}</span>
                          
                          {/* Streak Badge */}
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Flame className="w-3 h-3 text-amber-400" />
                            {task.streak_count} streak
                          </span>

                          {/* Workflow Badge */}
                          {task.workflow_type === 'immediate_recreate' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                              <RefreshCw className="w-3 h-3 text-indigo-400" />
                              Immediate Recreate
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400">
                          {task.todoist_id ? (
                            <span className="font-mono text-slate-400">Todoist ID: {task.todoist_id}</span>
                          ) : (
                            <span className="text-amber-400">Local Only (No Todoist ID)</span>
                          )}
                          {task.last_completed_at && (
                            <span>Last completed: {new Date(task.last_completed_at).toLocaleTimeString()}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={() => handleTriggerComplete(task)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                          title="Complete in Todoist & Trigger Workflow"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Complete & Recreate
                        </button>

                        <button
                          onClick={() => handleDeleteTask(task.id)}
                          className="p-1.5 rounded-xl hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition"
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
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <GitFork className="w-5 h-5 text-indigo-400" />
                Workflow Engine Architecture
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Workflows automate actions triggered by Todoist webhook lifecycle events.
              </p>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Trigger */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">1. Trigger Event</div>
                  <div className="font-semibold text-white">item:completed</div>
                  <p className="text-xs text-slate-400 mt-2">
                    Fires via Todoist webhook whenever you check off a task in your Todoist app (mobile, desktop, or web).
                  </p>
                </div>

                {/* Condition */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">2. Rule Evaluation</div>
                  <div className="font-semibold text-white">Task Workflow = immediate_recreate</div>
                  <p className="text-xs text-slate-400 mt-2">
                    Engine matches task in Supabase DB by Todoist ID, verifies workflow settings, and increments habit streak counter.
                  </p>
                </div>

                {/* Action */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">3. Action Executed</div>
                  <div className="font-semibold text-emerald-400">Recreate Task in Todoist</div>
                  <p className="text-xs text-slate-400 mt-2">
                    Calls Todoist REST API to immediately spawn a new instance of the habit task, logs the webhook audit event, and updates dashboard metrics.
                  </p>
                </div>
              </div>
            </div>

            {/* Workflow List */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 space-y-4">
              <h3 className="font-semibold text-sm text-white">Configured Automation Rules</h3>
              
              <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/30 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Immediate Habit Recreation Loop</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    When <code className="text-indigo-300">item:completed</code> occurs for any habit marked with <code className="text-indigo-300">immediate_recreate</code>, recreate in Todoist with delay = 0s and increment habit streak.
                  </p>
                </div>
                <div className="text-xs text-slate-500 font-mono">ID: default-loop</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Webhook Logs */}
        {activeTab === 'logs' && (
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-violet-400" />
                  Live Webhook Activity Feed
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  All incoming Todoist and simulator webhook calls are recorded for diagnostics and dashboard analytics.
                </p>
              </div>
              <button
                onClick={loadData}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            {webhookLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                No webhooks captured yet. Use the Simulator tab or connect Todoist to trigger the first webhook!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <tr>
                      <th className="px-6 py-3">Timestamp</th>
                      <th className="px-6 py-3">Event</th>
                      <th className="px-6 py-3">Source</th>
                      <th className="px-6 py-3">Action Taken</th>
                      <th className="px-6 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {webhookLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/40">
                        <td className="px-6 py-3 text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="px-6 py-3 text-indigo-400 font-semibold">{log.event_name}</td>
                        <td className="px-6 py-3 text-slate-400">{log.source}</td>
                        <td className="px-6 py-3 text-slate-200 font-sans">{log.action_taken || 'Processed'}</td>
                        <td className="px-6 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              log.processed_status === 'success'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : log.processed_status === 'ignored'
                                ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
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
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                Webhook Simulation & Testing Lab
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Test the complete webhook workflow immediately! This simulates the exact payload Todoist sends when you complete a task.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Select Habit to Simulate Complete:
                  </label>
                  <select
                    value={simTask}
                    onChange={(e) => setSimTask(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-white"
                  >
                    <option value="">-- Choose a tracked task --</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} (Streak: {t.streak_count}) {t.todoist_id ? `[Todoist: ${t.todoist_id}]` : ''}
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
                    className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-0"
                  />
                  <label htmlFor="simClose" className="text-xs text-slate-300">
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
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs">
                <div className="text-slate-400 uppercase tracking-wider text-[10px] mb-2 font-bold flex items-center justify-between">
                  <span>Engine Response Output</span>
                  {simResult && <span className="text-emerald-400">Status 200 OK</span>}
                </div>
                {simResult ? (
                  <pre className="text-slate-200 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(simResult, null, 2)}
                  </pre>
                ) : (
                  <div className="text-slate-600 py-12 text-center">
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
            {/* Real-time Webhooks & OAuth App Setup */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Radio className="w-5 h-5 text-indigo-400" />
                    Todoist OAuth App & Real-Time Webhooks
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Todoist requires your application to be authorized by your account so it knows where to dispatch live completion webhooks.
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shrink-0 ${
                    settings.isOAuthActive
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      settings.isOAuthActive ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {settings.isOAuthActive ? 'App Linked & Webhooks Active' : 'Authorization Required'}
                </span>
              </div>

              {settings.isOAuthActive && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Your Todoist account is connected! When you check off tasks in Todoist (mobile, desktop, or web), freeFlow will immediately catch the webhook, increment streaks, and recreate habits.
                  </span>
                </div>
              )}

              {/* Form to enter Client ID and Client Secret */}
              <form onSubmit={handleSaveOAuthSettings} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Todoist Client ID:
                    </label>
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="e.g. 0123456789abcdef"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-white font-mono placeholder:text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
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
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-white font-mono placeholder:text-slate-600"
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
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-sm font-semibold transition flex items-center gap-2"
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
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-300'
                  }`}
                >
                  {oauthFeedback.message}
                </div>
              )}

              {/* Developer Console Configuration Box */}
              <div className="pt-2 border-t border-slate-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Required Settings for your{' '}
                    <a
                      href="https://developer.todoist.com/appconsole.html"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:underline inline-flex items-center gap-1"
                    >
                      Todoist Developer Console <ExternalLink className="w-3 h-3" />
                    </a>:
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>OAuth redirect URL</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `${typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/auth/callback`,
                            'redirect'
                          )
                        }
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        {copiedKey === 'redirect' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'redirect' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <code className="text-indigo-300 font-mono text-[11px] block break-all">
                      {typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/auth/callback
                    </code>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Webhook callback URL</span>
                      <button
                        onClick={() =>
                          copyToClipboard(
                            `${typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/webhooks/todoist`,
                            'webhook'
                          )
                        }
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        {copiedKey === 'webhook' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedKey === 'webhook' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <code className="text-indigo-300 font-mono text-[11px] block break-all">
                      {typeof window !== 'undefined' ? window.location.origin : 'https://freeflow.mkshp.dev'}/api/webhooks/todoist
                    </code>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  <strong>Watched events:</strong> In Todoist App settings, ensure <code className="text-indigo-300">item:completed</code>, <code className="text-indigo-300">item:added</code>, and <code className="text-indigo-300">item:deleted</code> are checked.
                </p>
              </div>
            </div>

            {/* Todoist Personal API Token (Fallback) */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                Personal API Token (Manual Fallback)
              </h2>
              <p className="text-xs text-slate-400">
                The Personal API Token allows freeFlow to make direct REST API requests. It is automatically filled when you complete the OAuth authorization above, or you can paste one manually.
              </p>

              {settings.hasToken && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
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
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm focus:outline-none focus:border-indigo-500 text-white placeholder:text-slate-500"
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
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/20 text-red-300'
                  }`}
                >
                  {tokenFeedback.message}
                </div>
              )}
            </div>

            {/* Supabase Schema Reference */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-emerald-400" />
                    Supabase SQL Schema
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
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
    workflow_type TEXT NOT NULL DEFAULT 'immediate_recreate',
    workflow_config JSONB DEFAULT '{}'::jsonb,
    last_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

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
CREATE POLICY "Full access app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);`);
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
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
  );
}
