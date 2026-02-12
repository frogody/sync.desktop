/**
 * Login Screen Component
 *
 * Initial screen shown when user is not authenticated.
 * Matches the app.isyncso.com design aesthetic:
 *   - Dark background with blurred gradient orbs
 *   - Cyan/blue color palette
 *   - Glass morphism card
 *   - SYNC multi-agent ring visual
 */

import React, { useState } from 'react';

// 10-agent ring segment colors matching the web app's SyncAvatarMini
const RING_SEGMENTS = [
  { color: '#ec4899', from: 0.02, to: 0.08 },   // orchestrator - pink
  { color: '#06b6d4', from: 0.12, to: 0.18 },   // learn - cyan
  { color: '#6366f1', from: 0.22, to: 0.28 },   // growth - indigo
  { color: '#10b981', from: 0.32, to: 0.38 },   // products - emerald
  { color: '#86EFAC', from: 0.42, to: 0.48 },   // sentinel - sage
  { color: '#f59e0b', from: 0.52, to: 0.58 },   // finance - amber
  { color: '#f43f5e', from: 0.62, to: 0.68 },   // create - rose
  { color: '#f97316', from: 0.72, to: 0.78 },   // tasks - orange
  { color: '#3b82f6', from: 0.82, to: 0.88 },   // research - blue
  { color: '#14b8a6', from: 0.92, to: 0.98 },   // inbox - teal
];

function arcPath(cx: number, cy: number, r: number, startFrac: number, endFrac: number): string {
  const startAngle = startFrac * Math.PI * 2 - Math.PI / 2;
  const endAngle = endFrac * Math.PI * 2 - Math.PI / 2;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endFrac - startFrac > 0.5 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function SyncRing({ size = 80 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#ringGlow)">
        {RING_SEGMENTS.map((seg, i) => (
          <path
            key={i}
            d={arcPath(cx, cy, r, seg.from, seg.to)}
            fill="none"
            stroke={seg.color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.85}
          />
        ))}
      </g>
    </svg>
  );
}

const FEATURES = [
  { icon: 'activity', label: 'Deep context awareness' },
  { icon: 'shield',   label: 'AES-256 encrypted, privacy-first' },
  { icon: 'zap',      label: 'Commitment & context detection' },
  { icon: 'sync',     label: 'Syncs with your iSyncSO workspace' },
];

function FeatureIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5";
  switch (type) {
    case 'activity':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'zap':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'sync':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
      );
    default:
      return null;
  }
}

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
    } catch (err) {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

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
    <div className="h-full w-full flex flex-col items-center justify-center bg-black relative overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[15%] left-[10%] w-48 h-48 bg-cyan-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-[20%] right-[10%] w-56 h-56 bg-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-[320px]">
        {/* SYNC Ring + Logo */}
        <div className="mb-6 text-center">
          <div className="w-20 h-20 mx-auto mb-4 relative">
            <SyncRing size={80} />
            {/* Inner glow */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(6,182,212,0.15) 0%, transparent 70%)',
              }}
            />
            {/* Center "S" */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/90 font-bold text-lg tracking-tight">S</span>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-white mb-1">SYNC Desktop</h1>
          <p className="text-white/40 text-xs leading-relaxed">
            Your AI companion that understands<br />what you're working on
          </p>
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full py-2.5 px-5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium rounded-xl hover:from-cyan-400 hover:to-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin w-4 h-4"
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
                width="16"
                height="16"
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

        {/* Error */}
        {error && (
          <p className="mt-3 text-red-400 text-xs text-center">{error}</p>
        )}

        {/* Features */}
        <div className="mt-6 w-full p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="space-y-2">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 text-white/40">
                <div className="text-cyan-400/70">
                  <FeatureIcon type={f.icon} />
                </div>
                <span className="text-[11px]">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-white/20 text-[10px] text-center">
          Secure authentication via app.isyncso.com
        </p>
      </div>
    </div>
  );
}
