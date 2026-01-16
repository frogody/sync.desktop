# SYNC Desktop - Development Guide

This document contains all context needed to continue development on the SYNC Desktop Electron app.

---

## Project Overview

SYNC Desktop is a cross-platform Electron app that:
1. **Tracks user activity** - Active windows, apps, context (5-second polling)
2. **Maintains rolling context** - Detailed last 10 minutes + focus score
3. **Generates summaries** - Hourly summaries and daily journals automatically
4. **Syncs with app.isyncso.com** - Uploads data to Supabase cloud
5. **Floating avatar widget** - Always-on-top SYNC avatar with click interactions
6. **Chat interface** - Same capabilities as web app, with desktop activity context

---

## Project Locations

| Project | Path | Purpose |
|---------|------|---------|
| Desktop App | `/Users/daviddebruin/sync-desktop` | Electron desktop application |
| Web App | `/Users/daviddebruin/app.isyncso` | React web app (Vercel auto-deploy) |

---

## Supabase Configuration

```
Project ID: sfxpmzicgpaxfntqleig
API URL: https://sfxpmzicgpaxfntqleig.supabase.co
Anon Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmeHBtemljZ3BheGZudHFsZWlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MDY0NjIsImV4cCI6MjA4MjE4MjQ2Mn0.337ohi8A4zu_6Hl1LpcPaWP8UkI5E4Om7ZgeU9_A8t4
```

---

## FEATURE IMPLEMENTATION STATUS

### ✅ FULLY WORKING

| Feature | Implementation | Key Files |
|---------|----------------|-----------|
| **Activity Tracking** | Polls active window every 5 seconds, stores to SQLite, privacy filtering for sensitive apps | `src/main/services/activityTracker.ts` |
| **10-Min Rolling Context** | Snapshots every 60 seconds, focus score calculation, work pattern categorization, app usage percentages | `src/main/services/contextManager.ts` |
| **Hourly Summaries** | Auto-generated at top of each hour, app breakdown, focus score, stored with `synced: false` | `src/main/services/summaryService.ts` |
| **Daily Journals** | Auto-generated at 12:05 AM, aggregates hourly summaries, highlights, peak productivity hour | `src/main/services/journalService.ts` |
| **Cloud Sync** | Uploads unsynced summaries/journals to Supabase every 5 minutes, offline-first | `src/main/services/cloudSyncService.ts` |
| **Context → SYNC Chat** | Activity context sent with every chat message (currentApp, focusScore, recentApps, isIdle) | `src/renderer/components/ChatWidget.tsx` |
| **Click Interactions** | 1-click=chat, 2-click=voice, 3-click=web app (400ms debounce) | `src/renderer/App.tsx` |
| **Permissions (macOS)** | Accessibility and screen capture permission checks/prompts | `src/main/services/permissions.ts` |
| **Auto-Updates** | electron-updater with GitHub releases, 4-hour check interval | `src/main/services/autoUpdater.ts` |
| **Auth Deep Links** | `isyncso://` protocol, state validation, user info fetching | `src/main/index.ts` |
| **Login UI** | "Sign in with iSyncSO" button, auth callback listener | `src/renderer/components/ChatWidget.tsx` |

### ⚠️ PARTIALLY WORKING

| Feature | What Works | What's Missing |
|---------|------------|----------------|
| **Voice Mode** | UI component exists, Web Speech API for input, audio playback | Depends on `sync-voice` edge function (not in this repo) |
| **Settings UI** | Backend works (`AppSettings` in store, IPC handlers) | No frontend Settings panel component |

### ❌ NOT IMPLEMENTED

| Feature | Notes |
|---------|-------|
| **Screen Capture/OCR** | Mentioned in original plan, permission check exists, but no actual capture/OCR code |
| **Settings Panel** | `AppSettings` interface ready, just needs UI component |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ELECTRON MAIN PROCESS                        │
│                                                                  │
│  ActivityTracker ──→ ContextManager ──→ SummaryService          │
│       (5s poll)        (60s snapshots)    (hourly aggregation)  │
│                              │                    │              │
│                              │                    ▼              │
│                              │            JournalService         │
│                              │            (daily at 12:05 AM)    │
│                              │                    │              │
│                              ▼                    ▼              │
│                         CloudSyncService ◄────────┘              │
│                         (uploads to Supabase every 5 min)        │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ SQLite DB   │  │ Scheduler   │  │ IPC Bridge  │              │
│  │ (local)     │  │ (cron-like) │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                     RENDERER PROCESS                             │
│                          │                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Floating    │  │ Chat        │  │ Voice       │              │
│  │ Avatar      │  │ Widget      │  │ Mode        │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                           │
                    Supabase API
                           │
