/**
 * PermissionsSetup - Guides users through enabling required macOS permissions
 *
 * Shown after login if required permissions are not granted.
 * Checks: Accessibility, Screen Recording
 *
 * Handles macOS Sequoia quirk: isTrustedAccessibilityClient(true) does NOT
 * update accessibility trust state in the running process after first-time grant.
 * After the user grants access in System Settings, we detect this via a poll
 * counter and prompt a restart.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface PermissionItem {
  id: string;
  label: string;
  description: string;
  required: boolean;
  granted: boolean;
  settingsUrl: string;
}

interface Props {
  onComplete: () => void;
}

export default function PermissionsSetup({ onComplete }: Props) {
  const [permissions, setPermissions] = useState<PermissionItem[]>([
    {
      id: 'accessibility',
      label: 'Accessibility',
      description: 'Detects which app and window is active. Required for activity tracking.',
      required: true,
      granted: false,
      settingsUrl: 'accessibility',
    },
    {
      id: 'screenCapture',
      label: 'Screen Recording',
      description: 'Enables deeper context analysis. Optional — core tracking works without it.',
      required: false,
      granted: false,
      settingsUrl: 'screenCapture',
    },
  ]);
  const [checking, setChecking] = useState(false);
  const [requiresRestart, setRequiresRestart] = useState(false);
  const [autoAdvanceSeconds, setAutoAdvanceSeconds] = useState<number | null>(null);

  // Use refs to avoid stale closure issues in the polling interval
  const openedSettingsRef = useRef<Record<string, boolean>>({});
  const pollsSinceOpenedRef = useRef(0);
  // Keep a ref copy of permissions for use inside interval
  const permissionsRef = useRef(permissions);
  useEffect(() => {
    permissionsRef.current = permissions;
  }, [permissions]);

  // Initial check on mount
  useEffect(() => {
    (async () => {
      setChecking(true);
      try {
        const result = await (window as any).electron.checkPermissions();
        if (result?.data) {
          setPermissions((prev) =>
            prev.map((p) => ({
              ...p,
              granted: result.data[p.id] || false,
            }))
          );
        }
      } catch (err) {
        console.error('Failed to check permissions:', err);
      }
      setChecking(false);
    })();
  }, []);

  // Poll every 2 seconds — uses refs to avoid stale closure
  useEffect(() => {
    const interval = setInterval(async () => {
      setChecking(true);
      try {
        const result = await (window as any).electron.checkPermissions();
        if (result?.data) {
          const newPerms = permissionsRef.current.map((p) => ({
            ...p,
            granted: result.data[p.id] || false,
          }));

          // Check if any permission the user opened settings for is still not granted
          const anyOpenedNotGranted = newPerms.some(
            (p) => openedSettingsRef.current[p.id] && !p.granted
          );

          if (anyOpenedNotGranted) {
            pollsSinceOpenedRef.current += 1;
            if (pollsSinceOpenedRef.current >= 5) {
              setRequiresRestart(true);
            }
          } else if (Object.keys(openedSettingsRef.current).length > 0) {
            // All opened permissions are now granted — reset counter
            pollsSinceOpenedRef.current = 0;
          }

          setPermissions(newPerms);
        }
      } catch (err) {
        console.error('Failed to check permissions:', err);
      }
      setChecking(false);
    }, 2000);
    return () => clearInterval(interval);
  }, []); // empty deps — intentionally uses refs for mutable state

  const allRequiredGranted = permissions
    .filter((p) => p.required)
    .every((p) => p.granted);

  // Auto-advance countdown when all required permissions are granted
  useEffect(() => {
    if (!allRequiredGranted) return;
    setAutoAdvanceSeconds(2);
    const countdownInterval = setInterval(() => {
      setAutoAdvanceSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(countdownInterval);
          onComplete();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownInterval);
  }, [allRequiredGranted, onComplete]);

  const handleOpenSettings = async (permissionId: string) => {
    openedSettingsRef.current = { ...openedSettingsRef.current, [permissionId]: true };
    pollsSinceOpenedRef.current = 0;
    await (window as any).electron.requestPermission(permissionId);
  };

  const handleContinue = () => {
    onComplete();
  };

  const requiredGrantedCount = permissions.filter((p) => p.required && p.granted).length;
  const totalRequired = permissions.filter((p) => p.required).length;

  return (
    <div className="w-full h-full flex flex-col bg-black text-white overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold mb-1">Setup Permissions</h1>
        <p className="text-sm text-zinc-400">
          SYNC Desktop needs these macOS permissions to track your activity.
          Toggle each one in System Settings.
        </p>
      </div>

      {/* Progress */}
      <div className="px-6 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={requiredGrantedCount}
            aria-valuemin={0}
            aria-valuemax={totalRequired}
            aria-label={`${requiredGrantedCount} of ${totalRequired} required permissions granted`}
          >
            <div
              className="h-full bg-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${totalRequired > 0 ? (requiredGrantedCount / totalRequired) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500">
            {requiredGrantedCount}/{totalRequired}
          </span>
        </div>
      </div>

      {/* Permission cards */}
      <div className="flex-1 px-6 space-y-3 overflow-y-auto">
        {permissions.map((perm) => (
          <div
            key={perm.id}
            className={`rounded-xl border p-4 transition-all duration-300 ${
              perm.granted
                ? 'bg-cyan-500/5 border-cyan-500/30'
                : 'bg-zinc-900/50 border-zinc-700/50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {/* Status icon */}
                  {perm.granted ? (
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
                    </svg>
                  )}
                  <span className="font-medium text-sm">{perm.label}</span>
                  <span className="sr-only">{perm.granted ? '(Granted)' : '(Not granted)'}</span>
                  {perm.required && !perm.granted && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 ml-7">{perm.description}</p>
              </div>

              {/* Action button */}
              {!perm.granted && (
                <button
                  onClick={() => handleOpenSettings(perm.id)}
                  aria-label={`Open System Settings for ${perm.label}`}
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                >
                  Open Settings
                </button>
              )}
            </div>

            {/* Inline instructions for each permission */}
            {!perm.granted && (
              <div className="mt-3 ml-7 text-xs text-zinc-500 space-y-1">
                {perm.id === 'accessibility' && (
                  <>
                    <p>1. System Settings will open to Privacy &amp; Security</p>
                    <p>2. Click <span className="text-zinc-300">Accessibility</span> in the left sidebar</p>
                    <p>3. Find <span className="text-zinc-300">SYNC Desktop</span> and toggle it <span className="text-cyan-400">ON</span></p>
                  </>
                )}
                {perm.id === 'screenCapture' && (
                  <>
                    <p>1. System Settings will open to Privacy &amp; Security</p>
                    <p>2. Click <span className="text-zinc-300">Screen Recording</span> in the left sidebar</p>
                    <p>3. Find <span className="text-zinc-300">SYNC Desktop</span> and toggle it <span className="text-cyan-400">ON</span></p>
                    <p className="text-amber-400/70 mt-1">You may need to restart SYNC Desktop after enabling this.</p>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-zinc-800/50 space-y-3">
        {requiresRestart ? (
          <>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-3">
              <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <p className="text-xs text-amber-400 font-medium">Restart required</p>
                <p className="text-xs text-zinc-400 mt-0.5">macOS requires a restart to activate accessibility access.</p>
              </div>
            </div>
            <button
              onClick={() => window.electron.relaunchApp()}
              className="w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 font-medium text-sm hover:bg-amber-500/30 transition-colors"
            >
              Restart SYNC Desktop
            </button>
            <button
              onClick={handleContinue}
              className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              Skip for now (tracking will be limited)
            </button>
          </>
        ) : allRequiredGranted ? (
          autoAdvanceSeconds !== null ? (
            <div className="text-center py-2">
              <p className="text-sm text-cyan-400 font-medium">
                All permissions granted! Starting SYNC in {autoAdvanceSeconds}s...
              </p>
              <button
                onClick={handleContinue}
                className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
              >
                Start Now
              </button>
            </div>
          ) : (
            <button
              onClick={handleContinue}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
            >
              All Set — Start SYNC
            </button>
          )
        ) : (
          <div className="space-y-2">
            <button
              onClick={async () => {
                setChecking(true);
                try {
                  const result = await (window as any).electron.checkPermissions();
                  if (result?.data) {
                    setPermissions((prev) =>
                      prev.map((p) => ({
                        ...p,
                        granted: result.data[p.id] || false,
                      }))
                    );
                  }
                } catch (err) {
                  console.error('Failed to check permissions:', err);
                }
                setChecking(false);
              }}
              disabled={checking}
              className="w-full py-2.5 rounded-xl bg-white/10 text-white/70 font-medium text-sm hover:bg-white/15 transition-colors disabled:opacity-50"
            >
              {checking ? 'Checking...' : 'Refresh Status'}
            </button>
            <button
              onClick={handleContinue}
              className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              Skip for now (tracking will be limited)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
