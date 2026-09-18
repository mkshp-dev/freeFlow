export type TaskStatus = 'pending' | 'completed' | 'archived';

export type WorkflowType = 'immediate_recreate' | 'interval_recreate' | 'streak_only' | 'none';

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  todoist_id?: string | null;
  todoist_project_id?: string | null;
  priority: number;
  streak_count: number;
  workflow_type: WorkflowType;
  workflow_config?: Record<string, any>;
  user_id?: string | null;
  last_completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  trigger_event: string;
  action_type: string;
  is_active: boolean;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface WebhookLog {
  id: string;
  event_name: string;
  source: string;
  payload: Record<string, any>;
  processed_status: 'success' | 'ignored' | 'failed';
  action_taken?: string | null;
  created_at: string;
}

export interface WorkflowRun {
  id: string;
  workflow_id?: string | null;
  task_id?: string | null;
  trigger_event: string;
  status: 'success' | 'failed' | 'skipped';
  details: Record<string, any>;
  created_at: string;
}

export interface TodoistItemPayload {
  id: string;
  content: string;
  description?: string;
  is_completed?: boolean;
  checked?: number | boolean;
  project_id?: string;
  priority?: number;
  labels?: string[];
  due?: any;
  [key: string]: any;
}

export interface TodoistWebhookEvent {
  event_name: 'item:added' | 'item:updated' | 'item:completed' | 'item:uncompleted' | 'item:deleted';
  user_id: string | number;
  event_data: TodoistItemPayload;
  initiator?: any;
  version?: string;
}