┌──────────────────────────┴───────────────────────────────────────┐
│                  app.isyncso.com (Supabase)                      │
│                                                                  │
│  desktop_activity_logs    daily_journals    sync_sessions        │
│  (hourly summaries)       (daily journals)  (chat history)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scheduler Timing

| Task | When | Function |
|------|------|----------|
| Hourly Summary | Top of each hour (XX:00) | `summaryService.saveLastHourSummary()` |
| Daily Journal | 12:05 AM | `journalService.saveYesterdayJournal()` |
| Cloud Sync | Every 5 minutes | `cloudSyncService.sync()` |
| Context Snapshot | Every 60 seconds | `contextManager.takeSnapshot()` |
| Activity Poll | Every 5 seconds | `activityTracker.poll()` |

---

## Database Schema (Local SQLite)

```sql
-- Raw activity logs (detailed, kept for 10 min context)
activity_logs (
  id, timestamp, app_name, window_title, url, bundle_id,
  duration_seconds, synced, created_at
)

-- Hourly aggregations (synced to cloud)
hourly_summaries (
  id, hour_start, app_breakdown JSON, total_minutes,
  focus_score, synced, created_at
)

-- Daily journals (synced to cloud)
daily_journals (
  id, journal_date UNIQUE, overview, highlights JSON,
  focus_areas JSON, synced, created_at
)
```

---

## Database Tables (Supabase Cloud)

```sql
-- Receives hourly summaries
desktop_activity_logs (
  user_id, company_id, hour_start, app_breakdown JSONB,
  total_minutes, focus_score, created_at
)

-- Receives daily journals
daily_journals (
  user_id, company_id, journal_date, overview,
  highlights JSONB, focus_areas JSONB, created_at
)
```

---

## Authentication Flow

### Flow Diagram
```
Desktop App                    Browser                         Supabase
    │                             │                               │
    │ 1. Click "Sign in"          │                               │
    │ ──────────────────────────► │                               │
    │    Opens browser to         │                               │
    │    /desktop-auth?state=xxx  │                               │
    │                             │ 2. User logs in               │
    │                             │ ─────────────────────────────►│
    │                             │                               │
    │                             │ 3. Get session token          │
    │                             │ ◄─────────────────────────────│
    │                             │                               │
    │ 4. Deep link redirect       │                               │
    │ ◄──────────────────────────│                               │
    │    isyncso://auth?token=xxx&state=xxx                       │
    │                             │                               │
    │ 5. Validate state, store token                              │
    │ 6. Fetch user info from Supabase ──────────────────────────►│
    │ 7. Store user (id, email, companyId)                        │
    │                             │                               │
    │ 8. Cloud sync now works     │                               │
    └─────────────────────────────┴───────────────────────────────┘
```

### Key Auth Files

| Location | File | Function |
|----------|------|----------|
| Desktop | `src/main/index.ts` | `handleDeepLink()`, `fetchUserInfo()` |
| Desktop | `src/main/store.ts` | `getAccessToken()`, `getUser()`, `setUser()` |
| Desktop | `src/main/ipc/handlers.ts` | `AUTH_STATUS` handler (auto-fetches user if missing) |
| Desktop | `src/renderer/components/ChatWidget.tsx` | Login UI, auth callback listener |
| Web | `src/pages/DesktopAuth.jsx` | Auth redirect page |

### Auth Requirements for Cloud Sync

```typescript
// CloudSyncService.isAuthenticated() requires BOTH:
const token = getAccessToken();  // Must exist
const user = getUser();          // Must exist (id, email, companyId)
return !!token && !!user;        // BOTH required for sync
```

---

## Key Files Reference

### Main Process (`src/main/`)

| File | Purpose | Key Functions |
|------|---------|---------------|
| `index.ts` | Entry point, lifecycle | `handleDeepLink()`, `fetchUserInfo()` |
| `store.ts` | Encrypted storage | `getAccessToken()`, `getUser()`, `setUser()` |
| `services/activityTracker.ts` | Window tracking | `start()`, `getContextSummary()` |
| `services/contextManager.ts` | 10-min context | `getFreshContext()`, `getContextForSync()` |
| `services/summaryService.ts` | Hourly summaries | `generateLastHourSummary()`, `getTodayStats()` |
| `services/journalService.ts` | Daily journals | `generateYesterdayJournal()`, `getJournalForSync()` |
| `services/cloudSyncService.ts` | Supabase sync | `sync()`, `isAuthenticated()`, `getStatus()` |
| `services/scheduler.ts` | Cron-like tasks | `start()`, hourly/daily/sync scheduling |
| `services/permissions.ts` | macOS permissions | `checkAndRequestPermissions()` |
| `services/autoUpdater.ts` | App updates | `checkForUpdates()` |
| `ipc/handlers.ts` | IPC handlers | All renderer↔main communication |
| `db/database.ts` | SQLite setup | `initDatabase()` |
| `db/queries.ts` | DB operations | `insertActivityLog()`, `getRecentActivity()` |

