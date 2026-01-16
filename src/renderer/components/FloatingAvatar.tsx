/**
 * Floating Avatar Component
 *
 * The always-visible SYNC avatar that floats on the desktop.
 * Uses SyncAvatarMini component to match the web app exactly.
 */

import React, { useState, useCallback } from 'react';
import SyncAvatarMini from './SyncAvatarMini';

interface FloatingAvatarProps {
  onClick: () => void;
}

export default function FloatingAvatar({ onClick }: FloatingAvatarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.screenX, y: e.screenY });
  }, []);

  // Handle drag
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.screenX - dragStart.x;
      const deltaY = e.screenY - dragStart.y;

      // Only trigger move if dragged more than 5 pixels
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        window.electron.moveWindow(e.screenX - 36, e.screenY - 36);
      }
    },
    [isDragging, dragStart]
  );

  // Handle drag end / click
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      const deltaX = Math.abs(e.screenX - dragStart.x);
      const deltaY = Math.abs(e.screenY - dragStart.y);

      // If didn't drag much, treat as click
      if (deltaX < 5 && deltaY < 5) {
        onClick();
      }

      setIsDragging(false);
    },
    [dragStart, onClick]
  );

  return (
    <div
      className="w-full h-full flex items-center justify-center cursor-pointer"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setIsDragging(false)}
      style={{ background: 'transparent' }}
    >
      {/* Use the same avatar as the web app */}
      <SyncAvatarMini size={64} />
    </div>
  );
}
