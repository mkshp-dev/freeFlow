import { NextRequest, NextResponse } from 'next/server';
import { processTodoistWebhookEvent } from '@/lib/workflow-engine';
import { completeTodoistTask } from '@/lib/todoist';
import { TodoistWebhookEvent } from '@/types';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId, todoistId, title, closeInTodoist } = body;

    if (!title && !todoistId) {
      return NextResponse.json(
        { error: 'Provide at least a title or todoistId to simulate' },
        { status: 400 }
      );
    }

    // Optionally actually complete it in Todoist if requested and token is present
    if (closeInTodoist && todoistId) {
      try {
        await completeTodoistTask(todoistId);
      } catch (e: any) {
        console.warn('Simulation note: Could not close task in Todoist API:', e.message);
      }
    }

    // Construct synthetic Todoist webhook payload
    const syntheticWebhook: TodoistWebhookEvent = {
      event_name: 'item:completed',
      user_id: 'simulator-user',
      event_data: {
        id: todoistId || 'simulated-id-' + Date.now(),
        content: title || 'Simulated Task',
        is_completed: true,
        checked: 1,
      },
    };

    const result = await processTodoistWebhookEvent(syntheticWebhook, 'simulator');

    return NextResponse.json({
      success: true,
      simulatedPayload: syntheticWebhook,
      result,
    });
  } catch (error: any) {
    console.error('Error during webhook simulation:', error);
    return NextResponse.json(
      { error: error.message || 'Simulation failed' },
      { status: 500 }
    );
  }
}
