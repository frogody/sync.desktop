/**
 * Floating Widget Window
 *
 * The always-on-top SYNC avatar that floats on the desktop.
 * Handles expansion to chat/voice modes.
 */

import { BrowserWindow, screen, app, session } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  WIDGET_SIZES,
  CHAT_WINDOW_SIZE,
  VOICE_WINDOW_SIZE,
} from '../../shared/constants';
import { WidgetMode } from '../../shared/types';

// ============================================================================
// State
// ============================================================================

let floatingWidget: BrowserWindow | null = null;
let currentMode: WidgetMode = 'avatar';
// When true, the native notch widget is active and this widget stays hidden
let nativeWidgetActive: boolean = false;

export function setNativeWidgetActive(active: boolean): void {
  nativeWidgetActive = active;
  if (active && floatingWidget && !floatingWidget.isDestroyed()) {
    floatingWidget.hide();
  }
}

/**
 * Expand the Electron window to login/chat size, bypassing the nativeWidgetActive
 * guard. Used when auth is required even while the native notch widget is running.
 * Temporarily disables nativeWidgetActive so the Electron window can show.
 */
export function expandForLogin(): void {
  if (!floatingWidget || floatingWidget.isDestroyed()) return;

  // Temporarily allow the Electron window to be shown for login
  nativeWidgetActive = false;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  const [currentX, currentY] = floatingWidget.getPosition();
  let newX = currentX;
  let newY = currentY;

  if (newX + CHAT_WINDOW_SIZE.width > screenWidth) {
    newX = screenWidth - CHAT_WINDOW_SIZE.width - 20;
  }
  if (newY + CHAT_WINDOW_SIZE.height > screenHeight) {
    newY = screenHeight - CHAT_WINDOW_SIZE.height - 20;
  }

  floatingWidget.hide();
  floatingWidget.setBounds({
    x: newX,
    y: newY,
    width: CHAT_WINDOW_SIZE.width,
    height: CHAT_WINDOW_SIZE.height,
  });

  setTimeout(() => {
    floatingWidget?.show();
    floatingWidget?.focus();
  }, 100);

  floatingWidget.webContents.send('window:mode-change', 'chat');
  console.log('[widget] expandForLogin: showing Electron window for auth');
}

// ============================================================================
// Preload Path Resolution (LINK-005)
// ============================================================================

function getPreloadPath(): string {
  // In packaged app, __dirname is inside app.asar/dist/main/windows/
  // In dev, __dirname is dist/main/windows/
  // Both resolve the same relative path to dist/preload/index.js
  const preloadPath = path.join(__dirname, '../../preload/index.js');

  // Verify the preload script exists (non-blocking check)
  if (!fs.existsSync(preloadPath)) {
    console.error('[widget] CRITICAL: Preload script not found at:', preloadPath);
    console.error('[widget] __dirname is:', __dirname);
    console.error('[widget] app.isPackaged:', app.isPackaged);
  }

  return preloadPath;
}

// ============================================================================
// Content Security Policy (SEC-027) — production only
// ============================================================================

function setupCSP(): void {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  // Skip CSP in development — Vite HMR requires unsafe-eval and ws: connections
  if (devServerUrl) return;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.together.xyz; " +
          "img-src 'self' data:; " +
          "font-src 'self' data:; " +
          "object-src 'none'; " +
          "base-uri 'self'"
        ],
      },
    });
  });
  console.log('[widget] Content Security Policy enabled');
}

// ============================================================================
// Window Creation
// ============================================================================

export async function createFloatingWidget(): Promise<BrowserWindow> {
  // Set up Content Security Policy before loading any content
  setupCSP();

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  const widgetSize = WIDGET_SIZES.medium;

  // Position in top-right corner with padding
  const x = screenWidth - widgetSize.width - 20;
  const y = 80;

  floatingWidget = new BrowserWindow({
    width: widgetSize.width,
    height: widgetSize.height,
    x,
    y,
    frame: false,
    // Use solid black background - true transparency doesn't work well on macOS
    transparent: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#000000',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    // Round corners for a softer look
    roundedCorners: true,
  });

  // Make window click-through when just showing avatar
  floatingWidget.setIgnoreMouseEvents(false);

  // Prevent window from being closed
  floatingWidget.on('close', (event) => {
    event.preventDefault();
    floatingWidget?.hide();
  });

  // Load the renderer
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    // Development: load from Vite dev server
    console.log('[widget] Loading dev server:', devServerUrl);
    await floatingWidget.loadURL(devServerUrl);
    floatingWidget.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load from built files
    // Renderer is built to dist/renderer, main is built to dist/main
    const indexPath = path.join(__dirname, '../../renderer/index.html');
    console.log('[widget] Loading built files:', indexPath);
    await floatingWidget.loadFile(indexPath);
  }

  // Keep window on top of fullscreen apps on macOS
  floatingWidget.setAlwaysOnTop(true, 'floating', 1);
  floatingWidget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  return floatingWidget;
}

