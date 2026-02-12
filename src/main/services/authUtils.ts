/**
 * Auth Utilities
 *
 * Token refresh and authentication helpers.
 * Separated from index.ts to avoid circular imports.
 */

import { getRefreshToken, setAccessToken, setRefreshToken, clearAuth } from '../store';

const SUPABASE_URL = 'https://sfxpmzicgpaxfntqleig.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHBtemljZ3BheGZudHFsZWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NjIsImV4cCI6MjA4MjE4MjQ2Mn0.337ohi8A4zu_6Hl1LpcPaWP8UkI5E4Om7ZgeU9_A8t4';

/**
 * Refresh the access token using the stored refresh token.
 * Supabase JWTs expire after ~1 hour, so this is critical for long-running sessions.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    console.log('[auth] No refresh token available');
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.error('[auth] Token refresh failed:', response.status);
      if (response.status === 400 || response.status === 401) {
        console.error('[auth] Refresh token invalid, clearing auth');
        clearAuth();
      }
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token;

    if (newAccessToken) {
      setAccessToken(newAccessToken);
      console.log('[auth] Access token refreshed successfully');
    }
    if (newRefreshToken) {
      setRefreshToken(newRefreshToken);
    }

    return newAccessToken || null;
  } catch (error) {
    console.error('[auth] Token refresh error:', error);
    return null;
  }
}
