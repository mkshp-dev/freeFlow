-- Migration: Add chained_tasks to workflow_type constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_workflow_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_workflow_type_check CHECK (workflow_type IN ('repeated_tasks', 'chained_tasks', 'immediate_recreate', 'interval_recreate', 'streak_only', 'none'));
