import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createTodoistTask, getTodoistToken } from '@/lib/todoist';

export const runtime = 'edge';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

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
    const { title, description, priority = 1, workflow_type = 'immediate_recreate', sync_with_todoist = true } = body;

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
        workflow_config: { auto_sync: true },
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
