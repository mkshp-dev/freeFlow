-- Migration: Add repeated_tasks workflow and delay support
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);

-- Update workflow_type constraint to include repeated_tasks
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_workflow_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_workflow_type_check CHECK (workflow_type IN ('repeated_tasks', 'immediate_recreate', 'interval_recreate', 'streak_only', 'none'));
ALTER TABLE public.tasks ALTER COLUMN workflow_type SET DEFAULT 'repeated_tasks';

-- Migrate existing tasks to repeated_tasks
UPDATE public.tasks SET workflow_type = 'repeated_tasks' WHERE workflow_type = 'immediate_recreate';

-- Migrate existing workflows
UPDATE public.workflows 
SET name = 'Repeated tasks',
    description = 'When a task is completed in Todoist, recreate it in Todoist after the specified delay and increment the habit streak.',
    config = jsonb_set(COALESCE(config, '{}'::jsonb), '{delay}', '{"mode": "immediately"}', true)
WHERE name = 'Immediate Task Recreation';

-- Insert default Repeated tasks workflow if not present
INSERT INTO public.workflows (name, description, trigger_event, action_type, is_active, config)
VALUES (
    'Repeated tasks',
    'When a task is completed in Todoist, recreate it in Todoist after the specified delay and increment the habit streak.',
    'item:completed',
    'recreate_task',
    true,
    '{"delay": {"mode": "immediately"}, "recreate_delay_seconds": 0, "increment_streak": true, "prefix": ""}'::jsonb
)
ON CONFLICT DO NOTHING;
