import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { completeTodoistTask, deleteTodoistTask } from '@/lib/todoist';

export const runtime = 'edge';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await req.json();

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ task: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;

    // Fetch existing task to get todoist_id if present
    const { data: existingTask } = await supabaseAdmin
      .from('tasks')
      .select('todoist_id')
      .eq('id', id)
      .maybeSingle();

    if (existingTask?.todoist_id) {
      try {
        await deleteTodoistTask(existingTask.todoist_id);
      } catch (e) {
        console.warn('Could not delete in Todoist:', e);
      }
    }

    const { error } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
