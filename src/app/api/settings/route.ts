import { NextRequest, NextResponse } from 'next/server';
import { getTodoistToken, saveTodoistToken } from '@/lib/todoist';

export const runtime = 'edge';

export async function GET() {
  try {
    const token = await getTodoistToken();
    const hasEnvToken = Boolean(process.env.TODOIST_API_TOKEN);

    // Test token if available
    let isValid = false;
    let userInfo = null;

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

    return NextResponse.json({
      hasToken: Boolean(token),
      hasEnvToken,
      isValid,
      maskedToken: token ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}` : null,
      webhookEndpoint: '/api/webhooks/todoist',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

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

    return NextResponse.json({
      success: true,
      message: 'Todoist API token saved and verified successfully!',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
