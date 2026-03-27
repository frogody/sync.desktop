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

// Hexagon geometry helpers (pointy-top orientation) — matches SyncAvatarMini
const HEX_ANGLES = [270, 330, 30, 90, 150, 210].map(d => (d * Math.PI) / 180);

function hexVertex(cx: number, cy: number, r: number, i: number) {
  const a = HEX_ANGLES[i % 6];
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function hexPointsStr(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const v = hexVertex(cx, cy, r, i);
    return `${v.x},${v.y}`;
  }).join(' ');
}

function hexPerimeterPoint(cx: number, cy: number, r: number, frac: number) {
  const f = ((frac % 1) + 1) % 1;
  const edgeProgress = f * 6;
  const edgeIndex = Math.floor(edgeProgress);
  const t = edgeProgress - edgeIndex;
  const v0 = hexVertex(cx, cy, r, edgeIndex);
  const v1 = hexVertex(cx, cy, r, (edgeIndex + 1) % 6);
  return { x: v0.x + (v1.x - v0.x) * t, y: v0.y + (v1.y - v0.y) * t };
}

function hexEdgePath(cx: number, cy: number, r: number, frac0: number, frac1: number) {
  const f0 = ((frac0 % 1) + 1) % 1;
  const f1 = ((frac1 % 1) + 1) % 1;
  const points: { x: number; y: number }[] = [];
  points.push(hexPerimeterPoint(cx, cy, r, f0));
  const startEdge = Math.floor(f0 * 6);
  const span = f1 > f0 ? f1 - f0 : 1 - f0 + f1;
  const endFrac = f0 + span;
  let nextVertexFrac = (startEdge + 1) / 6;
  if (nextVertexFrac <= f0) nextVertexFrac += 1;
  while (nextVertexFrac < endFrac - 0.0001) {
    points.push(hexPerimeterPoint(cx, cy, r, nextVertexFrac));
    nextVertexFrac += 1 / 6;
  }
  points.push(hexPerimeterPoint(cx, cy, r, f1));
  return 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
}

const HEX_CLIP = 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)';

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

function SyncRing({ size = 80 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <defs>
        <filter id="ringGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Base hexagon ring */}
      <polygon
        points={hexPointsStr(cx, cy, r)}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <g filter="url(#ringGlow)">
        {RING_SEGMENTS.map((seg, i) => (
          <path
            key={i}
            d={hexEdgePath(cx, cy, r, seg.from, seg.to)}
            fill="none"
            stroke={seg.color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
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
  { icon: 'sync',     label: 'Syncs with your Hyve workspace' },
];

function FeatureIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5";
  switch (type) {
    case 'activity':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'shield':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'zap':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case 'sync':
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  const loginTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Clean up timeout on unmount
  React.useEffect(() => {
    return () => {
      if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current);
    };
  }, []);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    // Start a 4-minute timeout — if deep link callback doesn't arrive, reset
    if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current);
    loginTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      setError(
        'Sign-in is taking too long. Make sure SYNC Desktop is allowed to handle "isyncso://" links in your browser, then try again.'
      );
    }, 4 * 60 * 1000);

    try {
      const result = await window.electron.login();
      if (!result.success) {
        setIsLoading(false);
        if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current);
        setError(result.error || 'Could not open the login page. Please check your default browser and try again.');
      }
    } catch (err) {
      setIsLoading(false);
      if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current);
      setError('Something went wrong. Please check your internet connection and try again.');
    }
  };

  React.useEffect(() => {
    const unsubscribe = window.electron.onAuthCallback((data) => {
      if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current);
      setIsLoading(false);
      if (data.success) {
        onLoginSuccess();
      } else {
        setError(data.error || 'Sign-in could not be completed. Please try again, or check your internet connection.');
      }
    });

    return () => unsubscribe();
  }, [onLoginSuccess]);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-black relative overflow-hidden">
      {/* Background gradient orbs — teal + honey glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[10%] left-[5%] w-56 h-56 bg-sync-teal/[0.12] rounded-full blur-3xl" />
        <div className="absolute bottom-[15%] right-[5%] w-64 h-64 bg-sync-teal-dark/[0.10] rounded-full blur-3xl" />
        <div className="absolute top-[45%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-sync-honey/[0.06] rounded-full blur-3xl" />
        <div className="absolute top-[70%] left-[30%] w-32 h-32 bg-sync-cyan/[0.06] rounded-full blur-2xl" />
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-[320px]">
        {/* SYNC Ring + Logo */}
        <div className="mb-6 text-center">
          <div className="w-20 h-20 mx-auto mb-4 relative">
            <SyncRing size={80} />
            {/* Inner glow — hexagonal */}
            <div
              className="absolute inset-0"
              style={{
                clipPath: HEX_CLIP,
                background: 'radial-gradient(circle, rgba(42,157,143,0.15) 0%, transparent 70%)',
              }}
            />
            {/* Center "S" */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/90 font-bold text-lg tracking-tight">S</span>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-white mb-1">Hyve Desktop</h1>
          <p className="text-sync-teal-light/60 text-xs leading-relaxed">
            Your AI assistant that understands<br />what you're working on
          </p>
        </div>

        {/* Login Button */}
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full py-2.5 px-5 bg-gradient-to-r from-sync-teal to-sync-cyan text-white text-sm font-medium rounded-xl hover:from-sync-teal-light hover:to-sync-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-sync-teal/20 focus-visible:ring-2 focus-visible:ring-sync-teal-light focus-visible:ring-offset-2 focus-visible:ring-offset-black focus-visible:outline-none"
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
              Sign in with Hyve
            </span>
          )}
        </button>

        {/* Cancel button — only shown while waiting for deep link callback */}
        {isLoading && (
          <button
            onClick={() => {
              if (loginTimeoutRef.current) clearTimeout(loginTimeoutRef.current);
              setIsLoading(false);
              setError(null);
            }}
            className="mt-2 w-full py-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Cancel
          </button>
        )}

        {/* Error */}
        <div aria-live="assertive" aria-atomic="true">
          {error && (
            <p className="mt-3 text-red-400 text-xs text-center" role="alert">{error}</p>
          )}
        </div>

        {/* Features */}
        <div className="mt-6 w-full p-3 rounded-xl bg-sync-teal/[0.04] border border-sync-teal/[0.12]">
          <div className="space-y-2">
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 text-white/60">
                <div className="text-sync-teal/70">
                  <FeatureIcon type={f.icon} />
                </div>
                <span className="text-[11px]">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-white/50 text-[10px] text-center">
          Secure authentication via app.isyncso.com
        </p>
      </div>
    </div>
  );
}
