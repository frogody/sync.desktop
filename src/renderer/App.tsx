/**
 * SYNC Desktop - Main App Component
 *
 * Handles authentication, permissions setup, and the three modes: avatar, chat, and voice
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SyncStateProvider } from './context/SyncStateContext';
import FloatingAvatar from './components/FloatingAvatar';
import ChatWidget from './components/ChatWidget';
import VoiceMode from './components/VoiceMode';
import LoginScreen from './components/LoginScreen';
import PermissionsSetup from './components/PermissionsSetup';

type WidgetMode = 'avatar' | 'chat' | 'voice';
type AppState = 'loading' | 'login' | 'permissions' | 'authenticated';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [mode, setMode] = useState<WidgetMode>('avatar');
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);

  // Check auth and permissions status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await (window as any).electron.getAuthStatus();
        if (result.data?.isAuthenticated) {
          // Authenticated — check if permissions are granted
          if ((window as any).electron.platform === 'darwin') {
            const permResult = await (window as any).electron.checkPermissions();
            const perms = permResult?.data;
            if (perms && (!perms.accessibility || !perms.screenCapture)) {
              // Missing required permissions — show setup
              setAppState('permissions');
              (window as any).electron.expandWindow('chat');
              return;
            }
          }
          setAppState('authenticated');
          (window as any).electron.collapseWindow();
        } else {
          setAppState('login');
          (window as any).electron.expandWindow('chat');
        }
      } catch (error) {
        console.error('Failed to check auth:', error);
        setAppState('login');
        (window as any).electron.expandWindow('chat');
      }
    };

    checkAuth();
  }, []);

  // Handle successful login — check permissions next
  const handleLoginSuccess = useCallback(async () => {
    if ((window as any).electron.platform === 'darwin') {
      try {
        const permResult = await (window as any).electron.checkPermissions();
        const perms = permResult?.data;
        if (perms && (!perms.accessibility || !perms.screenCapture)) {
          setAppState('permissions');
          return;
        }
      } catch (err) {
        console.error('Failed to check permissions:', err);
      }
    }
    setAppState('authenticated');
    setMode('avatar');
    (window as any).electron.collapseWindow();
  }, []);

  // Handle permissions setup complete
  const handlePermissionsComplete = useCallback(() => {
    setAppState('authenticated');
    setMode('avatar');
    (window as any).electron.collapseWindow();
  }, []);

  // Listen for mode changes from main process
  useEffect(() => {
    const unsubscribe = (window as any).electron.onModeChange((newMode: WidgetMode) => {
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
        (window as any).electron.expandWindow('chat');
      } else if (newCount === 2) {
        (window as any).electron.expandWindow('voice');
      } else if (newCount >= 3) {
        (window as any).electron.openExternal('https://app.isyncso.com');
      }
      setClickCount(0);
    }, 400);

    setClickTimer(timer);
  }, [clickCount, clickTimer]);

  // Handle close/collapse
  const handleClose = useCallback(() => {
    (window as any).electron.collapseWindow();
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

  // Show permissions setup if needed
  if (appState === 'permissions') {
    return (
      <div className="w-full h-full mode-chat">
        <PermissionsSetup onComplete={handlePermissionsComplete} />
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
