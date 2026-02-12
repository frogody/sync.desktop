/**
 * PermissionsSetup - Guides users through enabling required macOS permissions
 *
 * Shown after login if required permissions are not granted.
 * Checks: Accessibility, Screen Recording
 */

import React, { useState, useEffect, useCallback } from 'react';

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
      description: 'Reads window titles so SYNC knows what you\'re working on. Required for tracking.',
      required: true,
      granted: false,
      settingsUrl: 'screenCapture',
    },
  ]);
  const [checking, setChecking] = useState(false);

  const checkPermissions = useCallback(async () => {
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
  }, []);

  // Check on mount
  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  // Poll every 2 seconds while screen is shown (user may be toggling in System Settings)
  useEffect(() => {
    const interval = setInterval(checkPermissions, 2000);
    return () => clearInterval(interval);
  }, [checkPermissions]);

  const allRequiredGranted = permissions
    .filter((p) => p.required)
    .every((p) => p.granted);

  const handleOpenSettings = async (permissionId: string) => {
    await (window as any).electron.requestPermission(permissionId);
  };

  const handleContinue = () => {
    onComplete();
  };

  const grantedCount = permissions.filter((p) => p.granted).length;
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
          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all duration-500"
              style={{ width: `${(grantedCount / totalRequired) * 100}%` }}
            />
          </div>
          <span className="text-xs text-zinc-500">
            {grantedCount}/{totalRequired}
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
                    <svg className="w-5 h-5 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
                    </svg>
                  )}
                  <span className="font-medium text-sm">{perm.label}</span>
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
                  className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
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
                    <p>1. System Settings will open to Privacy & Security</p>
                    <p>2. Click <span className="text-zinc-300">Accessibility</span> in the left sidebar</p>
                    <p>3. Find <span className="text-zinc-300">SYNC Desktop</span> and toggle it <span className="text-cyan-400">ON</span></p>
                  </>
                )}
                {perm.id === 'screenCapture' && (
                  <>
                    <p>1. System Settings will open to Privacy & Security</p>
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
      <div className="px-6 py-4 border-t border-zinc-800/50">
        {allRequiredGranted ? (
          <button
            onClick={handleContinue}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:opacity-90 transition-opacity"
          >
            All Set — Start SYNC
          </button>
        ) : (
          <div className="space-y-2">
            <button
              onClick={checkPermissions}
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
