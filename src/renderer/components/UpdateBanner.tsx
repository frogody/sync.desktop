/**
 * UpdateBanner - In-app update notification
 *
 * Shows a compact banner when an update is available.
 * Handles: check → download (with progress) → install & restart.
 */

import React, { useState, useEffect, useCallback } from 'react';

type UpdateState = 'idle' | 'available' | 'downloading' | 'downloaded';

const electron = (window as any).electron;

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // Check update status on mount
  useEffect(() => {
    const check = async () => {
      try {
        const result = await electron.getUpdateStatus();
        if (result?.data) {
          if (result.data.downloaded) {
            setState('downloaded');
            setVersion(result.data.version);
          } else if (result.data.downloading) {
            setState('downloading');
            setVersion(result.data.version);
            setProgress(result.data.progress);
          } else if (result.data.available) {
            setState('available');
            setVersion(result.data.version);
          }
        }
      } catch (err) {
        // Ignore — update API may not be available in dev
      }
    };
    check();
  }, []);

  // Listen for update events from main process
  useEffect(() => {
    const unsubAvailable = electron.onUpdateAvailable?.((data: any) => {
      setState('available');
      setVersion(data.version);
      setDismissed(false);
    });

    const unsubProgress = electron.onUpdateProgress?.((data: any) => {
      setState('downloading');
      setProgress(data.percent);
    });

    const unsubDownloaded = electron.onUpdateDownloaded?.((data: any) => {
      setState('downloaded');
      setVersion(data.version);
      setDismissed(false);
    });

    return () => {
      unsubAvailable?.();
      unsubProgress?.();
      unsubDownloaded?.();
    };
  }, []);

  const handleDownload = useCallback(async () => {
    setState('downloading');
    setProgress(0);
    await electron.downloadUpdate();
  }, []);

  const handleInstall = useCallback(async () => {
    await electron.installUpdate();
  }, []);

  // Don't show anything if no update or dismissed
  if (state === 'idle' || dismissed) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-50 px-3 pt-2">
      <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-sm px-3 py-2">
        {/* Update available */}
        {state === 'available' && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-cyan-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="text-xs text-white truncate">
                v{version} available
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleDownload}
                className="text-[11px] px-2.5 py-1 rounded-md bg-cyan-500 text-white font-medium hover:bg-cyan-400 transition-colors"
              >
                Update
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Downloading */}
        {state === 'downloading' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white">Downloading v{version}...</span>
              <span className="text-[11px] text-cyan-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Downloaded — ready to install */}
        {state === 'downloaded' && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-white truncate">
                v{version} ready
              </span>
            </div>
            <button
              onClick={handleInstall}
              className="text-[11px] px-2.5 py-1 rounded-md bg-green-500 text-white font-medium hover:bg-green-400 transition-colors flex-shrink-0"
            >
              Restart & Update
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
