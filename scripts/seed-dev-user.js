/**
 * scripts/seed-dev-user.js
 * Creates or resets the development test user in Supabase with pre-confirmed email.
 * Run with: npm run seed:dev
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Helper to parse .env file
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return {};
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      val = val.replace(/^["']|["']$/g, '');
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env or environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seed() {
  const email = 'dev@freeflow.dev';
  const password = 'freeflow2026';

  console.log(`Checking if dev user "${email}" exists...`);
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Failed to list users:', listErr.message);
    process.exit(1);
  }

  const existing = listData.users.find((u) => u.email === email);

  if (existing) {
    console.log(`User already exists (ID: ${existing.id}). Updating password and ensuring email confirmation...`);
    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { role: 'developer', name: 'Dev User' },
    });
    if (updateErr) {
      console.error('❌ Failed to update dev user:', updateErr.message);
      process.exit(1);
    }
    console.log('✅ Dev user updated successfully!');
  } else {
    console.log(`Creating new dev user "${email}"...`);
    const { data: createData, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'developer', name: 'Dev User' },
    });
    if (createErr) {
      console.error('❌ Failed to create dev user:', createErr.message);
      process.exit(1);
    }
    console.log('✅ Dev user created successfully! ID:', createData.user.id);
  }

  console.log('\n--- Dev Credentials ---');
  console.log('Email:   ', email);
  console.log('Password:', password);
  console.log('-----------------------\n');
}

seed();
