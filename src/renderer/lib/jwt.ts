/**
 * JWT helpers (renderer)
 *
 * Decodes the Supabase access-token payload to read the user id (`sub`)
 * and profile fields. Decode only — never used for verification.
 */

export interface JwtPayload {
  sub?: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}
