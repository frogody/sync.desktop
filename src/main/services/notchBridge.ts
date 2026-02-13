/**
 * Notch Bridge Service
 *
 * Spawns the native SYNCWidget Swift helper app and manages
 * bidirectional JSON communication over stdin/stdout.
 *
 * The Swift helper handles the native macOS notch widget UI,
 * while this bridge provides it with auth tokens, activity context,
 * and other state from the Electron main process.
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app, shell } from 'electron';
import { getAccessToken, getUser } from '../store';
import { getContextManager, getCloudSyncService, getActivityTracker } from '../index';
import { getFloatingWidget, setNativeWidgetActive } from '../windows/floatingWidget';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../shared/constants';

// ============================================================================
// Types
// ============================================================================

interface BridgeMessage {
  type: string;
  payload: Record<string, unknown>;
}

// ============================================================================
// NotchBridge Class
// ============================================================================

export class NotchBridge {
  private process: ChildProcess | null = null;
  private buffer: string = '';
  private contextInterval: NodeJS.Timeout | null = null;
  private isStarted: boolean = false;
  private restartCount: number = 0;
  private maxRestarts: number = 3;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  start(): void {
    if (this.isStarted) return;

    const widgetPath = this.getWidgetPath();

    // Check if the widget binary exists
    const fs = require('fs');
    if (!fs.existsSync(widgetPath)) {
      console.log('[notch-bridge] SYNCWidget not found at:', widgetPath);
      console.log('[notch-bridge] Falling back to BrowserWindow widget');
      return;
    }

    console.log('[notch-bridge] Launching SYNCWidget:', widgetPath);
    this.isStarted = true;

    this.process = spawn(widgetPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Read stdout: newline-delimited JSON from Swift
    this.process.stdout?.setEncoding('utf8');
    this.process.stdout?.on('data', (data: string) => {
      this.buffer += data;
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg: BridgeMessage = JSON.parse(line);
          this.handleMessage(msg);
        } catch (e) {
          console.error('[notch-bridge] Failed to parse:', line.substring(0, 100));
        }
      }
    });

    // Log stderr from Swift helper
    this.process.stderr?.setEncoding('utf8');
    this.process.stderr?.on('data', (data: string) => {
      const trimmed = data.trim();
      if (trimmed) {
        console.error('[notch-widget-stderr]', trimmed);
      }
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[notch-bridge] SYNCWidget exited (code: ${code}, signal: ${signal})`);
      const shouldRestart = this.isStarted && code !== 0 && this.restartCount < this.maxRestarts;
      this.process = null;
      this.isStarted = false;

      // Show old widget as fallback if native widget died permanently
      if (!shouldRestart) {
        setNativeWidgetActive(false);
        this.showOldWidget();
      }

      // Auto-restart if it crashed unexpectedly (not a clean shutdown)
      if (shouldRestart) {
        this.restartCount++;
        console.log(`[notch-bridge] Restarting (attempt ${this.restartCount}/${this.maxRestarts})...`);
        setTimeout(() => this.start(), 2000);
      }
    });

    this.process.on('error', (err) => {
      console.error('[notch-bridge] Failed to spawn SYNCWidget:', err.message);
      this.process = null;
      this.isStarted = false;
    });

    // Send context updates every 30 seconds
    this.contextInterval = setInterval(() => {
      this.sendContextUpdate();
    }, 30000);
  }

  stop(): void {
    if (!this.isStarted) return;

    console.log('[notch-bridge] Stopping...');
    this.isStarted = false;

    if (this.contextInterval) {
      clearInterval(this.contextInterval);
      this.contextInterval = null;
    }

    if (this.process) {
      // Send shutdown message, then force-kill after 2 seconds
      this.send({ type: 'shutdown', payload: {} });
      const proc = this.process;
      setTimeout(() => {
        if (proc && !proc.killed) {
          proc.kill('SIGTERM');
        }
      }, 2000);
    }
  }

  get running(): boolean {
    return this.isStarted && this.process !== null;
  }

  // ============================================================================
  // Widget Path Resolution
  // ============================================================================

  private getWidgetPath(): string {
    if (app.isPackaged) {
      // Production: bundled in app's Resources directory
      return path.join(
        process.resourcesPath,
        'SYNCWidget.app',
        'Contents',
        'MacOS',
        'SYNCWidget'
      );
    }

    // Development: use local build output
    return path.join(
      app.getAppPath(),
      'native',
      'SYNCWidget',
      'build',
      'SYNCWidget.app',
      'Contents',
      'MacOS',
      'SYNCWidget'
    );
  }

  // ============================================================================
  // Old Widget Management
  // ============================================================================

  private hideOldWidget(): void {
    try {
      const widget = getFloatingWidget();
      if (widget && !widget.isDestroyed() && widget.isVisible()) {
        widget.hide();
        console.log('[notch-bridge] Old floating widget hidden');
      }
    } catch (e) {
      // Widget might not exist yet
    }
  }

  private showOldWidget(): void {
    try {
      const widget = getFloatingWidget();
      if (widget && !widget.isDestroyed() && !widget.isVisible()) {
        widget.show();
        console.log('[notch-bridge] Old floating widget restored (fallback)');
      }
    } catch (e) {
      // Widget might not exist
    }
  }

  // ============================================================================
  // Context Update Interval Management
  // ============================================================================

  private setContextUpdateInterval(ms: number): void {
    if (this.contextInterval) {
      clearInterval(this.contextInterval);
    }
    this.contextInterval = setInterval(() => {
      this.sendContextUpdate();
    }, ms);
  }

  // ============================================================================
  // Send Messages (Electron -> Swift)
  // ============================================================================

  private send(msg: BridgeMessage): void {
    if (!this.process?.stdin?.writable) return;

    try {
      const json = JSON.stringify(msg);
      this.process.stdin.write(json + '\n');
    } catch (e) {
      // Ignore write errors (process may have exited)
    }
  }

  /** Send auth config to the Swift widget */
  sendAuthUpdate(): void {
    const token = getAccessToken();
    const user = getUser();

    if (!token || !user) {
      console.log('[notch-bridge] No auth to send (token:', !!token, 'user:', !!user, ')');
      return;
    }

    this.send({
      type: 'config',
      payload: {
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        accessToken: token,
        userId: user.id,
        userEmail: user.email,
        userName: user.name || '',
        companyId: (user as any).companyId || '',
        sessionId: `sync_user_${user.id}`,
      },
    });
  }

  /** Send current activity context to the Swift widget */
  sendContextUpdate(): void {
    const cm = getContextManager();
    if (!cm) return;

    try {
      const snapshot = cm.getFreshContext();
      this.send({
        type: 'context_update',
        payload: {
          currentApp: snapshot.currentApp || '',
          focusScore: snapshot.focusScore,
          isIdle: snapshot.isIdle,
          recentApps: snapshot.recentApps
            .slice(0, 5)
            .map((a) => a.app),
          recentActivity: cm.getContextForSync(),
        },
      });
    } catch (e) {
      // Context manager might not be ready yet
    }
  }

  /** Send sync status to the Swift widget */
  sendSyncStatus(): void {
    const sync = getCloudSyncService();
    if (!sync) return;

    try {
      const status = sync.getStatus();
      this.send({
        type: 'sync_status',
        payload: {
          isSyncing: status.isSyncing,
          lastSyncTime: status.lastSyncTime?.toISOString() || null,
          pendingItems: status.pendingItems || 0,
        },
      });
    } catch (e) {
      // Sync service might not be ready
    }
  }

  // ============================================================================
  // Handle Messages (Swift -> Electron)
  // ============================================================================

  private handleMessage(msg: BridgeMessage): void {
    switch (msg.type) {
      case 'ready':
        console.log('[notch-bridge] SYNCWidget ready');
        this.restartCount = 0; // Reset restart counter on successful startup
        // Send initial config and context
        this.sendAuthUpdate();
        this.sendContextUpdate();
        // Permanently suppress old BrowserWindow widget — native notch widget takes over
        setNativeWidgetActive(true);
        this.hideOldWidget();
        break;

      case 'widget_state':
        console.log('[notch-bridge] Widget state:', msg.payload.state);
        break;

      case 'context_boost': {
        // Widget entered interactive state — boost activity polling to near-real-time
        const interval = (msg.payload.interval as number) || 1000;
        console.log('[notch-bridge] Context boost: polling every', interval, 'ms');
        const tracker = getActivityTracker();
        if (tracker) {
          tracker.setPollInterval(interval);
        }
        // Also increase context update frequency
        this.setContextUpdateInterval(interval);
        break;
      }

      case 'context_normal':
        // Widget returned to idle — restore normal polling
        console.log('[notch-bridge] Context normal: restoring default polling');
        {
          const tracker = getActivityTracker();
          if (tracker) {
            tracker.setPollInterval(5000);
          }
        }
        this.setContextUpdateInterval(30000);
        break;

      case 'request_context':
        this.sendContextUpdate();
        break;

      case 'request_auth':
        this.sendAuthUpdate();
        break;

      case 'open_external':
        if (typeof msg.payload.url === 'string') {
          shell.openExternal(msg.payload.url);
        }
        break;

      case 'trigger_sync': {
        const sync = getCloudSyncService();
        if (sync) {
          sync.forceSync().then((result) => {
            console.log('[notch-bridge] Manual sync result:', result);
            this.sendSyncStatus();
          }).catch((err) => {
            console.error('[notch-bridge] Manual sync error:', err);
          });
        }
        break;
      }

      case 'log': {
        const level = msg.payload.level as string || 'info';
        const message = msg.payload.message as string || '';
        if (level === 'error') {
          console.error('[notch-widget]', message);
        } else {
          console.log('[notch-widget]', message);
        }
        break;
      }

      case 'error':
        console.error('[notch-widget] Error:', msg.payload.message);
        break;

      default:
        console.log('[notch-bridge] Unknown message type:', msg.type);
    }
  }
}
