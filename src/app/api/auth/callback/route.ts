import { NextRequest, NextResponse } from 'next/server';
import { exchangeTodoistOAuthCode } from '@/lib/todoist';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin = req.nextUrl.origin;

  if (error) {
    console.error('Todoist OAuth returned error:', error);
    return NextResponse.redirect(`${origin}/?oauth=error&error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?oauth=error&error=No+authorization+code+provided`);
  }

  try {
    const redirectUri = `${origin}/api/auth/callback`;
    await exchangeTodoistOAuthCode(code, redirectUri);
    return NextResponse.redirect(`${origin}/?oauth=success`);
  } catch (err: any) {
    console.error('Failed to exchange Todoist authorization code:', err);
    // Try once without redirect_uri if Todoist rejected matching uri
    try {
      await exchangeTodoistOAuthCode(code);
      return NextResponse.redirect(`${origin}/?oauth=success`);
    } catch (fallbackErr: any) {
      return NextResponse.redirect(
        `${origin}/?oauth=error&error=${encodeURIComponent(fallbackErr.message || err.message)}`
      );
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, clientId, clientSecret, redirectUri } = body;

    if (!code) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const data = await exchangeTodoistOAuthCode(code, redirectUri, clientId, clientSecret);

    return NextResponse.json({
      success: true,
      message: 'Todoist OAuth App successfully linked and installed! Webhooks are now active.',
      token_type: data.token_type,
    });
  } catch (err: any) {
    console.error('API exchange error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
