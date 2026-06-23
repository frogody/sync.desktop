/**
 * CommandBar
 *
 * Compact, Spotlight-style bar toggled by a global shortcut. The user types to
 * talk to the SYNC agent, or clicks the camera button to drag-select a region
 * of their screen and send that screenshot (with an optional note) as a task.
 * The agent's reply streams in inline; the window auto-resizes to fit.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  // Derive the shared session id (sync_user_<uid>) so the bar, chat and voice
  // all share one conversation; fall back to an anonymous id when logged out.
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

  // Focus the input whenever the bar appears.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  // Auto-resize the window to fit the bar's content (response, preview, etc.).
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

  // Global Esc to close.
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
      // If cancelled, silently do nothing.
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

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.event === 'chunk' && parsed.content) full += parsed.content;
              else if (parsed.event === 'end' && parsed.content) full = parsed.content;
              else if (parsed.text) full += parsed.text;
              setResponse(stripActionTags(full));
            } catch {
              if (data.trim()) {
                full += data;
                setResponse(stripActionTags(full));
              }
            }
          }
        }
      }

      setResponse(stripActionTags(full) || 'Done — no visible response. Try rephrasing.');
      // Sent successfully — clear the input + attached image for the next task.
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

  return (
    <div
      ref={rootRef}
      className="w-full bg-[#0d0d0f] text-white rounded-xl border border-white/10 overflow-hidden select-none"
      style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* Input row */}
      <div className="flex items-center gap-2 px-3 py-3">
        {/* SYNC mark */}
        <div className="shrink-0 w-5 h-5 rounded-md bg-gradient-to-br from-teal-400 to-purple-500" aria-hidden />

        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isLoading}
          placeholder={image ? 'Describe what to do with the screenshot…' : 'Ask SYNC anything…'}
          className="flex-1 bg-transparent outline-none text-[15px] placeholder-white/35 disabled:opacity-60"
          aria-label="Message SYNC"
        />

        {/* Screenshot button */}
        <button
          onClick={handleScreenshot}
          disabled={isLoading || isCapturing}
          title="Screenshot a region and send it to SYNC"
          aria-label="Capture a screen region"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        </button>

        {/* Send button */}
        <button
          onClick={send}
          disabled={isLoading || (!input.trim() && !image)}
          title="Send (Enter)"
          aria-label="Send"
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
        >
          {isLoading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m22 2-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Screenshot preview */}
      {image && (
        <div className="px-3 pb-3 -mt-1">
          <div className="relative inline-block">
            <img
              src={image.dataUrl}
              alt="Screenshot to send"
              className="max-h-24 rounded-lg border border-white/15"
            />
            <button
              onClick={() => setImage(null)}
              aria-label="Remove screenshot"
              className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-black/80 border border-white/20 text-white/80 hover:text-white flex items-center justify-center text-xs"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Capturing hint */}
      {isCapturing && (
        <div className="px-3 pb-3 -mt-1 text-[12px] text-white/45">Drag to select a region… (Esc to cancel)</div>
      )}

      {/* Response / error */}
      {(response || error) && (
        <div className="border-t border-white/10 px-4 py-3 max-h-[380px] overflow-y-auto">
          {error ? (
            <p className="text-[13px] text-red-300/90">{error}</p>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-white/85 whitespace-pre-wrap">{response}</p>
          )}
        </div>
      )}

      {/* Footer hint */}
      <div className="px-3 py-1.5 text-[10.5px] text-white/30 flex items-center justify-between border-t border-white/5">
        <span>Enter to send · Esc to close</span>
        <span>SYNC</span>
      </div>
    </div>
  );
}
