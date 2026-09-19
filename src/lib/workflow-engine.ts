import { supabaseAdmin } from './supabase';
import { createTodoistTask } from './todoist';
import { TodoistWebhookEvent, Task, WorkflowDelayConfig, ChainStep } from '@/types';

export interface WorkflowResult {
  success: boolean;
  event: string;
  actionTaken: string;
  taskId?: string;
  newTodoistId?: string;
  newStreak?: number;
  scheduledRecreateAt?: string;
  error?: string;
}

/**
 * Calculates the exact scheduled recreation time based on the workflow delay parameter.
 * Returns null if the recreation should occur immediately.
 */
export function calculateScheduledRecreationTime(delayConfig?: WorkflowDelayConfig): Date | null {
  if (!delayConfig || delayConfig.mode === 'immediately') {
    return null;
  }

  const now = new Date();

  if (delayConfig.mode === 'after_hours') {
    const hours = Number(delayConfig.hours) || 0;
    if (hours <= 0) return null;
    return new Date(now.getTime() + hours * 3600 * 1000);
  }

  if (delayConfig.mode === 'tomorrow_at') {
    const timeStr = delayConfig.time || '09:00';
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(h, m, 0, 0);
    return tomorrow;
  }

  if (delayConfig.mode === 'after_days_at') {
    const days = Math.max(1, Math.round(Number(delayConfig.days) || 1));
    const timeStr = delayConfig.time || '17:00';
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr, 10) || 0;
    const m = parseInt(mStr, 10) || 0;

    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + days);
    targetDate.setHours(h, m, 0, 0);
    return targetDate;
  }

  if (delayConfig.mode === 'exact_datetime') {
    if (!delayConfig.datetime) return null;
    // Normalize format "YYYY:MM:DD HH:MM" or "YYYY-MM-DD HH:MM" to valid ISO
    const cleaned = delayConfig.datetime
      .trim()
      .replace(/^(\d{4})[:/](\d{2})[:/](\d{2})[ T](\d{2}):(\d{2})/, '$1-$2-$3T$4:$5:00');
    const parsed = new Date(cleaned);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
    return null;
  }

  return null;
}

/**
 * Scans for tasks with scheduled recreations that are now due,
 * spawns them in Todoist, and clears their scheduled flag.
 */
