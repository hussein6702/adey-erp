import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { supabase } from '@/lib/supabase';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-here-123456');

export async function GET(req) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('adey_auth_token')?.value;

    if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Fetch dynamic module visibility
    let visibleModules = [];
    if (payload.role === 'Root') {
      // Root sees everything
      visibleModules = ['ALL'];
    } else {
      const { data } = await supabase
        .from('module_permissions')
        .select('module_name')
        .eq('department', payload.department)
        .eq('is_visible', true);
        
      if (data) visibleModules = data.map(d => d.module_name);
    }

    return NextResponse.json({
      authenticated: true,
      user: payload,
      visibleModules
    });
  } catch (err) {
    return NextResponse.json({ authenticated: false, error: 'Invalid token' }, { status: 401 });
  }
}
