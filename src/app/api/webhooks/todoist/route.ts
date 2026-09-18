import { NextRequest, NextResponse } from 'next/server';
import { processTodoistWebhookEvent } from '@/lib/workflow-engine';
import { verifyTodoistWebhookSignature } from '@/lib/todoist';
import { TodoistWebhookEvent } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-todoist-hmac-sha256');

    // Verify signature if secret is provided in environment
    const isValid = verifyTodoistWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('⚠️ Invalid Todoist webhook HMAC signature.');
      return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
    }

    let payload: TodoistWebhookEvent;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const result = await processTodoistWebhookEvent(payload, 'todoist_webhook');

    return NextResponse.json({
      status: 'received',
      result,
    });
  } catch (error: any) {
    console.error('Error handling Todoist webhook:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/todoist',
    message: 'Todoist webhook endpoint is live and accepting POST events.',
  });
}
