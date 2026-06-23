/**
 * CommandBar
 *
 * Compact, Spotlight-style bar toggled by a global shortcut. The user types to
 * talk to the SYNC agent, or clicks the camera button to drag-select a region
 * of their screen and send that screenshot (with an optional note) as a task.
 * The agent's reply streams in inline; the window auto-resizes to fit.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import { decodeJwt } from '../lib/jwt';

// Remove [ACTION]...[/ACTION] blocks the agent uses for tool calls.
function stripActionTags(text: string): string {
  return text.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g, '').trim();
}

interface AttachedImage {
  dataUrl: string;
  bytes: number;
}

// Brand hexagon mark with a teal→indigo→purple gradient and a dark center.
function SyncMark({ size = 22 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="52%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path d="M12 1.5 21 6.75 21 17.25 12 22.5 3 17.25 3 6.75Z" fill={`url(#${id})`} />
      <path d="M12 5.2 17.6 8.45 17.6 14.95 12 18.2 6.4 14.95 6.4 8.45Z" fill="#0e0f13" />
      <circle cx="12" cy="12" r="1.5" fill={`url(#${id})`} />
    </svg>
  );
}

export default function CommandBar() {
  const [input, setInput] = useState('');
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Shared session id (sync_user_<uid>) so bar, chat and voice share one
  // conversation; fall back to an anonymous id when logged out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await window.electron.getAuthStatus();
        const token = res?.data?.accessToken;
        const uid = token ? decodeJwt(token)?.sub : undefined;
        if (!cancelled) setSessionId(uid ? `sync_user_${uid}` : `cmd_${Date.now()}`);
      } catch {
        if (!cancelled) setSessionId(`cmd_${Date.now()}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Auto-resize the window to fit the bar's content.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => window.electron.setCommandHeight(el.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const close = useCallback(() => {
    abortRef.current?.abort();
    window.electron.collapseWindow();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const handleScreenshot = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    setError(null);
    try {
      const res = await window.electron.captureRegion();
      if (res?.success && res.data?.dataUrl) {
        setImage({ dataUrl: res.data.dataUrl, bytes: res.data.bytes });
      }
    } catch {
      setError('Screenshot failed. Please try again.');
    } finally {
      setIsCapturing(false);
      inputRef.current?.focus();
    }
  }, [isCapturing]);

  const send = useCallback(async () => {
    const text = input.trim();
    if ((!text && !image) || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResponse('');

    try {
      const contextResult = await window.electron.getContextForSync();
      const activityText = contextResult?.success ? contextResult.data : '';
      const detailedResult = await window.electron.getDetailedContext(10);
      const detailed = detailedResult?.success ? detailedResult.data : null;

      const authResult = await window.electron.getAuthStatus();
      const accessToken = authResult?.data?.accessToken;
      let userId: string | undefined;
      let userEmail: string | undefined;
      let userName: string | undefined;
      if (accessToken) {
        const d = decodeJwt(accessToken);
        userId = d?.sub;
        userEmail = d?.email;
        userName = d?.user_metadata?.full_name || d?.user_metadata?.name;
      }

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const message = text || 'Take a look at this screenshot and tell me what to do with it.';

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // `imageUrl` is the field the sync edge function already understands —
          // it runs the image through a vision model and folds the analysis in.
          message,
          imageUrl: image?.dataUrl,
          sessionId,
          stream: true,
          context: {
            userId,
            userEmail,
            userName,
            source: 'desktop-command-bar',
            recentActivity: activityText,
            currentApp: detailed?.currentApp || null,
            focusScore: detailed?.focusScore || 0,
            isIdle: detailed?.isIdle || false,
            recentApps: detailed?.recentApps?.slice(0, 5) || [],
          },
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) throw new Error('AUTH_ERROR');
        if (resp.status === 429) throw new Error('RATE_LIMIT');
        if (resp.status >= 500) throw new Error('SERVER_ERROR');
        throw new Error('UNKNOWN_ERROR');
      }

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let buffer = '';

      const handleData = (data: string) => {
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          if (parsed.event === 'chunk' && parsed.content) full += parsed.content;
          else if (parsed.event === 'end' && parsed.content) full = parsed.content;
          else if (parsed.text) full += parsed.text;
          else return;
        } catch {
          if (!data.trim()) return;
          full += data;
        }
        setResponse(stripActionTags(full));
      };

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Buffer across reads so an SSE line split mid-chunk isn't dropped.
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) handleData(line.slice(6).trim());
          }
        }
        if (buffer.startsWith('data: ')) handleData(buffer.slice(6).trim());
      }

      setResponse(stripActionTags(full) || 'Done — no visible response. Try rephrasing.');
      setInput('');
      setImage(null);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const m = (err as Error).message;
      setError(
        m === 'AUTH_ERROR' ? 'Your session expired — sign in again.'
        : m === 'RATE_LIMIT' ? 'Too many requests. Wait a moment and retry.'
        : m === 'SERVER_ERROR' ? 'SYNC is temporarily unavailable.'
        : 'Could not reach SYNC. Check your connection.'
      );
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [input, image, isLoading, sessionId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const canSend = (!!input.trim() || !!image) && !isLoading;
  const showPanel = !!response || !!error || isLoading || !!image || isCapturing;

  return (
    <div
      ref={rootRef}
      className="w-full select-none rounded-2xl border border-white/10 bg-[#0e0f13] text-white shadow-[0_18px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden"
      style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {/* subtle top highlight */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Input row */}
      <div className="flex items-center gap-3 px-4 h-[58px]">
        <div className="shrink-0 drop-shadow-[0_0_8px_rgba(129,140,248,0.35)]">
          <SyncMark size={24} />
        </div>

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
          placeholder={image ? 'Describe what to do with the screenshot…' : 'Ask SYNC anything…'}
          className="flex-1 bg-transparent outline-none text-[15.5px] tracking-[-0.01em] placeholder-white/30 disabled:opacity-60"
          aria-label="Message SYNC"
        />

        <button
          onClick={handleScreenshot}
          disabled={isLoading || isCapturing}
          title="Screenshot a region and send it to SYNC"
          aria-label="Capture a screen region"
          className="shrink-0 w-9 h-9 grid place-items-center rounded-xl text-white/55 hover:text-white hover:bg-white/[0.08] active:scale-95 transition disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13.5" r="3.2" />
          </svg>
        </button>

        <button
          onClick={send}
          disabled={!canSend}
          title="Send (Enter)"
          aria-label="Send"
          className={
            'shrink-0 w-9 h-9 grid place-items-center rounded-xl transition active:scale-95 ' +
            (canSend
              ? 'text-white bg-gradient-to-br from-teal-400/90 to-indigo-500/90 hover:opacity-90 shadow-[0_2px_10px_-2px_rgba(99,102,241,0.6)]'
              : 'text-white/30 bg-white/[0.04]')
          }
        >
          {isLoading ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Expandable panel: preview / response / status */}
      {showPanel && (
        <div className="border-t border-white/[0.07]">
          {image && (
            <div className="px-4 pt-3">
              <div className="relative inline-block">
                <img src={image.dataUrl} alt="Screenshot to send" className="max-h-28 rounded-lg border border-white/15" />
                <button
                  onClick={() => setImage(null)}
                  aria-label="Remove screenshot"
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/85 border border-white/25 text-white/80 hover:text-white grid place-items-center text-[11px] leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {isCapturing && (
            <div className="px-4 py-3 text-[12.5px] text-white/45">Drag to select a region…  <span className="text-white/30">(Esc to cancel)</span></div>
          )}

          {(response || error || (isLoading && !response)) && (
            <div className="px-4 py-3.5 max-h-[360px] overflow-y-auto">
              <div className="flex items-center gap-2 mb-2">
                <SyncMark size={15} />
                <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-white/40">SYNC</span>
              </div>
              {error ? (
                <p className="text-[13.5px] leading-relaxed text-red-300/90">{error}</p>
              ) : response ? (
                <p className="text-[14px] leading-[1.55] text-white/85 whitespace-pre-wrap">{response}</p>
              ) : (
                <div className="flex items-center gap-1.5 py-0.5" aria-label="Thinking">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 flex items-center justify-between text-[11px] text-white/30 border-t border-white/[0.06]">
        <span className="flex items-center gap-2">
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/45 text-[10px]">↵</kbd> send
          <span className="text-white/15">·</span>
          <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/45 text-[10px]">esc</kbd> close
        </span>
        <span className="tracking-[0.1em] text-white/25">HYVE SYNC</span>
      </div>
    </div>
  );
}
