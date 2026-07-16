import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const corsAllowedOrigins = (process.env.CORS_ALLOW_ORIGIN || 'http://localhost:5173,https://app.getathenos.com')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  const allowed = corsAllowedOrigins.includes('*')
    ? origin
    : corsAllowedOrigins.find(o => o === origin)

  if (!origin || !allowed) return {}

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}

export async function proxy(request: NextRequest) {
  // Handle CORS preflight (OPTIONS) — return immediately, no Supabase call
  if (request.method === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(request)
    return new NextResponse(null, { status: 204, headers: corsHeaders })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Add CORS headers to every response (no-op for same-origin requests)
  const corsHeaders = getCorsHeaders(request)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    supabaseResponse.headers.set(key, value)
  })

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
