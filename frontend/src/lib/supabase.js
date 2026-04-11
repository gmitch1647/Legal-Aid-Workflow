import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Export flags so UI can show clear errors
export const SUPABASE_CONFIGURED = Boolean(supabaseUrl && supabaseAnonKey);

if (!SUPABASE_CONFIGURED) {
  console.error(
    '[LegalFlow] CRITICAL: Supabase environment variables are missing. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your Vercel project ' +
    'Settings → Environment Variables, then redeploy.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'placeholder-key'
);

/**
 * Get the currently authenticated user from the session.
 */
export async function getCurrentUser() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  return session?.user ?? null;
}

/**
 * Fetch the profile row from the profiles table for the current user.
 * If the profile doesn't exist, ping the backend /me endpoint which
 * will auto-create one, then retry.
 */
export async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  // First attempt — use maybeSingle so 0 rows returns null instead of erroring
  let { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  // No profile — ask the backend to create one via the /me endpoint
  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
  if (apiUrl) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        // Hit any authed endpoint to trigger auto-create in the backend
        await fetch(`${apiUrl}/cases`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (err) {
      console.warn('Failed to trigger profile auto-create:', err);
    }

    // Retry fetching the profile
    const retry = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (retry.data) return retry.data;
  }

  return null;
}

/**
 * Sign in with email and password.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Sign up a new user with email and password.
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Subscribe to auth state changes (sign in, sign out, token refresh).
 * Returns the subscription object with an unsubscribe method.
 */
export function onAuthStateChange(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return subscription;
}
