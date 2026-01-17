import Store from 'electron-store';

const SERVICE_NAME = 'frogody-sync-desktop';
const ACCOUNT_NAME = 'device-api-key';
const store = new Store();

let keytarAvailable = false;
let keytar: any = null;

// Try to import keytar, but don't fail if unavailable
try {
  keytar = require('keytar');
  keytarAvailable = true;
} catch (e) {
  console.warn('[pairing] keytar not available, will use electron-store fallback');
}

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
