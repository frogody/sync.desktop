/**
 * Login Screen Component
 *
 * Initial screen shown when user is not authenticated.
 * Displays the SYNC branding and login button.
 */

import React, { useState } from 'react';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electron.login();
      if (!result.success) {
        setError(result.error || 'Failed to open login page');
        setIsLoading(false);
      }
      // Keep loading state - will be updated when auth callback is received
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  // Listen for auth callback
  React.useEffect(() => {
    const unsubscribe = window.electron.onAuthCallback((data) => {
      setIsLoading(false);
      if (data.success) {
        onLoginSuccess();
      } else {
        setError('Authentication failed. Please try again.');
      }
    });

    return () => unsubscribe();
  }, [onLoginSuccess]);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-black p-6">
      {/* SYNC Logo/Branding */}
      <div className="mb-8 text-center">
        {/* Animated gradient circle */}
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-sync-blue via-sync-purple to-sync-blue animate-pulse relative">
          <div className="absolute inset-2 rounded-full bg-black flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              className="text-white"
            >
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">SYNC Desktop</h1>
        <p className="text-white/50 text-sm max-w-[250px]">
          Your AI assistant that learns from your workflow
        </p>
      </div>

      {/* Login Button */}
      <button
        onClick={handleLogin}
        disabled={isLoading}
        className="w-full max-w-[280px] py-3 px-6 bg-gradient-to-r from-sync-blue to-sync-purple text-white font-medium rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
            Waiting for authorization...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Sign in with iSyncSO
          </span>
        )}
      </button>

      {/* Error Message */}
      {error && (
        <p className="mt-4 text-red-400 text-sm text-center">{error}</p>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center">
        <p className="text-white/30 text-xs">
          Secure authentication via app.isyncso.com
        </p>
      </div>

      {/* Features List */}
      <div className="mt-6 space-y-2 text-white/40 text-xs">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Activity tracking & context</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Smart AI assistance</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>Syncs with your workspace</span>
        </div>
      </div>
    </div>
  );
}
