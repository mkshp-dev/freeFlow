import { supabaseAdmin } from './supabase';
import { createTodoistTask } from './todoist';
import { TodoistWebhookEvent, Task } from '@/types';

export interface WorkflowResult {
  success: boolean;
  event: string;
  actionTaken: string;
  taskId?: string;
  newTodoistId?: string;
  newStreak?: number;
  error?: string;
}

/**
 * Main entry point for processing incoming Todoist webhook events.
 */
export async function processTodoistWebhookEvent(
  webhookPayload: TodoistWebhookEvent,
  source: string = 'todoist_webhook'
): Promise<WorkflowResult> {
  const eventName = webhookPayload.event_name;
  const itemData = webhookPayload.event_data;
  const todoistId = String(itemData?.id || '');
  const taskTitle = itemData?.content || 'Untitled Task';

  console.log(`[WorkflowEngine] Received ${eventName} for task "${taskTitle}" (Todoist ID: ${todoistId})`);

  // Default response
  let actionTaken = `Logged event: ${eventName}`;
  let processedStatus: 'success' | 'ignored' | 'failed' = 'success';
  let targetTask: Task | null = null;
  let newTodoistId: string | undefined;
  let newStreak: number | undefined;

  try {
    // 1. Search for matching task in our database
    if (todoistId) {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .eq('todoist_id', todoistId)
        .maybeSingle();

      if (!error && data) {
        targetTask = data as Task;
      }
    }

    // Fallback: If not found by Todoist ID, try by exact title
    if (!targetTask && taskTitle) {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .ilike('title', taskTitle.trim())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        targetTask = data as Task;
      }
    }

    // 2. Handle specific events
    if (eventName === 'item:completed') {
      if (targetTask) {
        const workflowType = targetTask.workflow_type || 'immediate_recreate';

        if (workflowType === 'immediate_recreate') {
          // Increment streak
          newStreak = (targetTask.streak_count || 0) + 1;
          const now = new Date().toISOString();

          // Immediately recreate the task in Todoist!
          let createdTodoistTask = null;
          try {
            createdTodoistTask = await createTodoistTask({
              content: targetTask.title,
              description: targetTask.description || undefined,
              project_id: targetTask.todoist_project_id || undefined,
              priority: targetTask.priority || 1,
              labels: ['freeflow-habit'],
            });
            newTodoistId = String(createdTodoistTask.id);
          } catch (todoistErr: any) {
            console.error('[WorkflowEngine] Failed to recreate task in Todoist:', todoistErr);
            actionTaken = `Failed to recreate in Todoist: ${todoistErr.message}`;
          }

          // Update task in our DB
          const updatePayload: Partial<Task> = {
            streak_count: newStreak,
            last_completed_at: now,
            status: 'pending', // Keep pending because it's recreated immediately!
            updated_at: now,
          };

          if (newTodoistId) {
            updatePayload.todoist_id = newTodoistId;
            actionTaken = `Task "${targetTask.title}" completed! Streak is now ${newStreak}. Immediately recreated in Todoist with ID ${newTodoistId}.`;
          } else {
            actionTaken = `Task completed! Streak updated to ${newStreak}. (Todoist recreation skipped/failed)`;
          }

          await supabaseAdmin
            .from('tasks')
            .update(updatePayload)
            .eq('id', targetTask.id);

          // Record workflow run
          await supabaseAdmin.from('workflow_runs').insert({
            task_id: targetTask.id,
            trigger_event: eventName,
            status: newTodoistId ? 'success' : 'failed',
            details: {
              task_title: targetTask.title,
              previous_todoist_id: todoistId,
              new_todoist_id: newTodoistId,
              streak: newStreak,
              completed_at: now,
            },
          });
        } else {
          // Standard completion without recreation
          await supabaseAdmin
            .from('tasks')
            .update({
              status: 'completed',
              last_completed_at: new Date().toISOString(),
              streak_count: (targetTask.streak_count || 0) + 1,
            })
            .eq('id', targetTask.id);

          actionTaken = `Marked task "${targetTask.title}" as completed.`;
        }
      } else {
        // Task was completed in Todoist, but wasn't tracked in freeFlow
        processedStatus = 'ignored';
        actionTaken = `Received completion for "${taskTitle}" (Todoist ID: ${todoistId}), but task is not registered in freeFlow DB.`;
      }
    } else if (eventName === 'item:deleted') {
      if (targetTask) {
        await supabaseAdmin
          .from('tasks')
          .update({ status: 'archived', updated_at: new Date().toISOString() })
          .eq('id', targetTask.id);
        actionTaken = `Archived task "${targetTask.title}" following Todoist deletion.`;
      }
    }

    // 3. Register webhook event in webhook_logs for dashboard & analytics
    await supabaseAdmin.from('webhook_logs').insert({
      event_name: eventName,
      source: source,
      payload: webhookPayload,
      processed_status: processedStatus,
      action_taken: actionTaken,
    });

    return {
      success: processedStatus === 'success',
      event: eventName,
      actionTaken,
      taskId: targetTask?.id,
      newTodoistId,
      newStreak,
    };
  } catch (err: any) {
    console.error('[WorkflowEngine] Error processing webhook event:', err);

    // Still log failed event
    try {
      await supabaseAdmin.from('webhook_logs').insert({
        event_name: eventName,
        source: source,
        payload: webhookPayload,
        processed_status: 'failed',
        action_taken: `Error: ${err.message}`,
      });
    } catch (_) {}

    return {
      success: false,
      event: eventName,
      actionTaken: `Error: ${err.message}`,
      error: err.message,
    };
  }
}
