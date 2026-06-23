/**
 * Global Shortcut Registration
 *
 * Registers a single, user-configurable global shortcut that toggles the
 * command bar. Reads the accelerator from settings; falls back to the default
 * if the chosen chord is already taken by another app.
 */

import { globalShortcut } from 'electron';
import { toggleCommandBar } from './windows/floatingWidget';
import { COMMAND_BAR_SHORTCUT_DEFAULT } from '../shared/constants';

let registeredAccelerator: string | null = null;

/**
 * (Re)register the command-bar global shortcut. Safe to call repeatedly —
 * it unregisters the previous binding first. Returns the accelerator that is
 * now active, or null if registration failed entirely.
 */
export function registerCommandShortcut(accelerator?: string): string | null {
  unregisterCommandShortcut();

  const accel = (accelerator && accelerator.trim()) || COMMAND_BAR_SHORTCUT_DEFAULT;

  const tryRegister = (a: string): boolean => {
    try {
      // If somehow still registered elsewhere, clear it first.
      if (globalShortcut.isRegistered(a)) globalShortcut.unregister(a);
      const ok = globalShortcut.register(a, () => toggleCommandBar());
      if (ok) {
        registeredAccelerator = a;
        console.log('[shortcut] Registered command bar shortcut:', a);
      }
      return ok;
    } catch (e) {
      console.error('[shortcut] register error for', a, e);
      return false;
    }
  };

  if (tryRegister(accel)) return registeredAccelerator;

  console.warn('[shortcut] Could not register', accel, '— likely in use by another app');
  if (accel !== COMMAND_BAR_SHORTCUT_DEFAULT && tryRegister(COMMAND_BAR_SHORTCUT_DEFAULT)) {
    console.warn('[shortcut] Fell back to default:', COMMAND_BAR_SHORTCUT_DEFAULT);
    return registeredAccelerator;
  }

  return null;
}

export function unregisterCommandShortcut(): void {
  if (registeredAccelerator) {
    try { globalShortcut.unregister(registeredAccelerator); } catch { /* ignore */ }
    registeredAccelerator = null;
  }
}

export function getRegisteredShortcut(): string | null {
  return registeredAccelerator;
}
