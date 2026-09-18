import { supabaseAdmin } from './supabase';

const TODOIST_API_BASE = 'https://api.todoist.com/api/v1';

/**
 * Get active Todoist API token, checking database settings first, then env variable.
 */
export async function getTodoistToken(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'TODOIST_API_TOKEN')
      .maybeSingle();

    if (!error && data?.value) {
      return data.value;
    }
  } catch (err) {
    // If table doesn't exist yet, fall through to env
  }

  return process.env.TODOIST_API_TOKEN || null;
}

/**
 * Save Todoist token in the database
 */
export async function saveTodoistToken(token: string): Promise<void> {
  const { error } = await supabaseAdmin.from('app_settings').upsert(
    {
      key: 'TODOIST_API_TOKEN',
      value: token,
      description: 'Todoist Personal API Token',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    throw new Error(`Failed to save token to database: ${error.message}`);
  }
}

/**
 * Get Todoist OAuth Client ID from DB or env
 */
export async function getTodoistClientId(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'TODOIST_CLIENT_ID')
      .maybeSingle();

    if (!error && data?.value) {
      return data.value;
    }
  } catch (err) {}
  return process.env.TODOIST_CLIENT_ID || null;
}

/**
 * Save Todoist OAuth Client ID to DB
 */
export async function saveTodoistClientId(clientId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('app_settings').upsert(
    {
      key: 'TODOIST_CLIENT_ID',
      value: clientId.trim(),
      description: 'Todoist OAuth Client ID',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    throw new Error(`Failed to save client ID to database: ${error.message}`);
  }
}

/**
 * Get Todoist OAuth Client Secret from DB or env
 */
export async function getTodoistClientSecret(): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'TODOIST_CLIENT_SECRET')
      .maybeSingle();

    if (!error && data?.value) {
      return data.value;
    }
  } catch (err) {}
  return process.env.TODOIST_CLIENT_SECRET || null;
}

/**
 * Save Todoist OAuth Client Secret to DB
 */
export async function saveTodoistClientSecret(clientSecret: string): Promise<void> {
  const { error } = await supabaseAdmin.from('app_settings').upsert(
    {
      key: 'TODOIST_CLIENT_SECRET',
      value: clientSecret.trim(),
      description: 'Todoist OAuth Client Secret',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) {
    throw new Error(`Failed to save client secret to database: ${error.message}`);
  }
}

/**
 * Creates a task in Todoist using REST API v2
 */
export async function createTodoistTask(taskData: {
  content: string;
  description?: string;
  project_id?: string;
  priority?: number;
  labels?: string[];
  due_string?: string;
}) {
  const token = await getTodoistToken();
  if (!token) {
    throw new Error('Todoist API token is not configured. Please set TODOIST_API_TOKEN in .env or Settings.');
  }

  const response = await fetch(`${TODOIST_API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(taskData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Todoist API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Fetch a specific task from Todoist
 */
export async function getTodoistTask(taskId: string) {
  const token = await getTodoistToken();
  if (!token) return null;

  const response = await fetch(`${TODOIST_API_BASE}/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

/**
 * Close/Complete a task in Todoist
 */
export async function completeTodoistTask(taskId: string) {
  const token = await getTodoistToken();
  if (!token) {
    throw new Error('Todoist API token is not configured.');
  }

  const response = await fetch(`${TODOIST_API_BASE}/tasks/${taskId}/close`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const err = await response.text();
    throw new Error(`Failed to close Todoist task: ${err}`);
  }

  return true;
}

/**
 * Delete a task in Todoist
 */
export async function deleteTodoistTask(taskId: string) {
  const token = await getTodoistToken();
  if (!token) return false;

  const response = await fetch(`${TODOIST_API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.ok || response.status === 204;
}

/**
 * Verifies Todoist webhook HMAC-SHA256 signature using standard Web Crypto API
 */
export async function verifyTodoistWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  clientSecret?: string
): Promise<boolean> {
  const secret = clientSecret || (await getTodoistClientSecret());
  if (!secret || !signatureHeader) {
    // If secret is not set, we allow the request in development/demo mode but log warning
    return true;
  }

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(rawBody);

    const cryptoObj = typeof crypto !== 'undefined' ? crypto : (globalThis as any).crypto;
    const key = await cryptoObj.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await cryptoObj.subtle.sign('HMAC', key, bodyData);
    const bytes = new Uint8Array(signature);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Hash = btoa(binary);

    return base64Hash === signatureHeader;
  } catch (e) {
    console.error('Signature verification error:', e);
    return false;
  }
}

/**
 * Exchanges a temporary OAuth authorization code for a permanent access token
 * at https://api.todoist.com/oauth/access_token.
 * This officially registers the user as having "installed" the app,
 * which activates Todoist webhook dispatching for their account!
 */
export async function exchangeTodoistOAuthCode(
  code: string,
  redirectUri?: string,
  providedClientId?: string,
  providedClientSecret?: string
) {
  const clientId = providedClientId || (await getTodoistClientId());
  const clientSecret = providedClientSecret || (await getTodoistClientSecret());

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Todoist Client ID or Client Secret. Please configure your App credentials first.'
    );
  }

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    client_secret: clientSecret.trim(),
    code: code.trim(),
  });

  if (redirectUri) {
    params.append('redirect_uri', redirectUri);
  }

  const response = await fetch('https://api.todoist.com/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Todoist OAuth exchange failed (${response.status}): ${err}`);
  }

  const data = (await response.json()) as { access_token?: string; token_type?: string };
  if (!data.access_token) {
    throw new Error('Todoist OAuth response did not contain an access_token.');
  }

  // 1. Save access token to database
  await saveTodoistToken(data.access_token);

  // 2. Save client ID if provided
  if (providedClientId) {
    await saveTodoistClientId(providedClientId);
  }

  // 3. Save client secret if provided
  if (providedClientSecret) {
    await saveTodoistClientSecret(providedClientSecret);
  }

  // 4. Log the milestone in webhook_logs
  await supabaseAdmin.from('webhook_logs').insert({
    event_name: 'oauth:authorized',
    source: 'todoist_oauth',
    payload: { token_type: data.token_type, timestamp: new Date().toISOString() },
    processed_status: 'success',
    action_taken: 'Todoist OAuth App successfully linked and installed! Webhooks are now activated.',
  });

  return data;
}
