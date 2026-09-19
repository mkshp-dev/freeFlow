import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createTodoistTask, getTodoistToken } from '@/lib/todoist';
import { processDueDelayedTasks } from '@/lib/workflow-engine';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  try {
    // Process any delayed tasks that are now due for recreation
    try {
      await processDueDelayedTasks();
    } catch (e: any) {
      console.warn('Error checking due delayed tasks:', e.message);
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    let query = supabaseAdmin
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message, tasks: [] }, { status: 200 });
    }

    return NextResponse.json({ tasks: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, tasks: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      description,
      priority = 1,
      workflow_type = 'repeated_tasks',
      workflow_config = {},
      sync_with_todoist = true,
      user_id = null,
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Task title is required' }, { status: 400 });
    }

    let todoistId: string | null = null;
    let todoistWarning: string | null = null;

    // Check if user has configured Todoist
    const todoistToken = await getTodoistToken();

    if (sync_with_todoist && todoistToken) {
      try {
        const createdTodoistTask = await createTodoistTask({
          content: title.trim(),
          description: description || undefined,
          priority: Number(priority) || 1,
          labels: ['freeflow-habit'],
        });
        todoistId = String(createdTodoistTask.id);
      } catch (err: any) {
        console.error('Failed to create in Todoist:', err.message);
        todoistWarning = `Saved to freeFlow DB, but Todoist sync failed: ${err.message}`;
      }
    } else if (sync_with_todoist && !todoistToken) {
      todoistWarning = 'Todoist API token is not yet configured. Task created locally only.';
    }

    // Insert task into Supabase
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        title: title.trim(),
        description: description || null,
        status: 'pending',
        todoist_id: todoistId,
        priority: Number(priority) || 1,
        streak_count: 0,
        workflow_type,
        workflow_config: { auto_sync: true, ...workflow_config },
        user_id: user_id || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      task: data,
      todoistId,
      warning: todoistWarning,
      syncedWithTodoist: Boolean(todoistId),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, action } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    if (action === 'recreate_now') {
      const { data: task, error: fetchErr } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (fetchErr || !task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }

      // Immediately spawn in Todoist
      const created = await createTodoistTask({
        content: task.title,
        description: task.description || undefined,
        project_id: task.todoist_project_id || undefined,
        priority: task.priority || 1,
        labels: ['freeflow-habit'],
      });

      const nextConfig = { ...(task.workflow_config || {}) };
      delete nextConfig.scheduled_recreate_at;

      await supabaseAdmin
        .from('tasks')
        .update({
          todoist_id: String(created.id),
          workflow_config: nextConfig,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      return NextResponse.json({ success: true, todoistId: String(created.id) });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
