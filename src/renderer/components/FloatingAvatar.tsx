/**
 * Floating Avatar Component
 *
 * The always-visible SYNC avatar that floats on the desktop.
 * Uses SyncAvatarMini component to match the web app exactly.
 *
 * Drag handling uses document-level listeners so the cursor can't
 * "escape" the element during fast drags. Position updates use
 * fire-and-forget IPC (send) instead of async invoke, and are
 * throttled to ~60 fps to prevent IPC queue backup.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import SyncAvatarMini from './SyncAvatarMini';

interface FloatingAvatarProps {
  onClick: () => void;
}

export default function FloatingAvatar({ onClick }: FloatingAvatarProps) {
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const lastMoveRef = useRef(0);
  const [, forceRender] = useState(0);

  // Handle drag start — capture the starting cursor position
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    hasDraggedRef.current = false;
    dragStartRef.current = { x: e.screenX, y: e.screenY };
    // Small re-render to change cursor style
    forceRender((n) => n + 1);
  }, []);

  // Document-level mousemove and mouseup — attached while dragging
  // This prevents the cursor from "escaping" the element during fast drags
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      // Throttle to ~60fps (16ms) to prevent IPC queue flood
      const now = Date.now();
      if (now - lastMoveRef.current < 16) return;
      lastMoveRef.current = now;

      const deltaX = e.screenX - dragStartRef.current.x;
      const deltaY = e.screenY - dragStartRef.current.y;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        hasDraggedRef.current = true;
        // Fire-and-forget — no async round-trip needed for position updates
        window.electron.moveWindow(e.screenX - 36, e.screenY - 36);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      forceRender((n) => n + 1);

      // If the cursor barely moved, treat it as a click
      if (!hasDraggedRef.current) {
        onClick();
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onClick]);

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      onMouseDown={handleMouseDown}
      style={{
        background: 'transparent',
        cursor: isDraggingRef.current ? 'grabbing' : 'pointer',
      }}
    >
      <SyncAvatarMini size={64} />
    </div>
  );
}