### Renderer Process (`src/renderer/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Main UI, mode switching (avatar/chat/voice), click detection |
| `components/ChatWidget.tsx` | Chat interface, context injection, login UI |
| `components/VoiceMode.tsx` | Voice input/output (depends on edge function) |
| `components/SyncAvatarMini.tsx` | Animated SYNC avatar |

---

## Recent Session Fixes (Jan 16, 2026)

### Issue 1: SYNC Hallucinating Data
- **Problem**: SYNC made up fake contact names when asked "name some contacts"
- **Fix**: Updated system prompt to REQUIRE [ACTION] block for any data query
- **File**: `app.isyncso/supabase/functions/sync/index.ts`
- **Status**: Deployed and working

### Issue 2: Desktop Sync "Not Connected"
- **Problem**: Web app showed "Not Connected" even though user had token
- **Root Cause**: `CloudSyncService.isAuthenticated()` requires both token AND user, but old auth flow only stored token
- **Fix**:
  1. Added `user` field to store schema
  2. `handleDeepLink()` now fetches user info after receiving token
  3. `AUTH_STATUS` IPC handler auto-fetches user if token exists but user missing
  4. Clears stale/invalid tokens (403 response)
- **Files Modified**:
  - `src/main/store.ts` - added `getUser()`, `setUser()`
  - `src/main/index.ts` - added `fetchUserInfo()` call
  - `src/main/ipc/handlers.ts` - updated `AUTH_STATUS` handler
- **Status**: Fixed, user needs to re-authenticate once

### Issue 3: Web App Not Displaying Activity Data
- **Problem**: Web app DesktopActivity page wasn't rendering app breakdown data
- **Root Cause**: Data format mismatch between desktop and web app
  - Desktop sends: `app_breakdown: [{appName, minutes, category, percentage}, ...]` (array)
  - Web app expected: `app_breakdown: {appName: minutes, ...}` (object)
- **Fix**: Updated `DesktopActivity.jsx` to handle both array and object formats
- **Files Modified**:
  - `app.isyncso/src/pages/DesktopActivity.jsx` - added array format handling in calculateStats() and Timeline rendering
- **Status**: Fixed and deployed to Vercel (commit 128385c)

### Issue 4: On-Demand Daily Journal Generation
- **Request**: User wanted journals to update more regularly with a generate button
- **Solution**: Created edge function to generate journals from synced hourly data
- **Implementation**:
  1. `supabase/functions/generate-daily-journal/index.ts` - Edge function that:
     - Queries hourly summaries from `desktop_activity_logs` for a given date
     - Computes journal data (focus areas, highlights, overview)
     - Upserts into `daily_journals` table
  2. `DesktopActivity.jsx` - Added "Generate Today's Journal" button in journals tab
- **Status**: Deployed and working

### Issue 5: Integrations Page Showing "Not Connected" Despite Auth Success
- **Problem**: Desktop auth completed successfully (DesktopAuth page showed "Connected!") but Integrations page showed "Not Connected"
- **Root Cause**: The `db` object exported from `supabaseClient.js` didn't have a `.from()` method
  - Integrations.jsx called `db.from('desktop_activity_logs')` which returned `undefined`
  - The query failed silently, always showing "Not Connected"
- **Fix**: Added `.from()` and `.rpc()` methods to the db export that proxy to the raw Supabase client
- **Files Modified**:
  - `app.isyncso/src/api/supabaseClient.js` - added `from` and `rpc` proxy methods to db export
- **Status**: Fixed and deployed to Vercel (commit fc2a1a0)

### Issue 6: Daily Journals Tab Crashing (React Error #31)
- **Problem**: Clicking on "Daily Journals" tab in DesktopActivity crashed with React error #31
- **Root Cause**: `focus_areas` field contains objects `{category, minutes, percentage, apps}` but the code tried to render them directly as React children
- **Fix**: Added type check to render objects as "Category: XX%" format
- **Files Modified**:
  - `app.isyncso/src/pages/DesktopActivity.jsx` - line 730: `{typeof area === 'string' ? area : \`${area.category}: ${area.percentage}%\`}`
