import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scale, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { signIn, getUserProfile, SUPABASE_CONFIGURED, supabase } from '../lib/supabase';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Clear error when inputs change
  useEffect(() => {
    if (error) setError(null);
  }, [email, password]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!SUPABASE_CONFIGURED) {
      setError(
        'CONFIGURATION ERROR: Supabase env vars are missing. Go to Vercel → Settings → Environment Variables and add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy from the Deployments tab.'
      );
      return;
    }

    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signIn(email.trim(), password);

      // Explicitly ping the backend to trigger profile auto-create
      const apiUrl = import.meta.env.VITE_API_URL;
      if (apiUrl) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            const resp = await fetch(`${apiUrl}/cases`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            console.log('[Login] Bootstrap call status:', resp.status);
          }
        } catch (bootstrapErr) {
          console.warn('[Login] Bootstrap call failed:', bootstrapErr);
        }
      } else {
        console.warn('[Login] VITE_API_URL not set');
      }

      // Fetch profile to determine role-based redirect
      const profile = await getUserProfile();
      console.log('[Login] Profile after bootstrap:', profile);
      const role = profile?.role;

      if (role === 'attorney') {
        navigate('/attorney/dashboard', { replace: true });
      } else if (role === 'client') {
        navigate('/client/dashboard', { replace: true });
      } else {
        // Profile still missing after bootstrap — show error
        setError(
          'Signed in, but no profile could be created. Check that the backend ' +
          '(Railway) is running and VITE_API_URL is set correctly in Vercel env vars. ' +
          `Backend URL: ${apiUrl || 'NOT SET'}`
        );
        setLoading(false);
        return;
      }
    } catch (err) {
      let message = 'An error occurred. Please try again.';

      if (err.message) {
        const msg = err.message.toLowerCase();
        if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
          message = 'Cannot reach Supabase. Check that VITE_SUPABASE_URL is set correctly in Vercel env vars and that you redeployed after adding them.';
        } else if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
          message = 'Invalid email or password. Check Supabase → Authentication → Users to verify the account exists and is confirmed.';
        } else if (msg.includes('email not confirmed')) {
          message = 'Email not confirmed. Go to Supabase → Authentication → Users, find your user, and toggle Auto Confirm ON.';
        } else if (msg.includes('too many requests') || msg.includes('rate limit')) {
          message = 'Too many login attempts. Wait a minute and try again.';
        } else {
          message = err.message;
        }
      }

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-slate-800 px-4 py-12">
      {/* Subtle background pattern */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white px-8 py-10 shadow-2xl sm:px-10">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30">
              <Scale className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
              LegalFlow
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Sign in to your account
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field */}
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={loading}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  // Placeholder - would navigate to password reset flow
                }}
                className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        {/* Footer text */}
        <p className="mt-6 text-center text-xs text-blue-200/60">
          LegalFlow &mdash; Consumer Protection Case Management
        </p>
      </div>
    </div>
  );
}
