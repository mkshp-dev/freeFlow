import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createTodoistTask, getTodoistToken } from '@/lib/todoist';
import { ChainStep } from '@/types';

export const runtime = 'edge';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message, workflows: [] }, { status: 200 });
    }

    return NextResponse.json({ workflows: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, workflows: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      description,
      trigger_event = 'item:completed',
      action_type = 'recreate_task',
      config = {},
      is_active = true,
      steps = [],
      loop = false,
      user_id = null,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Workflow name is required' }, { status: 400 });
    }

    if (action_type === 'chained_tasks') {
      const parsedSteps: ChainStep[] = Array.isArray(steps) ? steps : config.steps || [];
      if (parsedSteps.length < 2) {
        return NextResponse.json(
          { error: 'Chained tasks workflow requires at least 2 sequential steps' },
          { status: 400 }
        );
      }

      // 1. Insert workflow definition
      const { data: workflow, error: wfError } = await supabaseAdmin
        .from('workflows')
        .insert({
          name: name.trim(),
          description:
            description ||
            `Sequential pipeline (${parsedSteps.length} steps): ${parsedSteps.map((s) => s.title).join(' → ')}`,
          trigger_event: 'item:completed',
          action_type: 'chained_tasks',
          is_active: true,
          config: {
            chain_name: name.trim(),
            steps: parsedSteps,
            current_step_index: 0,
            loop: Boolean(loop),
            status: 'active',
          },
        })
        .select()
        .single();

      if (wfError || !workflow) {
        return NextResponse.json({ error: wfError?.message || 'Failed to create workflow' }, { status: 500 });
      }

      // 2. Spawn the FIRST task in Todoist
      const firstStep = parsedSteps[0];
      let todoistId: string | null = null;
      let todoistWarning: string | null = null;

      const todoistToken = await getTodoistToken();
      if (todoistToken) {
        try {
          const created = await createTodoistTask({
            content: firstStep.title,
            description: firstStep.description || undefined,
            priority: firstStep.priority || 1,
            labels: ['freeflow-habit', 'chained-task'],
          });
          todoistId = String(created.id);
        } catch (err: any) {
          console.error('[API/workflows] Failed to create first step in Todoist:', err);
          todoistWarning = `Workflow created, but initial Todoist task sync failed: ${err.message}`;
        }
      } else {
        todoistWarning = 'Todoist token not configured. First task created locally only.';
      }

      // 3. Create active task in freeFlow tasks table
      const { data: initialTask, error: taskError } = await supabaseAdmin
        .from('tasks')
        .insert({
          title: firstStep.title,
          description: firstStep.description || null,
          priority: firstStep.priority || 1,
          status: 'pending',
          todoist_id: todoistId,
          streak_count: 0,
          workflow_type: 'chained_tasks',
          workflow_config: {
            chain_id: workflow.id,
            chain_name: name.trim(),
            step_index: 0,
            total_steps: parsedSteps.length,
            steps: parsedSteps,
            loop: Boolean(loop),
          },
          user_id: user_id || null,
        })
        .select()
        .single();

      // 4. Log initial launch run
      await supabaseAdmin.from('workflow_runs').insert({
        workflow_id: workflow.id,
        task_id: initialTask?.id || null,
        trigger_event: 'chain_initialized',
        status: 'success',
        details: {
          action: 'chain_started',
          chain_name: name.trim(),
          first_step: firstStep.title,
          total_steps: parsedSteps.length,
          todoist_id: todoistId,
        },
      });

      return NextResponse.json({
        workflow,
        task: initialTask,
        todoistId,
        warning: todoistWarning,
      });
    }

    // Standard workflow insertion
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .insert({
        name: name.trim(),
        description,
        trigger_event: trigger_event || 'item:completed',
        action_type: action_type || 'recreate_task',
        config: config || {},
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ workflow: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Workflow id is required' }, { status: 400 });
    }

    // Delete related active tasks for this chain
    await supabaseAdmin
      .from('tasks')
      .update({ status: 'archived' })
      .eq('workflow_config->>chain_id', id);

    // Delete workflow record
    const { error } = await supabaseAdmin
      .from('workflows')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