- **Status**: Fixed and deployed to Vercel (commit 97c5866)

### Current State
- Desktop app running and syncing successfully
- 3 hourly summaries synced to Supabase (5 PM, 6 PM, 7 PM on Jan 16, 2026)
- 1 daily journal generated for Jan 16, 2026 (2.4 hours, 32% productivity)
- Web app updated to display array-format app_breakdown
- On-demand journal generation working via button
- Integrations page now correctly detects desktop connection
- User: gody@isyncso.com (ID: 1256b397-0201-4210-8ba5-9e74a8a60d86)

---

## Development Commands

```bash
# Navigate to project
cd /Users/daviddebruin/sync-desktop

# Install dependencies
npm install

# Build (compiles TypeScript)
npm run build

# Start in development
npm start

# View logs in real-time
# (logs appear in terminal where npm start runs)
```

---

## Troubleshooting

### "Not authenticated - token: X user: Y"

| token | user | Meaning | Action |
|-------|------|---------|--------|
| false | false | No auth at all | User needs to click "Sign in" |
| true | false | Old token, no user | Auto-fetch will trigger, or token invalid → cleared |
| true | true | Fully authenticated | Sync should work |

### Cloud sync not uploading

1. Check authentication: `[sync] Not authenticated - token: X user: Y`
2. Check pending items: `[scheduler] Cloud sync completed` should show counts
3. Check for errors: `[sync] Sync failed: ...`

### Deep link not working

1. Verify protocol registered: `isyncso://`
2. Check macOS: `app.on('open-url', ...)` in `index.ts`
3. Check browser redirects to `isyncso://auth?token=xxx&state=xxx`

### Hourly summary not generating

1. Check scheduler started: `[scheduler] Starting scheduler`
2. Check timing: Runs at XX:00 (top of hour)
3. Check logs: `[scheduler] Generating hourly summary`

### Daily journal not generating

1. Runs at 12:05 AM only
2. Generates YESTERDAY's journal (needs full day of data)
3. Check logs: `[scheduler] Generating daily journal`

### Integrations page shows "Not Connected" despite auth success

1. **Check if data exists**: Query `desktop_activity_logs` in Supabase for the user_id
2. **Check browser console**: Look for errors from `db.from()` calls
3. **Verify supabaseClient.js**: Ensure `db` export has `.from()` method (added in commit fc2a1a0)
4. **Hard refresh**: The fix may have deployed but browser cached old version (Cmd+Shift+R)

---

## What's Still Missing (Development Needed)

### 1. Voice Mode Edge Function
**Priority: Medium**

The `VoiceMode.tsx` component exists and works, but it calls a `sync-voice` edge function that needs to be implemented.

```typescript
// VoiceMode.tsx calls:
fetch(`${SUPABASE_URL}/functions/v1/sync-voice`, {
  method: 'POST',
  body: JSON.stringify({
    transcript,
    sessionId,
    context: activityContext
  })
})
```

**Need to create**: `supabase/functions/sync-voice/index.ts`
- Accept voice transcript
- Call SYNC AI (same as chat)
- Return TTS audio (Together.ai or similar)

### 2. Settings Panel UI
**Priority: Low**

Backend is ready:
```typescript
interface AppSettings {
  trackingEnabled: boolean;
  dataRetentionDays: number;
  autoSync: boolean;
  syncIntervalMinutes: number;
  showInDock: boolean;
}
```

**Need to create**: `src/renderer/components/Settings.tsx`
- Form for each setting
- Save via IPC `SETTINGS_SET` handler
- Already has IPC handlers ready

### 3. Screen Capture/OCR
**Priority: Low (nice-to-have)**

Not implemented at all. Would need:
- Screenshot capture logic
- Tesseract.js or cloud OCR
- Storage/sync pipeline
- UI to view captures

---

## Web App Integration

| Page | URL | Purpose |
|------|-----|---------|
| Desktop Auth | `/desktop-auth` | OAuth redirect for desktop login |
| Desktop Activity | `/DesktopActivity` | View activity timeline, journals, focus scores |
| Integrations | `/Integrations` | Shows desktop sync connection status |

---

## Verification Checklist

After authentication, verify these work:

- [ ] Logs show: `[sync] Not authenticated - token: true user: true`
- [ ] Logs show: `[scheduler] Cloud sync completed` with item counts
- [ ] Web app Desktop Activity page shows hourly data
- [ ] Web app Desktop Activity page shows daily journals
- [ ] Integrations page shows "Connected"
- [ ] Chat includes activity context (check `[ChatWidget] Sending to SYNC:` logs)
