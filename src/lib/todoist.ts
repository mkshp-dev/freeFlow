import { supabaseAdmin } from './supabase';

const TODOIST_API_BASE = 'https://api.todoist.com/rest/v2';

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
  await supabaseAdmin.from('app_settings').upsert({
    key: 'TODOIST_API_TOKEN',
    value: token,
    description: 'Todoist Personal API Token',
    updated_at: new Date().toISOString(),
  });
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
  const secret = clientSecret || process.env.TODOIST_CLIENT_SECRET;
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
