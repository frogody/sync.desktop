/**
 * Health Check Service (INF-009)
 *
 * Provides basic health monitoring for background services.
 * Exposes service status via IPC so the renderer can display it.
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipcChannels';

// ============================================================================
// Types
// ============================================================================

export type ServiceStatus = 'running' | 'stopped' | 'error' | 'degraded';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastActivity: number | null; // epoch ms
  error?: string;
}

export interface HealthReport {
  timestamp: number;
  services: ServiceHealth[];
}

type HealthProvider = () => ServiceHealth;

// ============================================================================
// Health Check Registry
// ============================================================================

const providers: Map<string, HealthProvider> = new Map();

/**
 * Register a health check provider for a service.
 * Call this from each service during initialization.
 */
export function registerHealthProvider(name: string, provider: HealthProvider): void {
  providers.set(name, provider);
}

/**
 * Collect health from all registered providers.
 */
export function getHealthReport(): HealthReport {
  const services: ServiceHealth[] = [];

  for (const [name, provider] of providers) {
    try {
      services.push(provider());
    } catch (err) {
      services.push({
        name,
        status: 'error',
        lastActivity: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    timestamp: Date.now(),
    services,
  };
}

/**
 * Register the IPC handler for health checks.
 * Call once during app initialization.
 */
export function initHealthCheckIpc(): void {
  ipcMain.handle(IPC_CHANNELS.HEALTH_CHECK, () => {
    return getHealthReport();
  });
}

/**
 * Validate critical environment config at startup (INF-013/INF-015).
 * Logs warnings for missing values but does not crash.
 */
export function validateStartupConfig(): void {
  const togetherKey = process.env.TOGETHER_API_KEY;

  if (!togetherKey) {
    console.warn('[config] TOGETHER_API_KEY not set — semantic analysis will run in degraded (quick-analysis-only) mode');
  } else if (togetherKey.length < 20) {
    console.warn('[config] TOGETHER_API_KEY appears too short — semantic analysis may fail');
  }

  if (process.env.NODE_ENV !== 'development' && !process.env.VITE_DEV_SERVER_URL) {
    // Production checks
    if (!process.env.APPLE_TEAM_ID) {
      console.warn('[config] APPLE_TEAM_ID not set — macOS notarization will be skipped');
    }
  }
}
