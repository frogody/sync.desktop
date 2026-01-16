/**
 * SYNC Desktop - Main App Component
 *
 * Handles authentication and the three modes: avatar, chat, and voice
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SyncStateProvider } from './context/SyncStateContext';
import FloatingAvatar from './components/FloatingAvatar';
import ChatWidget from './components/ChatWidget';
import VoiceMode from './components/VoiceMode';
import LoginScreen from './components/LoginScreen';

type WidgetMode = 'avatar' | 'chat' | 'voice';
type AppState = 'loading' | 'login' | 'authenticated';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [mode, setMode] = useState<WidgetMode>('avatar');
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await window.electron.getAuthStatus();
        if (result.data?.isAuthenticated) {
          setAppState('authenticated');
          // Collapse to avatar size when authenticated
          window.electron.collapseWindow();
        } else {
          setAppState('login');
          // Expand to login screen size
          window.electron.expandWindow('chat'); // Use chat size for login
        }
      } catch (error) {
        console.error('Failed to check auth:', error);
        setAppState('login');
        window.electron.expandWindow('chat');
      }
    };

    checkAuth();
  }, []);

  // Handle successful login
  const handleLoginSuccess = useCallback(() => {
    setAppState('authenticated');
    setMode('avatar');
    window.electron.collapseWindow();
  }, []);

  // Listen for mode changes from main process
  useEffect(() => {
    const unsubscribe = window.electron.onModeChange((newMode) => {
      setMode(newMode);
    });

    return () => unsubscribe();
  }, []);

  // Handle click patterns: 1=chat, 2=voice, 3=web app
  const handleAvatarClick = useCallback(() => {
    const newCount = clickCount + 1;
    setClickCount(newCount);

    // Clear existing timer
    if (clickTimer) {
      clearTimeout(clickTimer);
    }

    // Set new timer to process clicks
    const timer = setTimeout(() => {
      if (newCount === 1) {
        // Single click - open chat
        window.electron.expandWindow('chat');
      } else if (newCount === 2) {
        // Double click - open voice
        window.electron.expandWindow('voice');
      } else if (newCount >= 3) {
        // Triple click - open web app
        window.electron.openExternal('https://app.isyncso.com');
      }
      setClickCount(0);
    }, 400); // Wait for potential additional clicks

    setClickTimer(timer);
  }, [clickCount, clickTimer]);

  // Handle close/collapse
  const handleClose = useCallback(() => {
    window.electron.collapseWindow();
    setMode('avatar');
  }, []);

  // Determine container class based on mode
  const containerClass =
    mode === 'avatar' ? 'mode-avatar' : mode === 'chat' ? 'mode-chat' : 'mode-voice';

  // Debug: Log mode changes
  useEffect(() => {
    console.log('[App] Current mode:', mode);
  }, [mode]);

  // Show loading state
  if (appState === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Show login screen if not authenticated
  if (appState === 'login') {
    return (
      <div className="w-full h-full bg-black">
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  // Authenticated - show widget modes
  return (
    <SyncStateProvider>
      <div className={`w-full h-full relative ${containerClass}`}>
        {mode === 'avatar' && (
          <FloatingAvatar onClick={handleAvatarClick} />
        )}

        {mode === 'chat' && (
          <ChatWidget onClose={handleClose} />
        )}

        {mode === 'voice' && (
          <VoiceMode onClose={handleClose} />
        )}
      </div>
    </SyncStateProvider>
  );
}
