import { createClient, createClientFromToken } from './supabase/server'
import { NextRequest } from 'next/server'

export async function getAuthenticatedClient(req: NextRequest) {
  const authHeader = req.headers.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = createClientFromToken(token)
    const { data: { user }, error } = await supabase.auth.getUser()
    return { supabase, user, error }
  }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user, error }
}