// ============================================================================
// Window State Management
// ============================================================================

export function getFloatingWidget(): BrowserWindow | null {
  return floatingWidget;
}

export function getCurrentMode(): WidgetMode {
  return currentMode;
}

export function expandToChat(): void {
  if (!floatingWidget || nativeWidgetActive) return;

  currentMode = 'chat';

  const [currentX, currentY] = floatingWidget.getPosition();

  // Calculate new position to keep in view
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  let newX = currentX;
  let newY = currentY;

  // Keep within screen bounds
  if (newX + CHAT_WINDOW_SIZE.width > screenWidth) {
    newX = screenWidth - CHAT_WINDOW_SIZE.width - 20;
  }
  if (newY + CHAT_WINDOW_SIZE.height > screenHeight) {
    newY = screenHeight - CHAT_WINDOW_SIZE.height - 20;
  }

  // Hide, resize, and show with delay to prevent macOS size tooltip
  floatingWidget.hide();
  floatingWidget.setBounds({
    x: newX,
    y: newY,
    width: CHAT_WINDOW_SIZE.width,
    height: CHAT_WINDOW_SIZE.height,
  });

  // Delay show to let macOS clear resize state
  setTimeout(() => {
    floatingWidget?.show();
    floatingWidget?.focus();
  }, 100);

  // Notify renderer of mode change
  floatingWidget.webContents.send('window:mode-change', 'chat');
}

export function expandToVoice(): void {
  if (!floatingWidget || nativeWidgetActive) return;

  currentMode = 'voice';

  const [currentX, currentY] = floatingWidget.getPosition();

  // Calculate new position to keep in view
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } =
    primaryDisplay.workAreaSize;

  let newX = currentX;
  let newY = currentY;

  if (newX + VOICE_WINDOW_SIZE.width > screenWidth) {
    newX = screenWidth - VOICE_WINDOW_SIZE.width - 20;
  }
  if (newY + VOICE_WINDOW_SIZE.height > screenHeight) {
    newY = screenHeight - VOICE_WINDOW_SIZE.height - 20;
  }

  // Hide, resize, and show with delay to prevent macOS size tooltip
  floatingWidget.hide();
  floatingWidget.setBounds({
    x: newX,
    y: newY,
    width: VOICE_WINDOW_SIZE.width,
    height: VOICE_WINDOW_SIZE.height,
  });

  // Delay show to let macOS clear resize state
  setTimeout(() => {
    floatingWidget?.show();
    floatingWidget?.focus();
  }, 100);

  floatingWidget.webContents.send('window:mode-change', 'voice');
}

export function collapseToAvatar(): void {
  if (!floatingWidget || nativeWidgetActive) return;

  currentMode = 'avatar';

  const widgetSize = WIDGET_SIZES.medium;
  const [currentX, currentY] = floatingWidget.getPosition();

  // Hide, resize, and show with delay to prevent macOS size tooltip
  floatingWidget.hide();
  floatingWidget.setBounds({
    x: currentX,
    y: currentY,
    width: widgetSize.width,
    height: widgetSize.height,
  });

  // Delay show to let macOS clear resize state
  setTimeout(() => {
    floatingWidget?.show();
    floatingWidget?.focus();
  }, 100);

  floatingWidget.webContents.send('window:mode-change', 'avatar');
}

export function toggleWidget(): void {
  if (!floatingWidget || nativeWidgetActive) return;

  if (floatingWidget.isVisible()) {
    floatingWidget.hide();
  } else {
    floatingWidget.show();
  }
}

export function moveWidget(x: number, y: number): void {
  if (!floatingWidget) return;

  floatingWidget.setPosition(Math.round(x), Math.round(y));
}
