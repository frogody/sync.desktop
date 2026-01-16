/**
 * Voice Mode Component
 *
 * Voice interaction interface for the desktop widget.
 * Uses Web Speech API for recognition and Together.ai TTS via sync-voice endpoint.
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
      setError('Speech recognition not supported');
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
      if (event.error !== 'no-speech') {
        setError(`Recognition error: ${event.error}`);
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
          throw new Error('Failed to get response');
        }

        const data = await response.json();

        setResponse(data.text);
        setState('speaking');

        // Play audio response
        if (data.audio) {
          playAudio(data.audio, data.audioFormat || 'mp3');
        } else {
          setState('idle');
        }
      } catch (error) {
        console.error('Voice processing error:', error);
        setError('Failed to process voice input');
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
    setState('idle');
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="drag-region flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gradient-to-r from-sync-cyan to-sync-purple animate-pulse" />
          <span className="text-white font-medium text-sm">Voice Mode</span>
          {activityContext?.currentApp && (
            <span className="text-white/40 text-xs ml-2">
              • {activityContext.currentApp}
            </span>
          )}
        </div>
        <button onClick={onClose} className="close-button">
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
        <p className="text-white/80 text-center text-sm px-4 max-w-full">
          {getStatusText()}
        </p>

        {/* Error */}
        {error && (
          <p className="text-red-400 text-center text-xs mt-2">{error}</p>
        )}

        {/* Cancel Button */}
        {state !== 'idle' && (
          <button
            onClick={stopListening}
            className="mt-6 btn-ghost text-sm"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Hint */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-white/40 text-xs text-center">
          {state === 'idle'
            ? 'Press Escape to close'
            : state === 'listening'
            ? 'Speak clearly, then wait'
            : 'Please wait...'}
        </p>
      </div>
    </div>
  );
}
