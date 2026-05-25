'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  // Google OAuth state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Email/password state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  const supabase = createClient()

  const handleGoogleLogin = async () => {
    try {
      setLoading(true)
      setError(null)

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

  const handleLogin = async () => {
    setAuthError(null)
    if (!email || !password) { setAuthError('Email y contraseña requeridos.'); return }
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setAuthLoading(false)
    if (error) { setAuthError(error.message); return }
    router.push('/')
  }

  const handleSignup = async () => {
    setAuthError(null)
    if (!email || !password) { setAuthError('Email y contraseña requeridos.'); return }
    if (password.length < 6) { setAuthError('La contraseña debe tener al menos 6 caracteres.'); return }
    setAuthLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    setAuthLoading(false)
    if (error) { setAuthError(error.message); return }
    // With email confirmation OFF, the user is signed in immediately
    router.push('/')
  }

  const busy = authLoading || loading

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0806',
      color: '#f5f0e7',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: '380px', padding: '0 24px' }}>

        {/* Logo + heading */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: '#C9A035', margin: 0 }}>Athenos</h1>
          <p style={{ marginTop: '6px', fontSize: '0.85rem', color: 'rgba(245,240,231,0.45)' }}>
            {mode === 'login' ? 'Inicia sesión para continuar' : 'Crea tu cuenta'}
          </p>
        </div>

        {/* Google error */}
        {error && (
          <div style={{
            marginBottom: '16px',
            padding: '10px 14px',
            background: 'rgba(180,50,50,0.18)',
            border: '1px solid rgba(220,80,80,0.4)',
            borderRadius: '8px',
            fontSize: '0.82rem',
            color: '#f9a8a8',
          }}>
            {error}
          </div>
        )}

        {/* Google button */}
        <button
          onClick={handleGoogleLogin}
          disabled={busy}
          style={{
            width: '100%',
            padding: '11px 16px',
            background: busy ? 'rgba(255,255,255,0.08)' : '#ffffff',
            color: '#111',
            fontWeight: 500,
            fontSize: '0.9rem',
            borderRadius: '8px',
            border: 'none',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'opacity 0.15s',
          }}
        >
          {/* Google G icon */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          {loading ? 'Redirigiendo...' : 'Continuar con Google'}
        </button>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          margin: '24px 0',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(201,160,53,0.18)' }} />
          <span style={{ fontSize: '0.75rem', color: 'rgba(245,240,231,0.3)', letterSpacing: '0.05em' }}>o</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(201,160,53,0.18)' }} />
        </div>

        {/* Email/password error */}
        {authError && (
          <div style={{
            marginBottom: '14px',
            padding: '10px 14px',
            background: 'rgba(180,50,50,0.18)',
            border: '1px solid rgba(220,80,80,0.4)',
            borderRadius: '8px',
            fontSize: '0.82rem',
            color: '#f9a8a8',
          }}>
            {authError}
          </div>
        )}

        {/* Email input */}
        <input
          type="email"
          placeholder="Correo electrónico"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={busy}
          style={{
            width: '100%',
            padding: '11px 14px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(201,160,53,0.25)',
            borderRadius: '8px',
            color: '#f5f0e7',
            fontSize: '0.9rem',
            outline: 'none',
            marginBottom: '10px',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(201,160,53,0.6)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(201,160,53,0.25)')}
        />

        {/* Password input */}
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={busy}
          onKeyDown={e => { if (e.key === 'Enter') mode === 'login' ? handleLogin() : handleSignup() }}
          style={{
            width: '100%',
            padding: '11px 14px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(201,160,53,0.25)',
            borderRadius: '8px',
            color: '#f5f0e7',
            fontSize: '0.9rem',
            outline: 'none',
            marginBottom: '14px',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(201,160,53,0.6)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(201,160,53,0.25)')}
        />

        {/* Primary action button */}
        <button
          onClick={mode === 'login' ? handleLogin : handleSignup}
          disabled={busy}
          style={{
            width: '100%',
            padding: '11px 16px',
            background: busy ? 'rgba(201,160,53,0.25)' : 'rgba(201,160,53,0.15)',
            border: '1px solid rgba(201,160,53,0.45)',
            borderRadius: '8px',
            color: '#C9A035',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.7 : 1,
            transition: 'background 0.15s, opacity 0.15s',
            marginBottom: '16px',
          }}
          onMouseEnter={e => { if (!busy) (e.currentTarget.style.background = 'rgba(201,160,53,0.25)') }}
          onMouseLeave={e => { if (!busy) (e.currentTarget.style.background = 'rgba(201,160,53,0.15)') }}
        >
          {authLoading
            ? (mode === 'login' ? 'Iniciando sesión...' : 'Creando cuenta...')
            : (mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta')}
        </button>

        {/* Mode toggle */}
        <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'rgba(245,240,231,0.4)', margin: 0 }}>
          {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setAuthError(null) }}
            style={{
              background: 'none',
              border: 'none',
              color: '#C9A035',
              cursor: 'pointer',
              fontSize: '0.82rem',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        </p>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'rgba(245,240,231,0.2)', marginTop: '32px' }}>
          Al continuar aceptas nuestros términos de uso.
        </p>
      </div>
    </div>
  )
}
