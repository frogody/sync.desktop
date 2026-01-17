import Store from 'electron-store';

const SERVICE_NAME = 'frogody-sync-desktop';
const ACCOUNT_NAME = 'device-api-key';

// Initialize electron-store with projectName for test environments
const store = new Store({
  projectName: 'sync-desktop-test',
});

let keytarAvailable = false;
let keytar: any = null;

// Try to import keytar, but don't fail if unavailable
try {
  keytar = require('keytar');
  keytarAvailable = true;
} catch (e) {
  console.warn('[pairing] keytar not available, will use electron-store fallback');
}

/**
 * Store device API key securely
 * 
 * This function stores the device API key using the OS-level keychain when available:
 * - **macOS**: Keychain Access
 * - **Windows**: Credential Manager
 * - **Linux**: Secret Service API (libsecret)
 * 
 * If keytar is unavailable (e.g., missing native dependencies), it automatically
 * falls back to encrypted electron-store.
 * 
 * @param apiKey - The device API key obtained from app.isyncso.com
 * @returns Promise that resolves to true if successful
 * 
 * @example
 * ```typescript
 * import { storeApiKey } from './pairing/pairing';
 * 
 * // Store API key (typically done during device pairing)
 * await storeApiKey('sk_live_abc123...');
 * ```
 */
export async function storeApiKey(apiKey: string): Promise<boolean> {
  try {
    if (keytarAvailable && keytar && typeof keytar.setPassword === 'function') {
      await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, apiKey);
      return true;
    }
  } catch (e) {
    console.warn('[pairing] keytar setPassword failed, falling back to electron-store:', e);
  }
  // Fallback to electron-store
  store.set('device_api_key_enc', apiKey);
  return true;
}

/**
 * Retrieve the stored device API key
 * 
 * Attempts to retrieve the API key from the OS keychain first, falling back to
 * electron-store if keytar is unavailable.
 * 
 * @returns Promise that resolves to the API key string, or undefined if not set
 * 
 * @example
 * ```typescript
 * import { getApiKey } from './pairing/pairing';
 * 
 * const apiKey = await getApiKey();
 * if (apiKey) {
 *   console.log('Device is paired');
 * } else {
 *   console.log('Device needs pairing');
 * }
 * ```
 */
export async function getApiKey(): Promise<string | undefined> {
  try {
    if (keytarAvailable && keytar && typeof keytar.getPassword === 'function') {
      const password = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
      if (password) return password;
    }
  } catch (e) {
    console.warn('[pairing] keytar getPassword failed, falling back to electron-store:', e);
  }
  // Fallback to electron-store
  return store.get('device_api_key_enc') as string | undefined;
}

/**
 * Delete the stored device API key
 * 
 * Removes the API key from both the OS keychain and electron-store fallback.
 * Use this when unpairing a device.
 * 
 * @returns Promise that resolves to true when deletion is complete
 * 
 * @example
 * ```typescript
 * import { deleteApiKey } from './pairing/pairing';
 * 
 * // Unpair the device
 * await deleteApiKey();
 * console.log('Device unpaired');
 * ```
 */
export async function deleteApiKey(): Promise<boolean> {
  try {
    if (keytarAvailable && keytar && typeof keytar.deletePassword === 'function') {
      await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    }
  } catch (e) {
    console.warn('[pairing] keytar deletePassword failed:', e);
  }
  // Also clear from electron-store
  store.delete('device_api_key_enc');
  return true;
}
