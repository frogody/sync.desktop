/**
 * Electron Store Configuration
 *
 * Typed store for app settings, auth, and other persistent data.
 */

import Store from 'electron-store';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { AppSettings, DEFAULT_SETTINGS, User } from '../shared/types';

// ============================================================================
// Store Type
// ============================================================================

export interface StoreSchema {
  settings: AppSettings;
  auth: { accessToken?: string; refreshToken?: string };
  authState?: string;
  authStateTimestamp?: number;
  user?: User;
}

// ============================================================================
// Store Instance
// ============================================================================

// Generate a machine-specific encryption key (unique per machine, not a universal static key)
const LEGACY_ENCRYPTION_KEY = 'sync-desktop-encryption-key-v1';
const machineKey = crypto
  .createHash('sha256')
  .update(os.hostname() + os.userInfo().username + 'sync-desktop-v1')
  .digest('hex');

// Try opening with new machine-specific key first; if data is unreadable (migrating
// from old key), open with the legacy key, read data, then re-create with new key.
function createStore(): any {
  try {
    const s = new Store({
      defaults: { settings: DEFAULT_SETTINGS, auth: {} },
      encryptionKey: machineKey,
    }) as any;
    // Probe read to verify decryption works
    s.get('settings');
    return s;
  } catch {
    // Decryption failed — likely still encrypted with legacy key. Migrate.
    try {
      const legacy = new Store({
        defaults: { settings: DEFAULT_SETTINGS, auth: {} },
        encryptionKey: LEGACY_ENCRYPTION_KEY,
      }) as any;
      const data = legacy.store; // read all data

      // Clear and re-create with new key
      legacy.clear();

      const migrated = new Store({
        defaults: { settings: DEFAULT_SETTINGS, auth: {} },
        encryptionKey: machineKey,
      }) as any;

      // Restore data under new encryption
      for (const [key, value] of Object.entries(data)) {
        migrated.set(key, value);
      }

      console.log('[store] Migrated encryption key from legacy to machine-specific key');
      return migrated;
    } catch {
      // Both keys failed — delete the corrupted file and start completely fresh.
      // This handles the case where a store file from a different machine (different
      // machineKey) or a completely corrupted file cannot be decrypted by any known key.
      console.warn('[store] Could not decrypt store with any key, deleting and starting fresh');

      // Try multiple paths to find and delete the corrupted file.
      // app.getPath('userData') may not be available if called before app is ready.
      const pathsToTry: string[] = [];
      try { pathsToTry.push(path.join(app.getPath('userData'), 'config.json')); } catch { /* app not ready */ }
      // Hardcoded macOS fallback path — matches Electron's userData convention
      pathsToTry.push(path.join(os.homedir(), 'Library', 'Application Support', 'sync-desktop', 'config.json'));

      for (const storePath of pathsToTry) {
        try {
          if (fs.existsSync(storePath)) {
            fs.unlinkSync(storePath);
            console.log('[store] Deleted corrupted store file:', storePath);
            break;
          }
        } catch (deleteErr) {
          console.error('[store] Could not delete corrupted store file at', storePath, ':', deleteErr);
        }
      }

      // Create fresh store — wrap in try-catch in case the file is still present
      try {
        return new Store({
          defaults: { settings: DEFAULT_SETTINGS, auth: {} },
          encryptionKey: machineKey,
        }) as any;
      } catch (freshErr) {
        // Last resort: create store with no encryption so it always works
        console.error('[store] Even fresh store creation failed, using unencrypted fallback:', freshErr);
        return new Store({ defaults: { settings: DEFAULT_SETTINGS, auth: {} } }) as any;
      }
    }
  }
}

const store = createStore();

// ============================================================================
// Typed Store Accessors
// ============================================================================

export function getSettings(): AppSettings {
  return store.get('settings') as AppSettings;
}

export function setSettings(settings: AppSettings): void {
  store.set('settings', settings);
}

export function updateSettings(updates: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated = { ...current, ...updates };
  setSettings(updated);
  return updated;
}

export function getAccessToken(): string | undefined {
  const auth = store.get('auth') as { accessToken?: string; refreshToken?: string } | undefined;
  return auth?.accessToken;
}

export function getRefreshToken(): string | undefined {
  const auth = store.get('auth') as { accessToken?: string; refreshToken?: string } | undefined;
  return auth?.refreshToken;
}

export function setAccessToken(token: string | null): void {
  const auth = store.get('auth') as { accessToken?: string; refreshToken?: string } || {};
  store.set('auth', { ...auth, accessToken: token || undefined });
}

export function setRefreshToken(token: string | null): void {
  const auth = store.get('auth') as { accessToken?: string; refreshToken?: string } || {};
  store.set('auth', { ...auth, refreshToken: token || undefined });
}

// SEC-007: Auth state with expiry — state is only valid for 10 minutes
// Increased from 5 min to allow new users time to install, read instructions, and complete auth
const AUTH_STATE_TIMEOUT_MS = 10 * 60 * 1000;

// authStateTimestamp is persisted to store (not in-memory) so it survives app restarts mid-auth

export function getAuthState(): string | undefined {
  const state = store.get('authState') as string | undefined;
  if (!state) return undefined;

  // Check stored timestamp
  const timestamp = store.get('authStateTimestamp') as number | undefined;
  if (!timestamp || (Date.now() - timestamp > AUTH_STATE_TIMEOUT_MS)) {
    // Expired — clear it
    console.warn('[store] Auth state expired or missing timestamp, clearing');
    store.delete('authState');
    store.delete('authStateTimestamp');
    return undefined;
  }
  return state;
}

export function setAuthState(state: string | null): void {
  if (state) {
    store.set('authState', state);
    store.set('authStateTimestamp', Date.now());
  } else {
    store.delete('authState');
    store.delete('authStateTimestamp');
  }
}

export function isAuthStateExpired(): boolean {
  const state = store.get('authState') as string | undefined;
  if (!state) return true;
  const timestamp = store.get('authStateTimestamp') as number | undefined;
  if (!timestamp) return true;
  return Date.now() - timestamp > AUTH_STATE_TIMEOUT_MS;
}

export function clearAuth(): void {
  store.set('auth', { accessToken: undefined, refreshToken: undefined });
  store.delete('authState');
  store.delete('authStateTimestamp');
  store.delete('user');
}

export function getUser(): User | undefined {
  return store.get('user') as User | undefined;
}

export function setUser(user: User | null): void {
  if (user) {
    store.set('user', user);
  } else {
    store.delete('user');
  }
}

// ============================================================================
// API Keys
// ============================================================================

export function getTogetherApiKey(): string | undefined {
  // Check environment variable first
  if (process.env.TOGETHER_API_KEY) {
    return process.env.TOGETHER_API_KEY;
  }
  // Fall back to stored key
  return store.get('togetherApiKey') as string | undefined;
}

export function setTogetherApiKey(key: string | null): void {
  if (key) {
    store.set('togetherApiKey', key);
  } else {
    store.delete('togetherApiKey');
  }
}

export { store };
