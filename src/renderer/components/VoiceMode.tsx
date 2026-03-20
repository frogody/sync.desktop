/**
 * Voice Mode Component
 *
 * Voice interaction interface for the desktop widget.
 * Uses Web Speech API for recognition and browser speechSynthesis for TTS output.
 * Includes rich activity context for more intelligent responses.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

interface VoiceModeProps {
  onClose: () => void;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface ActivityContext {
  currentApp: string | null;
  focusScore: number;
  isIdle: boolean;
}

export default function VoiceMode({ onClose }: VoiceModeProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() => `voice_${Date.now()}`);
  const [activityContext, setActivityContext] = useState<ActivityContext | null>(null);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Voice input is not available on this system. Try using the chat instead.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setState('listening');
      setTranscript('');
      setError(null);
    };

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results);
      const text = results
        .map((result: any) => result[0].transcript)
        .join(' ');
      setTranscript(text);
    };

    recognition.onend = () => {
      if (state === 'listening' && transcript) {
        processVoiceInput(transcript);
      } else {
        setState('idle');
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      const errorCode = event.error as string;
      if (errorCode === 'no-speech') {
        setError("I didn't hear anything. Please try speaking again.");
      } else if (errorCode === 'audio-capture') {
        setError('Microphone not available. Check your audio settings.');
      } else if (errorCode === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone access in System Settings.');
      } else {
        setError('Voice recognition encountered an issue. Please try again.');
      }
      setState('idle');
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, []);

  // Process voice input
  const processVoiceInput = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setState('idle');
        return;
      }

      setState('processing');
      setResponse('');

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

        // Call sync-voice API with rich context
        const response = await fetch(`${SUPABASE_URL}/functions/v1/sync-voice`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: text,
            sessionId,
            voice: 'tara',
            context: {
              source: 'desktop-app',
              recentActivity: activityText,
              currentApp: detailedContext?.currentApp || null,
              focusScore: detailedContext?.focusScore || 0,
              isIdle: detailedContext?.isIdle || false,
              recentApps: detailedContext?.recentApps?.slice(0, 5) || [],
            },
          }),
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error('AUTH_ERROR');
          } else if (response.status === 429) {
            throw new Error('RATE_LIMIT');
          } else if (response.status >= 500) {
            throw new Error('SERVER_ERROR');
          }
          throw new Error('UNKNOWN_ERROR');
        }

        const data = await response.json();

        const responseText = data.text || '';
        setResponse(responseText);
        setState('speaking');

        // Use browser speechSynthesis for audio output
        if (responseText) {
          const utterance = new SpeechSynthesisUtterance(responseText);
          utterance.rate = 1.0;
          utterance.onend = () => setState('idle');
          utterance.onerror = () => setState('idle');
          speechSynthesis.speak(utterance);
        } else {
          setState('idle');
        }
      } catch (error) {
        console.error('Voice processing error:', error);
        const errMsg = (error as Error).message;
        if (errMsg === 'AUTH_ERROR') {
          setError('Your session has expired. Please sign out and sign back in.');
        } else if (errMsg === 'RATE_LIMIT') {
          setError('Too many requests. Please wait a moment and try again.');
        } else if (errMsg === 'SERVER_ERROR') {
          setError('SYNC is temporarily unavailable. Please try again in a few minutes.');
        } else if (errMsg === 'Failed to fetch' || errMsg === 'NetworkError when attempting to fetch resource.' || errMsg === 'Load failed') {
          setError('Could not reach SYNC. Check your internet connection and try again.');
        } else {
          setError('Could not process your voice input. Please try again.');
        }
        setState('idle');
      }
    },
    [sessionId]
  );

  // Play audio response
  const playAudio = useCallback((base64Audio: string, format: string) => {
    try {
      const audioSrc = `data:audio/${format};base64,${base64Audio}`;
      const audio = new Audio(audioSrc);

      audio.onended = () => {
        setState('idle');
      };

      audio.onerror = () => {
        console.error('Audio playback error');
        setState('idle');
      };

      audioRef.current = audio;
      audio.play();
    } catch (error) {
      console.error('Failed to play audio:', error);
      setState('idle');
    }
  }, []);

  // Start listening
  const startListening = useCallback(() => {
    if (recognitionRef.current && state === 'idle') {
      try {
        recognitionRef.current.start();
      } catch (error) {
        // May already be running
      }
    }
  }, [state]);

  // Stop everything
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    speechSynthesis.cancel();
    setState('idle');
  }, []);

  // Focus trap: keep Tab within voice mode
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleFocusTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', handleFocusTrap);
    return () => container.removeEventListener('keydown', handleFocusTrap);
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Get status text
  const getStatusText = () => {
    switch (state) {
      case 'listening':
        return transcript || 'Listening...';
      case 'processing':
        return 'Processing...';
      case 'speaking':
        return response || 'Speaking...';
      default:
        return 'Tap to speak';
    }
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Header */}
      <div className="drag-region flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-sync-cyan to-sync-purple animate-pulse" />
          <span className="text-white font-medium text-sm">Voice Mode</span>
          {activityContext?.currentApp && (
            <span className="text-white/60 text-xs ml-2">
              • {activityContext.currentApp}
            </span>
          )}
        </div>
        <button onClick={onClose} className="close-button" aria-label="Close voice mode">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 4.586L10.293.293a1 1 0 111.414 1.414L7.414 6l4.293 4.293a1 1 0 01-1.414 1.414L6 7.414l-4.293 4.293a1 1 0 01-1.414-1.414L4.586 6 .293 1.707A1 1 0 011.707.293L6 4.586z" />
          </svg>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Visualization */}
        <div className="relative mb-8">
          {state === 'listening' && (
            <div className="voice-wave">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="voice-bar" />
              ))}
            </div>
          )}

          {state === 'processing' && (
            <div className="w-16 h-16 border-4 border-sync-purple border-t-transparent rounded-full animate-spin" />
          )}

          {state === 'speaking' && (
            <div className="voice-wave">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="voice-bar"
                  style={{
                    background: 'linear-gradient(to top, #06B6D4, #8B5CF6)',
                  }}
                />
              ))}
            </div>
          )}

          {state === 'idle' && (
            <button
              onClick={startListening}
              aria-label="Start recording"
              className="w-20 h-20 rounded-full bg-gradient-to-r from-sync-blue to-sync-purple
                         flex items-center justify-center hover:scale-105 active:scale-95
                         transition-transform shadow-lg shadow-sync-blue/30"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="white"
                className="ml-1"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </button>
          )}
        </div>

        {/* Status Text */}
        <p className="text-white/80 text-center text-sm px-4 max-w-full" role="status" aria-live="assertive">
          {getStatusText()}
        </p>

        {/* Error */}
        <div aria-live="assertive" aria-atomic="true">
          {error && (
            <p className="text-red-400 text-center text-xs mt-2" role="alert">{error}</p>
          )}
        </div>

        {/* Cancel Button */}
        {state !== 'idle' && (
          <button
            onClick={stopListening}
            aria-label="Cancel voice interaction"
            className="mt-6 btn-ghost text-sm"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Hint */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-white/60 text-xs text-center">
          {state === 'idle'
            ? 'Press Escape to close'
            : state === 'listening'
            ? 'Speak clearly, then wait'
            : state === 'processing'
            ? 'Thinking...'
            : 'Responding...'}
        </p>
      </div>
    </div>
  );
}
