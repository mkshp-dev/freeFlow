-- ==============================================================================
-- freeFlow Initial Migration
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tasks Table
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'archived')),
    todoist_id TEXT,
    todoist_project_id TEXT,
    priority INTEGER DEFAULT 1,
    streak_count INTEGER NOT NULL DEFAULT 0,
    workflow_type TEXT NOT NULL DEFAULT 'immediate_recreate' CHECK (workflow_type IN ('immediate_recreate', 'interval_recreate', 'streak_only', 'none')),
    workflow_config JSONB DEFAULT '{}'::jsonb,
    last_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tasks_todoist_id ON public.tasks(todoist_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- 2. Workflows Table
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

INSERT INTO public.workflows (name, description, trigger_event, action_type, is_active, config)
VALUES (
    'Immediate Task Recreation',
    'When a task is completed in Todoist, immediately recreate it in Todoist and increment the habit streak.',
    'item:completed',
    'recreate_task',
    true,
    '{"recreate_delay_seconds": 0, "increment_streak": true}'::jsonb
)
ON CONFLICT DO NOTHING;

-- 3. Webhook Logs Table
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'todoist_webhook',
    payload JSONB NOT NULL,
    processed_status TEXT NOT NULL DEFAULT 'success' CHECK (processed_status IN ('success', 'ignored', 'failed')),
    action_taken TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);

-- 4. Workflow Execution Runs
CREATE TABLE IF NOT EXISTS public.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    trigger_event TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed', 'skipped')),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_task_id ON public.workflow_runs(task_id);

-- 5. Application Settings
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Row Level Security
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write workflows" ON public.workflows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write webhook_logs" ON public.webhook_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write workflow_runs" ON public.workflow_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read/write app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
