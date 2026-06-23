/**
 * SYNC Desktop - Main App Component
 *
 * Handles authentication, permissions setup, and the three modes: avatar, chat, and voice
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SyncStateProvider } from './context/SyncStateContext';
import FloatingAvatar from './components/FloatingAvatar';
import ChatWidget from './components/ChatWidget';
import CommandBar from './components/CommandBar';
import VoiceMode from './components/VoiceMode';
import LoginScreen from './components/LoginScreen';
import PermissionsSetup from './components/PermissionsSetup';
import SemanticDashboard from './components/SemanticDashboard';
import Settings from './components/Settings';
import { WEB_APP_URL } from './config';

type WidgetMode = 'avatar' | 'chat' | 'voice' | 'settings' | 'command';
type AppState = 'loading' | 'login' | 'permissions' | 'authenticated';

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [mode, setMode] = useState<WidgetMode>('avatar');
  const [showDashboard, setShowDashboard] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);

  // Check auth and permissions status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const result = await window.electron.getAuthStatus();
        if (result.data?.isAuthenticated) {
          // Authenticated — check if permissions are granted
          if (window.electron.platform === 'darwin') {
            const permResult = await window.electron.checkPermissions();
            const perms = permResult?.data;
            if (perms && !perms.accessibility) {
              // Missing required permissions — show setup
              setAppState('permissions');
              window.electron.showLoginWindow();
              return;
            }
          }
          setAppState('authenticated');
          window.electron.collapseWindow();
        } else {
          setAppState('login');
          window.electron.showLoginWindow();
        }
      } catch (error) {
        console.error('Failed to check auth:', error);
        setAppState('login');
        window.electron.showLoginWindow();
      }
    };

    checkAuth();
  }, []);

  // Handle successful login — check permissions next
  const handleLoginSuccess = useCallback(async () => {
    if (window.electron.platform === 'darwin') {
      try {
        const permResult = await window.electron.checkPermissions();
        const perms = permResult?.data;
        if (perms && !perms.accessibility) {
          setAppState('permissions');
          return;
        }
      } catch (err) {
        console.error('Failed to check permissions:', err);
      }
    }
    setAppState('authenticated');
    setMode('avatar');
    window.electron.collapseWindow();
  }, []);

  // Handle permissions setup complete
  const handlePermissionsComplete = useCallback(() => {
    setAppState('authenticated');
    setMode('avatar');
    window.electron.collapseWindow();
  }, []);

  // Listen for mode changes from main process
  useEffect(() => {
    const unsubscribe = window.electron.onModeChange((newMode: WidgetMode) => {
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
        // Chat popup is retired — single click opens the command bar
        window.electron.expandWindow('command');
      } else if (newCount === 2) {
        window.electron.expandWindow('voice');
      } else if (newCount >= 3) {
        window.electron.openExternal(WEB_APP_URL);
      }
      setClickCount(0);
    }, 400);

    setClickTimer(timer);
  }, [clickCount, clickTimer]);

  // Handle close/collapse
  const handleClose = useCallback(() => {
    window.electron.collapseWindow();
    setMode('avatar');
  }, []);

  // Determine container class based on mode
  const containerClass =
    mode === 'avatar' ? 'mode-avatar'
    : mode === 'voice' ? 'mode-voice'
    : mode === 'command' ? 'mode-command'
    : 'mode-chat';

  // Debug: Log mode changes
  useEffect(() => {
    console.log('[App] Current mode:', mode);
  }, [mode]);

  // Show loading state
  if (appState === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black" role="status" aria-label="Loading SYNC Desktop">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  // The command bar is a global-shortcut surface — it should open in any auth
  // state (it sends via the anon path when logged out and can prompt sign-in),
  // so render it before the login/permissions gates.
  if (mode === 'command') {
    return (
      <div className="w-full h-full">
        <CommandBar />
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
          <div aria-description="Click once for chat, double-click for voice, triple-click for web app" title="Click: Chat | Double-click: Voice | Triple-click: Web app">
            <FloatingAvatar onClick={handleAvatarClick} />
          </div>
        )}

        {mode === 'chat' && !showDashboard && (
          <ChatWidget onClose={handleClose} onDashboard={() => setShowDashboard(true)} />
        )}

        {mode === 'chat' && showDashboard && (
          <SemanticDashboard onBack={() => setShowDashboard(false)} />
        )}

        {mode === 'voice' && (
          <VoiceMode onClose={handleClose} />
        )}

        {mode === 'settings' && (
          <Settings onClose={handleClose} />
        )}
      </div>
    </SyncStateProvider>
  );
}
