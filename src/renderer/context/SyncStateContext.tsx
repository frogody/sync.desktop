/**
 * SyncStateContext
 * Shares SYNC agent avatar state across the desktop app
 * Enables synchronized animations and reactive behavior
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

// Types
export type SyncMood = 'listening' | 'thinking' | 'speaking';

export interface SyncState {
  mood: SyncMood;
  level: number;
  seed: number;
  activeAgent: string | null;
  actionEffect: string | null;
  showSuccess: boolean;
  isProcessing: boolean;
  lastActivity: number | null;
}

export interface SyncStateContextValue extends SyncState {
  updateState: (updates: Partial<SyncState>) => void;
  setMood: (mood: SyncMood) => void;
  setActiveAgent: (agentId: string | null) => void;
  triggerActionEffect: (effect: string) => void;
  triggerSuccess: () => void;
  setProcessing: (isProcessing: boolean) => void;
  subscribe: (listener: (state: SyncState) => void) => () => void;
  reset: () => void;
}

// Default state values
const DEFAULT_STATE: SyncState = {
  mood: 'listening',
  level: 0.18,
  seed: 4,
  activeAgent: null,
  actionEffect: null,
  showSuccess: false,
  isProcessing: false,
  lastActivity: null,
};

const SyncStateContext = createContext<SyncStateContextValue | null>(null);

export function SyncStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncState>(DEFAULT_STATE);
  const listenersRef = useRef<Set<(state: SyncState) => void>>(new Set());

  // Update specific state properties
  const updateState = useCallback((updates: Partial<SyncState>) => {
    setState((prev) => {
      const newState = { ...prev, ...updates, lastActivity: Date.now() };
      // Notify listeners
      listenersRef.current.forEach((listener) => listener(newState));
      return newState;
    });
  }, []);

  // Set mood with automatic level adjustment
  const setMood = useCallback(
    (mood: SyncMood) => {
      const levelTargets: Record<SyncMood, number> = {
        speaking: 0.55,
        thinking: 0.35,
        listening: 0.18,
      };
      updateState({ mood, level: levelTargets[mood] || 0.18 });
    },
    [updateState]
  );

  // Set active agent (for delegation visualization)
  const setActiveAgent = useCallback(
    (agentId: string | null) => {
      updateState({ activeAgent: agentId });
    },
    [updateState]
  );

  // Trigger action effect
  const triggerActionEffect = useCallback(
    (effect: string) => {
      updateState({ actionEffect: effect });
      // Clear effect after animation
      setTimeout(() => updateState({ actionEffect: null }), 2000);
    },
    [updateState]
  );

  // Show success animation
  const triggerSuccess = useCallback(() => {
    updateState({ showSuccess: true });
    setTimeout(() => updateState({ showSuccess: false }), 1500);
  }, [updateState]);

  // Set processing state
  const setProcessing = useCallback(
    (isProcessing: boolean) => {
      updateState({
        isProcessing,
        mood: isProcessing ? 'thinking' : 'listening',
      });
    },
    [updateState]
  );

  // Subscribe to state changes (for external listeners)
  const subscribe = useCallback((listener: (state: SyncState) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // Reset to default state
  const reset = useCallback(() => {
    setState(DEFAULT_STATE);
  }, []);

  const value: SyncStateContextValue = {
    ...state,
    updateState,
    setMood,
    setActiveAgent,
    triggerActionEffect,
    triggerSuccess,
    setProcessing,
    subscribe,
    reset,
  };

  return (
    <SyncStateContext.Provider value={value}>{children}</SyncStateContext.Provider>
  );
}

export function useSyncState(): SyncStateContextValue {
  const context = useContext(SyncStateContext);
  if (!context) {
    // Return default state if not within provider (graceful fallback)
    return {
      ...DEFAULT_STATE,
      updateState: () => {},
      setMood: () => {},
      setActiveAgent: () => {},
      triggerActionEffect: () => {},
      triggerSuccess: () => {},
      setProcessing: () => {},
      subscribe: () => () => {},
      reset: () => {},
    };
  }
  return context;
}

export default SyncStateContext;
