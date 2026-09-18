import { NextRequest, NextResponse } from 'next/server';
import {
  getTodoistToken,
  saveTodoistToken,
  getTodoistClientId,
  saveTodoistClientId,
  getTodoistClientSecret,
  saveTodoistClientSecret,
} from '@/lib/todoist';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET() {
  try {
    const token = await getTodoistToken();
    const clientId = await getTodoistClientId();
    const clientSecret = await getTodoistClientSecret();
    const hasEnvToken = Boolean(process.env.TODOIST_API_TOKEN);

    // Test token if available
    let isValid = false;

    if (token) {
      try {
        const res = await fetch('https://api.todoist.com/api/v1/projects', {
          headers: { Authorization: `Bearer ${token}` },
        });
        isValid = res.ok;
      } catch (_) {
        isValid = false;
      }
    }

    // Check if OAuth authorization event exists in webhook_logs
    let hasOAuthRecord = false;
    try {
      const { data } = await supabaseAdmin
        .from('webhook_logs')
        .select('id')
        .eq('event_name', 'oauth:authorized')
        .limit(1)
        .maybeSingle();
      hasOAuthRecord = Boolean(data);
    } catch (_) {}

    return NextResponse.json({
      hasToken: Boolean(token),
      hasEnvToken,
      isValid,
      maskedToken: token ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}` : null,
      hasClientId: Boolean(clientId),
      clientId: clientId || '',
      hasClientSecret: Boolean(clientSecret),
      maskedClientSecret: clientSecret
        ? `${clientSecret.substring(0, 4)}...${clientSecret.substring(clientSecret.length - 4)}`
        : null,
      isOAuthActive: hasOAuthRecord || (Boolean(clientId) && isValid),
      webhookEndpoint: '/api/webhooks/todoist',
      oauthRedirectEndpoint: '/api/auth/callback',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, clientId, clientSecret } = body;

    let message = '';

    if (token !== undefined) {
      if (!token || !token.trim()) {
        return NextResponse.json({ error: 'Token cannot be empty' }, { status: 400 });
      }

      const cleanToken = token.trim();

      // Verify token with Todoist
      const res = await fetch('https://api.todoist.com/api/v1/projects', {
        headers: { Authorization: `Bearer ${cleanToken}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json(
          { error: `Invalid Todoist API token (HTTP ${res.status}): ${errText || 'Todoist rejected credentials.'}` },
          { status: 400 }
        );
      }

      await saveTodoistToken(cleanToken);
      message += 'Todoist API token saved and verified. ';
    }

    if (clientId !== undefined) {
      await saveTodoistClientId(clientId.trim());
      message += 'Client ID saved. ';
    }

    if (clientSecret !== undefined && clientSecret.trim()) {
      await saveTodoistClientSecret(clientSecret.trim());
      message += 'Client Secret saved. ';
    }

    return NextResponse.json({
      success: true,
      message: message.trim() || 'Settings saved successfully!',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
