import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/billing';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    return NextResponse.json({
      authenticated: !!user,
      isAdmin: isAdminEmail(user?.email),
    });
  } catch (err) {
    return NextResponse.json({ authenticated: false, isAdmin: false });
  }
}
