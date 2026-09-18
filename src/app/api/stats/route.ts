import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET() {
  try {
    // 1. Get task count and streak sums
    const { data: tasks, error: tasksError } = await supabaseAdmin
      .from('tasks')
      .select('id, status, streak_count');

    // 2. Get webhook count
    const { count: webhookCount, error: webhookError } = await supabaseAdmin
      .from('webhook_logs')
      .select('*', { count: 'exact', head: true });

    // 3. Get workflow count
    const { count: workflowsCount } = await supabaseAdmin
      .from('workflows')
      .select('*', { count: 'exact', head: true });

    const taskList = tasks || [];
    const totalTasks = taskList.length;
    const completedTasks = taskList.filter(t => t.status === 'completed').length;
    const totalCompletions = taskList.reduce((acc, curr) => acc + (curr.streak_count || 0), 0);
    const highestStreak = taskList.reduce((max, curr) => Math.max(max, curr.streak_count || 0), 0);

    return NextResponse.json({
      totalTasks,
      completedTasks,
      totalCompletions,
      highestStreak,
      webhookCount: webhookCount || 0,
      workflowsCount: workflowsCount || 1,
      hasDbTables: !tasksError && !webhookError,
    });
  } catch (err: any) {
    return NextResponse.json({
      totalTasks: 0,
      completedTasks: 0,
      totalCompletions: 0,
      highestStreak: 0,
      webhookCount: 0,
      workflowsCount: 0,
      hasDbTables: false,
      error: err.message,
    });
  }
}
