import { NextRequest, NextResponse } from 'next/server';
import { processTodoistWebhookEvent } from '@/lib/workflow-engine';
import { verifyTodoistWebhookSignature } from '@/lib/todoist';
import { supabaseAdmin } from '@/lib/supabase';
import { TodoistWebhookEvent } from '@/types';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-todoist-hmac-sha256');

    // Verify signature if secret is provided
    const isValid = await verifyTodoistWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn('⚠️ Invalid Todoist webhook HMAC signature.');
      // Record failed security check in webhook_logs for full visibility
      try {
        await supabaseAdmin.from('webhook_logs').insert({
          event_name: 'webhook:unauthorized',
          source: 'todoist_webhook',
          payload: {
            preview: rawBody.slice(0, 300),
            signatureHeader: signature,
          },
          processed_status: 'failed',
          action_taken: 'Rejected webhook: Invalid HMAC signature.',
        });
      } catch (_) {}

      return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
    }

    let payload: TodoistWebhookEvent;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      try {
        await supabaseAdmin.from('webhook_logs').insert({
          event_name: 'webhook:malformed',
          source: 'todoist_webhook',
          payload: { preview: rawBody.slice(0, 300) },
          processed_status: 'failed',
          action_taken: 'Rejected webhook: Malformed JSON payload.',
        });
      } catch (_) {}

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
