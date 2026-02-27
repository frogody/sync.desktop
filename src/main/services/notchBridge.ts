/**
 * Notch Bridge Service
 *
 * Spawns the native SYNCWidget Swift helper app and manages
 * bidirectional JSON communication over stdin/stdout.
 *
 * The Swift helper handles the native macOS notch widget UI
 * and runs a local MLX model for action classification.
 * This bridge forwards context events for classification and
 * relays action lifecycle messages between Swift and ActionService.
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app, shell, systemPreferences } from 'electron';
import { getAccessToken, getUser } from '../store';
import { getFloatingWidget, setNativeWidgetActive } from '../windows/floatingWidget';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../shared/constants';
import type { ContextEvent } from '../../deep-context/types';
import type { DeepContextEngine } from '../../deep-context';

// ============================================================================
// Types
// ============================================================================

interface BridgeMessage {
  type: string;
  payload: Record<string, unknown>;
}

/** Action to show in the notch widget */
export interface NotchAction {
  id: string;
  title: string;
  subtitle?: string;
  actionType: string;
}

/** Action detected by the Swift MLX classifier */
export interface DetectedAction {
  id: string;
  eventHash: string;
  title: string;
  actionType: string;
  confidence: number;
  localPayload: Record<string, unknown>;
}

// ============================================================================
// NotchBridge Class
// ============================================================================

export class NotchBridge extends EventEmitter {
  private process: ChildProcess | null = null;
  private buffer: string = '';
  private isStarted: boolean = false;
  private restartCount: number = 0;
  private maxRestarts: number = 3;
  private deepContextEngine: DeepContextEngine | null = null;
  private contextEventHandler: ((event: ContextEvent) => void) | null = null;

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

    // Don't launch the native widget without accessibility permission --
    // it uses NSEvent.addGlobalMonitorForEvents which triggers the macOS dialog
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      console.log('[notch-bridge] Accessibility not granted -- skipping native widget');
      return;
    }

    console.log('[notch-bridge] Launching SYNCWidget:', widgetPath);
    this.isStarted = true;

    this.process = spawn(widgetPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Suppress EPIPE errors when writing to stdin of a crashed process
    this.process.stdin?.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return;
      console.error('[notch-bridge] stdin error:', err.message);
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
  }

  stop(): void {
    if (!this.isStarted) return;

    console.log('[notch-bridge] Stopping...');
    this.isStarted = false;

    // Unsubscribe from DeepContextEngine
    this.unwireDeepContext();

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
  // DeepContextEngine Wiring
  // ============================================================================

  /** Connect to a DeepContextEngine to automatically forward context events to Swift */
  wireDeepContext(engine: DeepContextEngine): void {
    this.unwireDeepContext(); // Clean up any previous subscription

    this.deepContextEngine = engine;
    this.contextEventHandler = (event: ContextEvent) => {
      this.sendContextEvent(event);
    };

    engine.on('event', this.contextEventHandler);
    console.log('[notch-bridge] Wired to DeepContextEngine events');
  }

  /** Disconnect from the DeepContextEngine */
  private unwireDeepContext(): void {
    if (this.deepContextEngine && this.contextEventHandler) {
      this.deepContextEngine.removeListener('event', this.contextEventHandler);
      this.deepContextEngine = null;
      this.contextEventHandler = null;
      console.log('[notch-bridge] Unwired from DeepContextEngine');
    }
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

  /** Send a context event to Swift for MLX classification */
  sendContextEvent(event: ContextEvent): void {
    this.send({
      type: 'context_event',
      payload: {
        eventType: event.eventType,
        summary: event.semanticPayload.summary,
        entities: event.semanticPayload.entities,
        commitments: event.semanticPayload.commitments || [],
        intent: event.semanticPayload.intent || null,
        source: {
          application: event.source.application,
          windowTitle: event.source.windowTitle,
          url: event.source.url || null,
          filePath: event.source.filePath || null,
        },
        confidence: event.confidence,
        timestamp: event.timestamp,
      },
    });
  }

  /** Show an action in the notch widget (cloud-enriched or new) */
  sendAction(action: NotchAction): void {
    this.send({
      type: 'show_action',
      payload: {
        id: action.id,
        title: action.title,
        subtitle: action.subtitle || null,
        actionType: action.actionType,
      },
    });
  }

  /** Hide/dismiss an action from the notch widget */
  hideAction(id: string, reason?: string): void {
    this.send({
      type: 'hide_action',
      payload: {
        id,
        reason: reason || null,
      },
    });
  }

  /** Send the result of an executed action to the notch widget */
  sendActionResult(id: string, success: boolean, message?: string): void {
    this.send({
      type: 'action_result',
      payload: {
        id,
        success,
        message: message || null,
      },
    });
  }

  // ============================================================================
  // Handle Messages (Swift -> Electron)
  // ============================================================================

  private handleMessage(msg: BridgeMessage): void {
    switch (msg.type) {
      case 'ready':
        console.log('[notch-bridge] SYNCWidget ready');
        this.restartCount = 0; // Reset restart counter on successful startup
        // Send initial config
        this.sendAuthUpdate();
        // Permanently suppress old BrowserWindow widget -- native notch widget takes over
        setNativeWidgetActive(true);
        this.hideOldWidget();
        break;

      case 'widget_state':
        console.log('[notch-bridge] Widget state:', msg.payload.state);
        break;

      case 'action_detected': {
        // MLX model detected an actionable event
        const detected: DetectedAction = {
          id: msg.payload.id as string,
          eventHash: msg.payload.eventHash as string,
          title: msg.payload.title as string,
          actionType: msg.payload.actionType as string,
          confidence: msg.payload.confidence as number,
          localPayload: (msg.payload.localPayload as Record<string, unknown>) || {},
        };
        console.log('[notch-bridge] Action detected:', detected.title, `(${detected.confidence})`);
        this.emit('action_detected', detected);
        break;
      }

      case 'action_approved': {
        const id = msg.payload.id as string;
        console.log('[notch-bridge] Action approved:', id);
        this.emit('action_approved', { id });
        break;
      }

      case 'action_dismissed': {
        const id = msg.payload.id as string;
        console.log('[notch-bridge] Action dismissed:', id);
        this.emit('action_dismissed', { id });
        break;
      }

      case 'request_auth':
        this.sendAuthUpdate();
        break;

      case 'open_external':
        if (typeof msg.payload.url === 'string') {
          shell.openExternal(msg.payload.url);
        }
        break;

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
