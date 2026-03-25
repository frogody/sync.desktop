/**
 * Settings Panel
 *
 * In-app settings UI for SYNC Desktop.
 * Reads and writes AppSettings via IPC (getSettings / setSettings).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AppSettings } from '../../shared/types';

interface SettingsProps {
  onClose: () => void;
}

type Section = 'tracking' | 'sync' | 'privacy' | 'about';

export default function Settings({ onClose }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>('tracking');
  const [version, setVersion] = useState<string>('');

  // Load settings on mount
  useEffect(() => {
    const load = async () => {
      try {
        const result = await (window as any).electron.getSettings();
        if (result.success && result.data) {
          setSettings(result.data);
        } else {
          setError('Could not load settings.');
        }
      } catch {
        setError('Failed to communicate with the app.');
      } finally {
        setLoading(false);
      }
    };

    const loadVersion = async () => {
      try {
        const info = await (window as any).electron.getSystemInfo();
        if (info.success && info.data?.version) {
          setVersion(info.data.version);
        }
      } catch {
        // Non-critical
      }
    };

    load();
    loadVersion();
  }, []);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, [key]: value } : prev);
  }, [settings]);

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const result = await (window as any).electron.setSettings(settings);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error || 'Could not save settings.');
      }
    } catch {
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }, [settings]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#0d0d0d]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d0d0d] gap-3 p-6">
        <p className="text-red-400 text-sm text-center">{error || 'Could not load settings.'}</p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/80 text-sm transition-colors"
        >
          Close
        </button>
      </div>
    );
  }

  const sections: { id: Section; label: string }[] = [
    { id: 'tracking', label: 'Tracking' },
    { id: 'sync', label: 'Sync' },
    { id: 'privacy', label: 'Privacy' },
    { id: 'about', label: 'About' },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-[#0d0d0d] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
        <h1 className="text-sm font-semibold text-white/90 tracking-wide">Settings</h1>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white/90 text-lg leading-none transition-colors w-6 h-6 flex items-center justify-center rounded hover:bg-white/10"
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 flex-shrink-0">
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeSection === s.id
                ? 'text-white border-b-2 border-sync-teal'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {activeSection === 'tracking' && (
          <>
            <Toggle
              label="Activity Tracking"
              description="Monitor active apps and windows"
              value={settings.trackingEnabled}
              onChange={v => update('trackingEnabled', v)}
            />
            <Toggle
              label="Launch at Login"
              description="Start SYNC Desktop when you log in"
              value={settings.launchAtLogin}
              onChange={v => update('launchAtLogin', v)}
            />
            <Toggle
              label="Show in Dock"
              description="Show SYNC Desktop icon in the macOS dock"
              value={settings.showInDock}
              onChange={v => update('showInDock', v)}
            />
            <Select
              label="Data Retention"
              description="How long to keep local activity data"
              value={String(settings.dataRetentionDays)}
              options={[
                { value: '7', label: '7 days' },
                { value: '14', label: '14 days' },
                { value: '30', label: '30 days' },
                { value: '60', label: '60 days' },
                { value: '90', label: '90 days' },
              ]}
              onChange={v => update('dataRetentionDays', Number(v))}
            />
          </>
        )}

        {activeSection === 'sync' && (
          <>
            <Toggle
              label="Auto Sync"
              description="Automatically sync your data to the cloud"
              value={settings.autoSync}
              onChange={v => update('autoSync', v)}
            />
            <Select
              label="Sync Interval"
              description="How often to sync data to the cloud"
              value={String(settings.syncIntervalMinutes)}
              options={[
                { value: '1', label: 'Every minute' },
                { value: '5', label: 'Every 5 minutes' },
                { value: '15', label: 'Every 15 minutes' },
                { value: '30', label: 'Every 30 minutes' },
                { value: '60', label: 'Every hour' },
              ]}
              onChange={v => update('syncIntervalMinutes', Number(v))}
            />
          </>
        )}

        {activeSection === 'privacy' && (
          <>
            <Toggle
              label="Track Browser URLs"
              description="Include website URLs in activity tracking"
              value={settings.trackBrowserUrls}
              onChange={v => update('trackBrowserUrls', v)}
            />
            <Toggle
              label="Anonymize Window Titles"
              description="Replace window titles with app names only"
              value={settings.anonymizeWindowTitles}
              onChange={v => update('anonymizeWindowTitles', v)}
            />
            <div className="mt-2">
              <p className="text-xs text-white/40 leading-relaxed">
                SYNC Desktop only collects app usage data. Sensitive apps (passwords, banking) are always excluded.
              </p>
            </div>
          </>
        )}

        {activeSection === 'about' && (
          <div className="space-y-3">
            <InfoRow label="Version" value={version || 'Unknown'} />
            <InfoRow label="Platform" value="macOS" />
            <div className="pt-2 space-y-2">
              <ExternalLink
                label="Open Web App"
                url="https://app.hyve.com"
              />
              <ExternalLink
                label="Privacy Policy"
                url="https://app.hyve.com/privacy"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {activeSection !== 'about' && (
        <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between flex-shrink-0">
          {error && <p className="text-red-400 text-xs truncate max-w-[60%]">{error}</p>}
          {saved && !error && <p className="text-green-400 text-xs">Saved</p>}
          {!error && !saved && <span />}
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 bg-sync-teal hover:bg-sync-teal-light disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/90 font-medium">{label}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          value ? 'bg-sync-teal' : 'bg-white/20'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function Select({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/90 font-medium">{label}</p>
        <p className="text-xs text-white/40 mt-0.5">{description}</p>
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-white/10 border border-white/20 text-white/90 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-sync-teal cursor-pointer"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#1a1a1a]">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-white/50">{label}</span>
      <span className="text-sm text-white/80 font-medium">{value}</span>
    </div>
  );
}

function ExternalLink({ label, url }: { label: string; url: string }) {
  const open = () => (window as any).electron.openExternal(url);
  return (
    <button
      onClick={open}
      className="w-full text-left text-sm text-sync-teal-light hover:text-sync-teal transition-colors py-1"
    >
      {label} ↗
    </button>
  );
}
