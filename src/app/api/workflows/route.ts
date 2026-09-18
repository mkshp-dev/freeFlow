import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message, workflows: [] }, { status: 200 });
    }

    return NextResponse.json({ workflows: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, workflows: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, trigger_event, action_type, config, is_active } = body;

    const { data, error } = await supabaseAdmin
      .from('workflows')
      .insert({
        name,
        description,
        trigger_event: trigger_event || 'item:completed',
        action_type: action_type || 'recreate_task',
        config: config || {},
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ workflow: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
