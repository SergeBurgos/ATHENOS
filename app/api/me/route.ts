import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/auth';
import { isAdminEmail } from '@/lib/billing';

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedClient(request);

    return NextResponse.json({
      authenticated: !!user,
      isAdmin: isAdminEmail(user?.email),
    });
  } catch (err) {
    return NextResponse.json({ authenticated: false, isAdmin: false });
  }
}
