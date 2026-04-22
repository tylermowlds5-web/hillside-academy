'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const COMPANY_CODE = 'hillside'

export default function LoginPage() {
  const supabase = createClient()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [companyCode, setCompanyCode] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function switchMode(next: 'signin' | 'signup') {
    setMode(next)
    setError(null)
    setMessage(null)
    setConfirmPassword('')
    setCompanyCode('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (mode === 'signup') {
      // ── Client-side validation ────────────────────────────────────────
      if (companyCode.trim().toLowerCase() !== COMPANY_CODE) {
        setError('Invalid company code. Please contact your manager.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        if (!data.session) throw new Error('Sign-in succeeded but no session was returned. Please try again.')

        // Check if this user's account is deactivated
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', data.session.user.id)
          .single<{ is_active: boolean }>()

        if (profile && profile.is_active === false) {
          window.location.href = '/deactivated'
          return
        }

        window.location.href = '/dashboard'
        return
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${location.origin}/api/auth/callback`,
          },
        })
        if (error) throw error
        setMessage('Check your email to confirm your account.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500 mb-4">
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 14l9-5-9-5-9 5 9 5z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-50">Hillside Academy</h1>
          <p className="text-sm text-zinc-400 mt-1">Employee Training Platform</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-zinc-50 mb-6">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Full name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Company code
                  </label>
                  <input
                    type="text"
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
                    required
                    placeholder="Enter company code"
                    autoCapitalize="none"
                    autoComplete="off"
                    className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                  <p className="text-xs text-zinc-600 mt-1">Provided by your manager.</p>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@hillside.com"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-50 placeholder-zinc-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-950 border border-red-800 px-3 py-2.5 text-sm text-red-400">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-3 py-2.5 text-sm text-emerald-400">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            >
              {loading
                ? 'Please wait…'
                : mode === 'signin'
                ? 'Sign in'
                : 'Create account'}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-zinc-400">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => switchMode('signup')}
                  className="text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => switchMode('signin')}
                  className="text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
