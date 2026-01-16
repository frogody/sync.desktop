/**
 * Chat Widget Component
 *
 * Compact chat interface for the desktop widget.
 * Communicates with SYNC agent via Supabase edge function.
 * Includes rich activity context for more intelligent responses.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';
import SyncAvatarMini from './SyncAvatarMini';
import { useSyncState } from '../context/SyncStateContext';

// Decode JWT to get user info
function decodeJwt(token: string): { sub?: string; email?: string; user_metadata?: { full_name?: string; name?: string } } | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

// Strip ACTION tags from content for display
function stripActionTags(content: string): string {
  // Remove [ACTION]...[/ACTION] blocks from displayed content
  return content.replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g, '').trim();
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  actionExecuted?: {
    type: string;
    success: boolean;
    redirectUrl?: string;
  };
}

interface ChatWidgetProps {
  onClose: () => void;
}

interface ActivityContext {
  currentApp: string | null;
  focusScore: number;
  isIdle: boolean;
}

interface SyncStatus {
  isSyncing: boolean;
  lastSyncTime: Date | null;
  isAuthenticated: boolean;
  pendingItems: { summaries: number; journals: number };
}

export default function ChatWidget({ onClose }: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [activityContext, setActivityContext] = useState<ActivityContext | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Check authentication status on mount and listen for auth changes
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await window.electron.getAuthStatus();
        const isAuth = result.data?.isAuthenticated ?? false;
        setIsAuthenticated(isAuth);

        // If authenticated, extract userId and set user-based sessionId
        if (isAuth && result.data?.accessToken) {
          const decoded = decodeJwt(result.data.accessToken);
          const uid = decoded?.sub;
          if (uid) {
            setUserId(uid);
            // Use consistent sessionId format so web and desktop share conversation
            setSessionId(`sync_user_${uid}`);
            console.log('[ChatWidget] Using user-based sessionId:', `sync_user_${uid}`);
          }
        } else {
          setUserId(null);
          setSessionId(null);
        }
      } catch (error) {
        console.error('Failed to check auth status:', error);
        setIsAuthenticated(false);
        setUserId(null);
        setSessionId(null);
      }
    };

    checkAuth();

    // Listen for auth callback events from deep link
    const handleAuthCallback = () => {
      console.log('[ChatWidget] Auth callback received, refreshing status');
      setIsLoggingIn(false);
      checkAuth();
    };

    const unsubscribe = window.electron.onAuthCallback(handleAuthCallback);

    return () => {
      unsubscribe();
    };
  }, []);

  // Handle login button click
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await window.electron.login();
      // The auth callback listener will update the state
    } catch (error) {
      console.error('Failed to initiate login:', error);
      setIsLoggingIn(false);
    }
  };

  // Fetch activity context on mount and periodically
  useEffect(() => {
    const fetchContext = async () => {
      try {
        const result = await window.electron.getDetailedContext(10);
        if (result.success && result.data) {
          setActivityContext({
            currentApp: result.data.currentApp,
            focusScore: result.data.focusScore,
            isIdle: result.data.isIdle,
          });
        }
      } catch (error) {
        console.error('Failed to get activity context:', error);
      }
    };

    fetchContext();
    const interval = setInterval(fetchContext, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  // Fetch sync status on mount and periodically
  useEffect(() => {
    const fetchSyncStatus = async () => {
      try {
        const result = await window.electron.getSyncStatus();
        if (result.success && result.data) {
          setSyncStatus(result.data);
        }
      } catch (error) {
        console.error('Failed to get sync status:', error);
      }
    };

    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  // Trigger manual sync
  const handleManualSync = async () => {
    try {
      setSyncStatus((prev) => prev ? { ...prev, isSyncing: true } : null);
      await window.electron.triggerSync();
      // Refresh status after sync
      const result = await window.electron.getSyncStatus();
      if (result.success && result.data) {
        setSyncStatus(result.data);
      }
    } catch (error) {
      console.error('Failed to trigger sync:', error);
    }
  };

  // Send message to SYNC with streaming
  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Create placeholder for assistant message
    const assistantMessageId = `assistant_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      },
    ]);

    try {
      // Get rich activity context
      const contextResult = await window.electron.getContextForSync();
      const activityText = contextResult.success ? contextResult.data : '';

      // Get detailed context for additional metadata
      const detailedResult = await window.electron.getDetailedContext(10);
      const detailedContext = detailedResult.success ? detailedResult.data : null;

      // Get auth status
      const authResult = await window.electron.getAuthStatus();
      const accessToken = authResult.data?.accessToken;

      // Decode JWT to get user info
      let userId: string | undefined;
      let userEmail: string | undefined;
      let userName: string | undefined;
      if (accessToken) {
        const decoded = decodeJwt(accessToken);
        userId = decoded?.sub;
        userEmail = decoded?.email;
        userName = decoded?.user_metadata?.full_name || decoded?.user_metadata?.name;
      }

      // Abort any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      console.log('[ChatWidget] Sending to SYNC:', {
        hasAccessToken: !!accessToken,
        userId,
        userEmail,
        userName,
        sessionId,
      });

      // Call SYNC API with streaming
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
          stream: true,
          context: {
            userId,
            userEmail,
            userName,
            source: 'desktop-app',
            recentActivity: activityText,
            currentApp: detailedContext?.currentApp || null,
            focusScore: detailedContext?.focusScore || 0,
            isIdle: detailedContext?.isIdle || false,
            recentApps: detailedContext?.recentApps?.slice(0, 5) || [],
          },
        }),
        signal: abortControllerRef.current.signal,
      });

      console.log('[ChatWidget] SYNC response status:', response.status);

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let actionExecuted: ChatMessage['actionExecuted'] | undefined;

      if (reader) {
        let chunkCount = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          chunkCount++;
          console.log(`[ChatWidget] Received chunk ${chunkCount}:`, chunk.substring(0, 200));

          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                console.log('[ChatWidget] Stream complete');
                continue;
              }

              try {
                const parsed = JSON.parse(data);

                // Handle different event types from SYNC
                if (parsed.event === 'chunk' && parsed.content) {
                  fullContent += parsed.content;
                  // Update the streaming message
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: fullContent }
                        : msg
                    )
                  );
                }

                // Handle 'end' event - contains full content with action results
                if (parsed.event === 'end' && parsed.content) {
                  console.log('[ChatWidget] Received end event with content length:', parsed.content.length);
                  fullContent = parsed.content; // Use the complete content from server
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: fullContent }
                        : msg
                    )
                  );
                  if (parsed.actionExecuted) {
                    actionExecuted = parsed.actionExecuted;
                  }
                }

                // Also handle legacy 'text' field format
                if (parsed.text) {
                  fullContent += parsed.text;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: fullContent }
                        : msg
                    )
                  );
                }

                if (parsed.actionExecuted) {
                  actionExecuted = parsed.actionExecuted;
                }
              } catch {
                // Non-JSON data, might be plain text
                if (data.trim()) {
                  fullContent += data;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId
                        ? { ...msg, content: fullContent }
                        : msg
                    )
                  );
                }
              }
            }
          }
        }
        console.log('[ChatWidget] Final content length:', fullContent.length);
      }

      // Finalize the message - strip ACTION tags from display
      const cleanContent = stripActionTags(fullContent) || "I'm here to help!";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: cleanContent,
                isStreaming: false,
                actionExecuted,
              }
            : msg
        )
      );
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('Request aborted');
        return;
      }

      console.error('Chat error:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: "Sorry, I couldn't process that. Please try again.",
                isStreaming: false,
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, isLoading, sessionId]);

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  // Stop streaming
  const stopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/95">
      {/* Header - Matches web app styling */}
      <div className="drag-region flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          {/* SYNC Avatar - Animated colorful ring */}
          <SyncAvatarMini size={40} />
          <div>
            <h3 className="font-semibold text-white text-sm">SYNC</h3>
            <p className="text-xs text-zinc-500">AI Orchestrator</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Sync Status Indicator */}
          <button
            onClick={handleManualSync}
            disabled={syncStatus?.isSyncing}
            className="no-drag p-2 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
            title={
              syncStatus?.isSyncing
                ? 'Syncing...'
                : syncStatus?.pendingItems
                ? `${syncStatus.pendingItems.summaries + syncStatus.pendingItems.journals} items to sync`
                : 'Synced'
            }
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`${
                syncStatus?.isSyncing
                  ? 'text-purple-400 animate-spin'
                  : syncStatus?.pendingItems &&
                    (syncStatus.pendingItems.summaries > 0 || syncStatus.pendingItems.journals > 0)
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }`}
            >
              <path d="M21 12a9 9 0 0 0-9-9M3 12a9 9 0 0 0 9 9" />
              <path d="M21 3v9h-9M3 21v-9h9" />
            </svg>
          </button>
          {/* Close Button */}
          <button
            onClick={onClose}
            className="no-drag p-2 rounded-lg hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Login Banner */}
        {isAuthenticated === false && (
          <div className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-lg p-4 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-sync-blue to-sync-purple flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">Connect your account</p>
                <p className="text-white/50 text-xs">Sign in to access your data and personalized features</p>
              </div>
            </div>
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="mt-3 w-full py-2 px-4 bg-gradient-to-r from-sync-blue to-sync-purple text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoggingIn ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  Opening browser...
                </span>
              ) : (
                'Sign in with iSyncSO'
              )}
            </button>
          </div>
        )}

        {messages.length === 0 && isAuthenticated !== false && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8">
            <div className="mb-4">
              <SyncAvatarMini size={64} />
            </div>
            <h4 className="text-lg font-medium text-white mb-2">Hey! How can I help?</h4>
            <p className="text-sm text-zinc-500 mb-4 max-w-sm">
              I can help with invoices, products, prospects, and more. Just ask!
            </p>
            {activityContext && !activityContext.isIdle && activityContext.currentApp && (
              <p className="text-xs text-zinc-600">
                I see you're working in {activityContext.currentApp}
              </p>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={msg.role === 'user' ? 'message-user' : 'message-assistant'}
          >
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            {msg.isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-white/60 animate-pulse" />
            )}
            {msg.actionExecuted && (
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
                {msg.actionExecuted.success ? (
                  <span className="text-green-400 text-xs">✓ Action completed</span>
                ) : (
                  <span className="text-red-400 text-xs">✗ Action failed</span>
                )}
                {msg.actionExecuted.redirectUrl && (
                  <button
                    onClick={() =>
                      window.electron.openExternal(
                        `https://app.isyncso.com${msg.actionExecuted!.redirectUrl}`
                      )
                    }
                    className="text-sync-blue text-xs hover:underline"
                  >
                    View in app →
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="message-assistant">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" />
              <span
                className="w-2 h-2 bg-white/40 rounded-full animate-bounce"
                style={{ animationDelay: '0.1s' }}
              />
              <span
                className="w-2 h-2 bg-white/40 rounded-full animate-bounce"
                style={{ animationDelay: '0.2s' }}
              />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input - Matches web app styling */}
      <div className="p-4 border-t border-white/10 bg-zinc-900/80">
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Ask SYNC anything..."
            className="chat-input flex-1"
            disabled={isLoading}
          />
          {isLoading ? (
            <button
              onClick={stopStreaming}
              className="h-12 w-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-zinc-400">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all ${
                input.trim()
                  ? 'bg-purple-600 hover:bg-purple-500 text-white'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-[10px] text-zinc-600 text-center mt-2">
          Press Enter to send • Esc to close
        </p>
      </div>
    </div>
  );
}
