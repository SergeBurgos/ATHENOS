'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setError(null)
      const supabase = createClient()

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) throw error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-full max-w-md p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-serif text-amber-500">Athenos</h1>
          <p className="mt-2 text-gray-400">Sign in to continue</p>
        </div>

        {error && (
          <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 px-4 bg-white text-black font-medium rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Signing in...' : 'Continue with Google'}
        </button>

        <p className="text-center text-xs text-gray-500">
          By signing in you agree to our terms.
        </p>
      </div>
    </div>
  )
}