export async function processDueDelayedTasks(): Promise<{ processed: number; recreatedTasks: string[] }> {
  try {
    const nowIso = new Date().toISOString();
    // Query tasks where workflow_config->>'scheduled_recreate_at' <= now, status = 'pending', and todoist_id is null
    const { data: dueTasks, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .is('todoist_id', null)
      .eq('status', 'pending')
      .not('workflow_config->scheduled_recreate_at', 'is', null)
      .lte('workflow_config->>scheduled_recreate_at', nowIso);

    if (error || !dueTasks || dueTasks.length === 0) {
      return { processed: 0, recreatedTasks: [] };
    }

    const recreatedTasks: string[] = [];

    for (const rawTask of dueTasks) {
      const task = rawTask as Task;
      try {
        const created = await createTodoistTask({
          content: task.title,
          description: task.description || undefined,
          project_id: task.todoist_project_id || undefined,
          priority: task.priority || 1,
          labels: ['freeflow-habit'],
        });

        const newTodoistId = String(created.id);
        const nextConfig = { ...(task.workflow_config || {}) };
        delete nextConfig.scheduled_recreate_at;

        await supabaseAdmin
          .from('tasks')
          .update({
            todoist_id: newTodoistId,
            workflow_config: nextConfig,
            updated_at: new Date().toISOString(),
          })
          .eq('id', task.id);

        await supabaseAdmin.from('workflow_runs').insert({
          task_id: task.id,
          trigger_event: 'delayed_recreation_fired',
          status: 'success',
          details: {
            task_title: task.title,
            new_todoist_id: newTodoistId,
            fired_at: new Date().toISOString(),
          },
        });

        recreatedTasks.push(task.title);
      } catch (err: any) {
        console.error(`[WorkflowEngine] Failed to spawn delayed task "${task.title}":`, err.message);
      }
    }

    return { processed: recreatedTasks.length, recreatedTasks };
  } catch (err: any) {
    console.error('[WorkflowEngine] Error in processDueDelayedTasks:', err);
    return { processed: 0, recreatedTasks: [] };
  }
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

  // Run a quick check to process any pending delayed tasks
  try {
    await processDueDelayedTasks();
  } catch (_) {}

  // Default response
  let actionTaken = `Logged event: ${eventName}`;
  let processedStatus: 'success' | 'ignored' | 'failed' = 'success';
  let targetTask: Task | null = null;
  let newTodoistId: string | undefined;
  let newStreak: number | undefined;
  let scheduledRecreateAt: string | undefined;

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
        const workflowType = targetTask.workflow_type || 'repeated_tasks';
        const isRepeatedTask = workflowType === 'repeated_tasks' || workflowType === 'immediate_recreate';

        if (workflowType === 'chained_tasks') {
          // CHAINED TASKS WORKFLOW:
          // User completed a step in an ordered chain of tasks.
          // Automatically progress to the next step and spawn it in Todoist.
          const now = new Date().toISOString();
          newStreak = (targetTask.streak_count || 0) + 1;
          const chainConfig = targetTask.workflow_config || {};
          const steps: ChainStep[] = chainConfig.steps || [];
          const currentStepIndex = Number(chainConfig.step_index) || 0;
          const chainName = chainConfig.chain_name || targetTask.title;
          const loop = Boolean(chainConfig.loop);
          const nextStepIndex = currentStepIndex + 1;

          if (steps.length === 0) {
            // Edge case: no steps array found, simply mark completed
            await supabaseAdmin
              .from('tasks')
              .update({
                status: 'completed',
                last_completed_at: now,
                streak_count: newStreak,
                updated_at: now,
              })
              .eq('id', targetTask.id);

            actionTaken = `Chained task "${targetTask.title}" completed.`;
          } else if (nextStepIndex < steps.length) {
            // Advance to the NEXT step in the chain
            const nextStep = steps[nextStepIndex];
            const nextDelay = nextStep.delay;
            const scheduledTime = calculateScheduledRecreationTime(nextDelay);

            if (scheduledTime && scheduledTime.getTime() > Date.now()) {
              // Delayed step opening
              scheduledRecreateAt = scheduledTime.toISOString();
              actionTaken = `Step ${currentStepIndex + 1}/${steps.length} ("${targetTask.title}") completed! Next step "${nextStep.title}" scheduled to open in Todoist at ${scheduledTime.toLocaleString()}.`;

              await supabaseAdmin
                .from('tasks')
                .update({
                  title: nextStep.title,
                  description: nextStep.description || null,
                  priority: nextStep.priority || 1,
                  todoist_id: null,
                  status: 'pending',
                  last_completed_at: now,
                  streak_count: newStreak,
                  updated_at: now,
                  workflow_config: {
                    ...chainConfig,
                    step_index: nextStepIndex,
                    scheduled_recreate_at: scheduledRecreateAt,
                  },
                })
                .eq('id', targetTask.id);

              await supabaseAdmin.from('workflow_runs').insert({
                workflow_id: chainConfig.chain_id || null,
                task_id: targetTask.id,
                trigger_event: eventName,
                status: 'success',
                details: {
                  workflow_type: 'chained_tasks',
                  chain_name: chainName,
                  completed_step_index: currentStepIndex,
                  completed_step_title: targetTask.title,
                  next_step_index: nextStepIndex,
                  next_step_title: nextStep.title,
                  scheduled_recreate_at: scheduledRecreateAt,
                  completed_at: now,
                },
              });
            } else {
              // Immediate step opening in Todoist
              let createdNext = null;
              try {
                createdNext = await createTodoistTask({
                  content: nextStep.title,
                  description: nextStep.description || undefined,
                  priority: nextStep.priority || 1,
                  project_id: targetTask.todoist_project_id || undefined,
                  labels: ['freeflow-habit', 'chained-task'],
                });
                newTodoistId = String(createdNext.id);
              } catch (err: any) {
                console.error('[WorkflowEngine] Failed to create next chained step in Todoist:', err);
              }

              const nextConfig = {
                ...chainConfig,
                step_index: nextStepIndex,
              };
              delete nextConfig.scheduled_recreate_at;

              await supabaseAdmin
                .from('tasks')
                .update({
                  title: nextStep.title,
                  description: nextStep.description || null,
                  priority: nextStep.priority || 1,
                  todoist_id: newTodoistId || null,
                  status: 'pending',
                  last_completed_at: now,
                  streak_count: newStreak,
                  updated_at: now,
                  workflow_config: nextConfig,
                })
                .eq('id', targetTask.id);

              actionTaken = `Step ${currentStepIndex + 1}/${steps.length} ("${targetTask.title}") completed! Automatically created next step ${nextStepIndex + 1}/${steps.length}: "${nextStep.title}" in Todoist${newTodoistId ? ` (ID: ${newTodoistId})` : ''}.`;

              await supabaseAdmin.from('workflow_runs').insert({
                workflow_id: chainConfig.chain_id || null,
                task_id: targetTask.id,
                trigger_event: eventName,
                status: newTodoistId ? 'success' : 'failed',
                details: {
                  workflow_type: 'chained_tasks',
                  chain_name: chainName,
                  completed_step_index: currentStepIndex,
                  completed_step_title: targetTask.title,
                  next_step_index: nextStepIndex,
                  next_step_title: nextStep.title,
                  new_todoist_id: newTodoistId,
                  completed_at: now,
                },
              });
            }

            if (chainConfig.chain_id) {
              await supabaseAdmin
                .from('workflows')
                .update({
                  config: {
                    ...(chainConfig || {}),
                    current_step_index: nextStepIndex,
                  },
                  updated_at: now,
                })
                .eq('id', chainConfig.chain_id);
            }
          } else {
            // Final step in the chain completed!
            if (loop) {
              // Loop back to Step 0
              const firstStep = steps[0];
              let createdFirst = null;
              try {
                createdFirst = await createTodoistTask({
                  content: firstStep.title,
                  description: firstStep.description || undefined,
                  priority: firstStep.priority || 1,
                  project_id: targetTask.todoist_project_id || undefined,
                  labels: ['freeflow-habit', 'chained-task'],
                });
                newTodoistId = String(createdFirst.id);
              } catch (err: any) {
                console.error('[WorkflowEngine] Failed to loop chained task in Todoist:', err);
              }

              const nextConfig = {
                ...chainConfig,
                step_index: 0,
              };
              delete nextConfig.scheduled_recreate_at;

              await supabaseAdmin
                .from('tasks')
                .update({
                  title: firstStep.title,
                  description: firstStep.description || null,
                  priority: firstStep.priority || 1,
                  todoist_id: newTodoistId || null,
                  status: 'pending',
                  last_completed_at: now,
                  streak_count: newStreak,
                  updated_at: now,
                  workflow_config: nextConfig,
                })
                .eq('id', targetTask.id);

              actionTaken = `Final step ${steps.length}/${steps.length} completed for chain "${chainName}"! Loop is active; restarted at Step 1: "${firstStep.title}" in Todoist.`;

              await supabaseAdmin.from('workflow_runs').insert({
                workflow_id: chainConfig.chain_id || null,
                task_id: targetTask.id,
                trigger_event: eventName,
                status: 'success',
                details: {
                  workflow_type: 'chained_tasks',
                  chain_name: chainName,
                  action: 'chain_looped',
                  restarted_step: firstStep.title,
                  completed_at: now,
                },
              });
            } else {
              // Chain finished completely
              await supabaseAdmin
                .from('tasks')
                .update({
                  status: 'completed',
                  last_completed_at: now,
                  streak_count: newStreak,
                  updated_at: now,
                  workflow_config: {
                    ...chainConfig,
                    step_index: steps.length,
                    status: 'completed',
                  },
                })
                .eq('id', targetTask.id);

              actionTaken = `Completed all ${steps.length} steps in chain "${chainName}"! Chain workflow complete.`;

              await supabaseAdmin.from('workflow_runs').insert({
                workflow_id: chainConfig.chain_id || null,
                task_id: targetTask.id,
                trigger_event: eventName,
                status: 'success',
                details: {
                  workflow_type: 'chained_tasks',
                  chain_name: chainName,
                  action: 'chain_completed',
                  total_steps: steps.length,
                  completed_at: now,
                },
              });

              if (chainConfig.chain_id) {
                await supabaseAdmin
                  .from('workflows')
                  .update({
                    config: {
                      ...(chainConfig || {}),
                      current_step_index: steps.length,
                      status: 'completed',
                    },
                    updated_at: now,
                  })
                  .eq('id', chainConfig.chain_id);
              }
            }
          }
        } else if (isRepeatedTask) {
          // Increment streak
          newStreak = (targetTask.streak_count || 0) + 1;
          const now = new Date().toISOString();

          // Check Delay parameter
          const delayConfig = targetTask.workflow_config?.delay;
          const scheduledRecreateTime = calculateScheduledRecreationTime(delayConfig);

          if (scheduledRecreateTime && scheduledRecreateTime.getTime() > Date.now()) {
            // DELAYED RECREATION: Task will be recreated after the specified delay
            scheduledRecreateAt = scheduledRecreateTime.toISOString();

            let delayDesc = 'after delay';
            if (delayConfig?.mode === 'after_hours') {
              delayDesc = `after ${delayConfig.hours} hour${Number(delayConfig.hours) === 1 ? '' : 's'}`;
            } else if (delayConfig?.mode === 'tomorrow_at') {
              delayDesc = `tomorrow at ${delayConfig.time || '09:00'}`;
            } else if (delayConfig?.mode === 'exact_datetime') {
              delayDesc = `at ${delayConfig.datetime}`;
            }

            actionTaken = `Task "${targetTask.title}" completed! Streak is now ${newStreak}. Scheduled to recreate in Todoist ${delayDesc} (at ${scheduledRecreateTime.toLocaleString()}).`;

            const updatePayload: Partial<Task> = {
              streak_count: newStreak,
              last_completed_at: now,
              todoist_id: null, // Clear current Todoist ID until recreated
              status: 'pending',
              updated_at: now,
              workflow_config: {
                ...(targetTask.workflow_config || {}),
                scheduled_recreate_at: scheduledRecreateAt,
              },
            };

            await supabaseAdmin.from('tasks').update(updatePayload).eq('id', targetTask.id);

            await supabaseAdmin.from('workflow_runs').insert({
              task_id: targetTask.id,
              trigger_event: eventName,
              status: 'success',
              details: {
                task_title: targetTask.title,
                previous_todoist_id: todoistId,
                streak: newStreak,
                workflow_type: 'repeated_tasks',
                delay_config: delayConfig,
                scheduled_recreate_at: scheduledRecreateAt,
                completed_at: now,
              },
            });
          } else {
            // IMMEDIATE RECREATION (Delay = Immediately or 0)
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

            const nextConfig = { ...(targetTask.workflow_config || {}) };
            delete nextConfig.scheduled_recreate_at;

            const updatePayload: Partial<Task> = {
              streak_count: newStreak,
              last_completed_at: now,
              status: 'pending',
              updated_at: now,
              workflow_config: nextConfig,
            };

            if (newTodoistId) {
              updatePayload.todoist_id = newTodoistId;
              actionTaken = `Task "${targetTask.title}" completed! Streak is now ${newStreak}. Immediately recreated in Todoist with ID ${newTodoistId}.`;
            } else {
              actionTaken = `Task completed! Streak updated to ${newStreak}. (Todoist recreation skipped/failed)`;
            }

            await supabaseAdmin.from('tasks').update(updatePayload).eq('id', targetTask.id);

            await supabaseAdmin.from('workflow_runs').insert({
              task_id: targetTask.id,
              trigger_event: eventName,
              status: newTodoistId ? 'success' : 'failed',
              details: {
                task_title: targetTask.title,
                previous_todoist_id: todoistId,
                new_todoist_id: newTodoistId,
                streak: newStreak,
                workflow_type: 'repeated_tasks',
                delay_mode: 'immediately',
                completed_at: now,
              },
            });
          }
        } else {
          // Standard completion without recreation (e.g. streak_only or none)
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
