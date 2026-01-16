/**
 * Electron Store Configuration
 *
 * Typed store for app settings, auth, and other persistent data.
 */

import Store from 'electron-store';
import { AppSettings, DEFAULT_SETTINGS, User } from '../shared/types';

// ============================================================================
// Store Type
// ============================================================================

export interface StoreSchema {
  settings: AppSettings;
  auth: { accessToken?: string };
  authState?: string;
  user?: User;
}

// ============================================================================
// Store Instance
// ============================================================================

// Create store - use any to work around type inference issues with electron-store
const store = new Store({
  defaults: {
    settings: DEFAULT_SETTINGS,
    auth: {},
  },
  encryptionKey: 'sync-desktop-encryption-key-v1',
}) as any;

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
  const auth = store.get('auth') as { accessToken?: string } | undefined;
  return auth?.accessToken;
}

export function setAccessToken(token: string | null): void {
  store.set('auth', { accessToken: token || undefined });
}

export function getAuthState(): string | undefined {
  return store.get('authState') as string | undefined;
}

export function setAuthState(state: string | null): void {
  if (state) {
    store.set('authState', state);
  } else {
    store.delete('authState');
  }
}

export function clearAuth(): void {
  store.set('auth', { accessToken: undefined });
  store.delete('authState');
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

export { store };
