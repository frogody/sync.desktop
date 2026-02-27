# SYNC Desktop — Architecture & Development Guide

> **Version**: 2.2.0 | **Last updated**: 2026-02-27

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Data Storage](#3-data-storage)
4. [Data Flow Pipelines](#4-data-flow-pipelines)
5. [The Action Pipeline (Notch Widget)](#5-the-action-pipeline-notch-widget)
6. [Cloud Sync & Supabase](#6-cloud-sync--supabase)
7. [Native Swift Widget](#7-native-swift-widget-syncwidget)
8. [Authentication](#8-authentication)
9. [Building & Releasing](#9-building--releasing)
10. [Development Workflow](#10-development-workflow)
11. [Extending the System](#11-extending-the-system)
12. [Product Opportunities](#12-product-opportunities)

---

## 1. System Overview

SYNC Desktop is a macOS Electron app that runs silently in the background, understanding what you're working on and surfacing one-click actions via the macOS notch. It consists of three major subsystems:

| Subsystem | Purpose | Key Tech |
|-----------|---------|----------|
| **Activity Intelligence** | Track apps, windows, focus patterns, generate summaries | SQLite, polling, cron |
| **Deep Context Engine** | OCR, accessibility capture, commitment detection, file monitoring | Vision.framework, AppleScript, regex classifiers |
| **Action Pipeline** | Detect actionable opportunities, classify on-device, present in notch | MLX (Qwen2.5-1.5B), Swift UI, Supabase Realtime |

All data flows through a **local-first** architecture: everything is stored in SQLite first, then selectively synced to Supabase cloud.

---

## 2. Architecture Diagram

```
┌─────────────────────────────── ELECTRON MAIN PROCESS ───────────────────────────────┐
│                                                                                      │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────┐    ┌──────────────┐   │
│  │ Activity     │───▶│ Context Manager │───▶│ Summary Service│───▶│ Journal      │   │
│  │ Tracker      │    │ (10-min window) │    │ (hourly)       │    │ Service      │   │
│  │ (5s poll)    │    └─────────────────┘    └────────────────┘    │ (daily)      │   │
│  └─────────────┘                                                  └──────────────┘   │
│                                                                          │            │
│  ┌─────────────────────── DEEP CONTEXT ENGINE ──────────────────────┐    │            │
│  │                                                                   │    │            │
│  │  Accessibility ──▶ Pipeline ──▶ Classifier ──▶ Privacy ──▶ Store │    │            │
│  │  Capture (15s)     (assemble)   (regex/LLM)   (redact)   (SQLite)│    │            │
│  │                                                                   │    │            │
│  │  Screen Capture ──▶ OCR (Vision) ──▶ Semantic Analyzer ──────────┘    │            │
│  │  (30s interval)                      (Together.ai LLM)                │            │
│  │                                                                       │            │
│  │  File Watcher ──▶ (Desktop, Documents, Downloads)                     │            │
│  └───────────────────────────────────────────────────────────────────┘    │            │
│                                                                          ▼            │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────────────────────────────┐      │
│  │ Notch Bridge │◀──▶│ Action      │◀──▶│ Cloud Sync Service                  │      │
│  │ (stdin/out)  │    │ Service     │    │ (5-min cycle → Supabase)            │      │
│  └──────┬───────┘    │ (Realtime)  │    └──────────────────────────────────────┘      │
│         │            └─────────────┘                                                  │
└─────────┼─────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────── NATIVE SWIFT PROCESS ────────────────────────┐
│                                                                      │
│  SYNCWidget.app                                                      │
│  ├── MLX Classifier (Qwen2.5-1.5B-Instruct Q4, on-device)          │
│  ├── Metal Shaders (mlx.metallib)                                    │
│  └── Notch UI (SwiftUI panels, animations)                           │
│      ├── Action pill (slides from notch)                             │
│      ├── Approve button (green checkmark)                            │
│      └── Dismiss button (red X)                                      │
└──────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────── SUPABASE CLOUD ──────────────────────────────┐
│                                                                      │
│  Edge Functions                    Database                          │
│  ├── analyze-action (enrichment)   ├── desktop_activity_logs        │
│  ├── execute-action (Composio)     ├── daily_journals               │
│  └── sync (SYNC Agent)            ├── pending_actions (Realtime)    │
│                                    ├── tasks                         │
│  Realtime                          └── context_events               │
│  └── WebSocket → pending_actions                                    │
│                                                                      │
│  Composio (3rd-party execution)                                      │
│  ├── Google Calendar                                                 │
│  ├── Gmail                                                           │
│  └── 30+ other services                                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Storage

### 3.1 Local SQLite Database

**Location**: `~/Library/Application Support/sync-desktop/sync-desktop.db`
**Engine**: `better-sqlite3` (synchronous, WAL mode)

| Table | Purpose | Sync to Cloud? |
|-------|---------|---------------|
| `activity_logs` | Raw window tracking (app, title, duration) every 5s | Yes (batched) |
| `hourly_summaries` | Aggregated app usage per hour, focus score | Yes |
| `daily_journals` | AI-generated daily narrative + highlights | Yes |
| `screen_captures` | OCR text from screenshots (images discarded) | Partial |
| `context_events` | Structured events from accessibility/file capture | Yes (if `sync_allowed`) |
| `commitments` | Detected promises ("I'll send that by Friday") | Yes |
| `chat_sessions` | Local chat history with SYNC Agent | No |
| `sync_metadata` | System state (last sync timestamp, etc.) | No |

Every synced table has a `synced` INTEGER column (0 = pending, 1 = uploaded).

### 3.2 Electron Store (Encrypted)

**Location**: `~/Library/Application Support/sync-desktop/config.json` (encrypted)

Stores: auth tokens, user info, app settings, API keys. Never synced — local device only.

### 3.3 Privacy Levels

Every context event has a `privacy_level`:
- `local_only` — sensitive content, never leaves the device
- `sync_allowed` — safe to upload to Supabase

The Privacy Filter (`src/deep-context/privacy/privacyFilter.ts`) automatically redacts:
- Credit card numbers, SSNs, passwords
- Content from banking apps, password managers, incognito windows

---

## 4. Data Flow Pipelines

### 4.1 Activity Tracking (every 5 seconds)

```
get-windows → ActivityTracker.poll()
  → INSERT INTO activity_logs
  → Emit 'activity' event
  → ContextManager receives event
    → Every 60s: build ContextSnapshot
      { currentApp, focusScore, recentApps, workPatterns }
    → Available to Chat Widget via IPC
```

### 4.2 Hourly Summary (at XX:00)

```
Scheduler → SummaryService.generateLastHourSummary()
  → SELECT activity_logs WHERE timestamp IN [last hour]
  → GROUP BY app_name → calculate percentages
  → Compute focus_score (deep work=high, switching=low)
  → INSERT INTO hourly_summaries (synced=0)
  → Mark activity_logs synced=1
```

### 4.3 Daily Journal (at 12:05 AM)

```
Scheduler → JournalService.generateYesterdayJournal()
  → SELECT hourly_summaries WHERE hour_start IN [yesterday]
  → Aggregate: total hours, peak focus hour, highlight detection
  → Generate narrative overview
  → INSERT INTO daily_journals (synced=0)
```

### 4.4 Deep Context (every 15 seconds)

```
AccessibilityCapture (AppleScript/JXA)
  → Read focused UI element text, window title, URL
  → FileWatcher detects saves in ~/Desktop, ~/Documents, ~/Downloads

ContextEventPipeline assembles captures
  → EventClassifier detects patterns:
    - "I'll send that by Friday" → commitment_detected
    - File save in VS Code → document_interaction
    - Switched from Slack to Terminal → context_switch
  → PrivacyFilter redacts sensitive data
  → INSERT INTO context_events (synced=0)

ScreenCapture (every 30s)
  → Capture screenshot
  → OCR via Swift/Vision framework
  → SemanticAnalyzer (Together.ai LLM) → extract meaning
  → INSERT INTO screen_captures
```

### 4.5 Cloud Sync (every 5 minutes)

```
Scheduler → CloudSyncService.sync()
  → Check auth: getAccessToken() + getUser()
  → Query all tables WHERE synced=0
  → POST to Supabase REST API:
    - hourly_summaries → desktop_activity_logs (upsert by hour_start)
    - daily_journals → daily_journals (upsert by journal_date)
    - context_events (where privacy=sync_allowed) → context_events
    - screen_captures (text only) → deep context events
  → Mark synced=1 on success
  → On 403: clear auth (token expired)
```

---

## 5. The Action Pipeline (Notch Widget)

This is the newest and most complex subsystem. It detects actionable opportunities and presents them as one-tap approvals in the macOS notch.

### Full Pipeline

```
1. DeepContextEngine captures context
   (accessibility text, OCR, file changes)
     │
2. NotchBridge sends context_event to SYNCWidget (stdin JSON)
     │
3. MLX Classifier (Qwen2.5-1.5B-Instruct Q4) runs ON-DEVICE
   Classifies into: calendar_event | task_create | send_email | none
     │
4. If actionable (confidence > threshold):
   Widget sends action_detected back to Electron (stdout JSON)
     │
5. ActionService receives DetectedAction
   Deduplicates by eventHash
   Calls POST /functions/v1/analyze-action
     │
6. analyze-action Edge Function:
   - Enriches with Together.ai LLM
   - Generates human-readable title
   - Stores in pending_actions table (status: pending)
     │
7. ActionService receives enriched action via Supabase Realtime WebSocket
   Sends show_action to SYNCWidget
     │
8. Notch UI animates pill from notch:
   "Add meeting with Thomas to Calendar? [✅] [✕]"
     │
9. User taps approve → ActionService calls POST /functions/v1/execute-action
   OR user taps dismiss → status='dismissed'
     │
10. execute-action Edge Function:
    - task_create → INSERT INTO tasks
    - calendar_event → Composio Google Calendar API
    - send_email → Composio Gmail API
    - Updates pending_actions status='completed'
```

### Key Files

| File | Role |
|------|------|
| `src/main/services/notchBridge.ts` | Spawns SYNCWidget, JSON stdin/stdout bridge |
| `src/main/services/actionService.ts` | Lifecycle management, Realtime subscription, cloud calls |
| `native/SYNCWidget/Sources/ML/ActionClassifier.swift` | MLX model loading + inference |
| `native/SYNCWidget/Sources/App/AppDelegate.swift` | Widget initialization, classifier setup |
| `native/SYNCWidget/Sources/Views/ActionPendingView.swift` | Notch UI for pending actions |
| `app.isyncso/supabase/functions/analyze-action/index.ts` | Cloud enrichment |
| `app.isyncso/supabase/functions/execute-action/index.ts` | Action execution via Composio |

### Bridge Protocol

```
Electron → Widget (stdin):
{ "type": "context_event", "payload": { ...ContextEvent } }
{ "type": "show_action", "payload": { id, title, actionType } }
{ "type": "config", "payload": { userEmail, theme } }

Widget → Electron (stdout):
{ "type": "action_detected", "payload": { id, eventHash, title, actionType, confidence } }
{ "type": "action_approved", "payload": { actionId } }
{ "type": "action_dismissed", "payload": { actionId } }
{ "type": "ready" }
{ "type": "log", "message": "..." }
```

---

## 6. Cloud Sync & Supabase

### Supabase Project

| Property | Value |
|----------|-------|
| Project ID | `sfxpmzicgpaxfntqleig` |
| API URL | `https://sfxpmzicgpaxfntqleig.supabase.co` |
| Realtime | Enabled on `pending_actions` |

### Cloud Tables

```sql
desktop_activity_logs (user_id, company_id, hour_start, app_breakdown JSONB, total_minutes, focus_score)
daily_journals (user_id, company_id, journal_date, overview, highlights JSONB, focus_areas JSONB)
pending_actions (user_id, action_id, event_hash, title, action_type, status, local_payload JSONB)
tasks (user_id, company_id, title, description, status, source, due_date)
context_events (user_id, timestamp, event_type, source JSONB, semantic_payload JSONB, privacy_level)
```

### Edge Functions

| Function | Purpose | Trigger |
|----------|---------|---------|
| `analyze-action` | LLM enrichment of detected actions | POST from ActionService |
| `execute-action` | Execute approved actions (Composio) | POST from ActionService |
| `sync` | SYNC Agent chat endpoint | POST from ChatWidget |
| `generate-daily-journal` | On-demand journal generation | POST from web app |

### Deploy Edge Functions

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
  npx supabase functions deploy <name> \
  --project-ref sfxpmzicgpaxfntqleig \
  --no-verify-jwt
```

---

## 7. Native Swift Widget (SYNCWidget)

### Structure

```
native/SYNCWidget/
├── Package.swift          # mlx-swift, mlx-swift-lm dependencies
├── Sources/SYNCWidget/
│   ├── main.swift         # Entry point
│   ├── App/
│   │   ├── AppDelegate.swift       # Init classifier, handle bridge messages
│   │   ├── NotchPanel.swift        # NSPanel positioned at notch
│   │   ├── NotchGeometry.swift     # Calculate notch position on any display
│   │   └── MouseMonitor.swift      # Track mouse for hover effects
│   ├── Bridge/
│   │   ├── StdinReader.swift       # Read JSON lines from Electron
│   │   ├── StdoutWriter.swift      # Write JSON lines to Electron
│   │   └── BridgeMessage.swift     # Message type definitions
│   ├── ML/
│   │   └── ActionClassifier.swift  # MLX model loading + inference
│   └── Views/
│       ├── NotchContainerView.swift
│       ├── ActionPendingView.swift  # "Add meeting? [✅][✕]"
│       ├── ActionSuccessView.swift  # Checkmark animation
│       └── IdleView.swift          # Ambient SYNC orb
└── Resources/
    ├── Info.plist
    └── model/                      # Qwen2.5-1.5B-Instruct Q4 (828MB)
        ├── config.json
        ├── tokenizer.json
        └── model.safetensors
```

### MLX Model

- **Model**: Qwen2.5-1.5B-Instruct (Q4 quantized)
- **Size**: ~828MB safetensors
- **Location**: Bundled in `SYNCWidget.app/Contents/Resources/model/`
- **Metal Shaders**: Compiled to `mlx.metallib` during build
- **Inference**: Fully on-device, no network calls

### Build

```bash
# Full build (Swift binary + Metal shaders + app bundle)
npm run build:swift
# Or directly:
bash scripts/build-swift-widget.sh

# Clean build
bash scripts/build-swift-widget.sh --clean
```

The build script:
1. `swift build -c release` — compiles Swift binary
2. Assembles `.app` bundle (binary, Info.plist, PkgInfo)
3. Compiles 9 Metal shader files → `.air` → `mlx.metallib`
4. Copies MLX model into `Resources/model/`

---

## 8. Authentication

```
Desktop App                     Browser                      Supabase
    │                              │                             │
    │ 1. Click "Sign in"           │                             │
    │ ────────────────────────────▶│                             │
    │   Opens: /desktop-auth       │                             │
    │                              │ 2. User logs in             │
    │                              │────────────────────────────▶│
    │                              │ 3. Gets JWT                 │
    │                              │◀────────────────────────────│
    │ 4. Deep link redirect        │                             │
    │ ◀───────────────────────────│                             │
    │  isyncso://auth?token=JWT    │                             │
    │                              │                             │
    │ 5. Store token + fetch user info                           │
    │ 6. CloudSyncService.isAuthenticated() → true               │
    │ 7. Sync begins                                             │
```

**Requirements**: Both `getAccessToken()` AND `getUser()` must exist for sync to work.

---

## 9. Building & Releasing

### Prerequisites

```bash
# Install dependencies
npm install

# Build native widget (requires Xcode + Metal Toolchain)
npm run build:swift

# Build Electron app
npm run build
```

### Development

```bash
# Start in dev mode (auto-reload)
npm run dev

# Or build + start
npm run build && npm start

# View logs
npm start 2>&1 | tee /tmp/sync-desktop.log
```

### Creating a Release

```bash
# 1. Bump version in package.json
# e.g., "version": "2.3.0"

# 2. Full build
npm run build

# 3. Package for macOS (both architectures)
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder build --mac --arm64 --publish never
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder build --mac --x64 --publish never

# 4. Artifacts are in release/
ls release/SYNC.Desktop-*.dmg

# 5. Commit version bump
git add package.json package-lock.json
git commit -m "feat: bump version to 2.3.0"
git push origin main

# 6. Create GitHub release
gh release create v2.3.0 \
  release/SYNC.Desktop-2.3.0-arm64.dmg \
  release/SYNC.Desktop-2.3.0-x64.dmg \
  release/SYNC.Desktop-2.3.0-arm64.zip \
  release/SYNC.Desktop-2.3.0-x64.zip \
  --title "SYNC Desktop v2.3.0" \
  --notes "Release notes here" \
  --latest

# 7. Update download page version in app.isyncso
# Edit: app.isyncso/src/pages/DownloadApp.jsx line 26
# Change: const VERSION = "2.3.0";
# Push to main (auto-deploys via Vercel)
```

### Code Signing (for production)

To produce signed + notarized builds:

```bash
export APPLE_TEAM_ID="your-team-id"
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export CSC_LINK="path/to/cert.p12"    # or base64 encoded
export CSC_KEY_PASSWORD="cert-password"

npx electron-builder build --mac --publish always
```

### Auto-Updates

The app checks GitHub releases every 4 hours via `electron-updater`. Users on older versions will get a notification to update. This works automatically once releases are published to GitHub.

---

## 10. Development Workflow

### Project Structure

```
sync.desktop/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Entry point, service orchestration
│   │   ├── store.ts             # Encrypted local storage
│   │   ├── db/
│   │   │   ├── database.ts      # SQLite init + migrations
│   │   │   └── queries.ts       # All DB operations
│   │   ├── services/
│   │   │   ├── activityTracker.ts
│   │   │   ├── contextManager.ts
│   │   │   ├── summaryService.ts
│   │   │   ├── journalService.ts
│   │   │   ├── cloudSyncService.ts
│   │   │   ├── scheduler.ts
│   │   │   ├── deepContextManager.ts
│   │   │   ├── screenCapture.ts
│   │   │   ├── ocrService.ts
│   │   │   ├── semanticAnalyzer.ts
│   │   │   ├── notchBridge.ts
│   │   │   ├── actionService.ts
│   │   │   ├── permissions.ts
│   │   │   └── autoUpdater.ts
│   │   └── ipc/
│   │       └── handlers.ts      # All IPC channel handlers
│   │
│   ├── deep-context/            # Deep Context Engine
│   │   ├── index.ts             # Public API
│   │   ├── capture/
│   │   │   ├── accessibilityCapture.ts
│   │   │   └── fileWatcher.ts
│   │   ├── pipeline/
│   │   │   ├── contextEventPipeline.ts
│   │   │   └── eventClassifier.ts
│   │   ├── privacy/
│   │   │   └── privacyFilter.ts
│   │   └── store/
│   │       └── contextEventStore.ts
│   │
│   ├── renderer/                # Electron renderer (React)
│   │   ├── App.tsx
│   │   └── components/
│   │       ├── ChatWidget.tsx
│   │       ├── VoiceMode.tsx
│   │       └── SyncAvatarMini.tsx
│   │
│   ├── preload/
│   │   └── index.ts             # Context bridge (main ↔ renderer)
│   │
│   └── shared/
│       ├── constants.ts         # Intervals, limits, configs
│       └── ipcChannels.ts       # IPC channel name constants
│
├── native/SYNCWidget/           # Swift macOS widget
│   ├── Package.swift
│   ├── Sources/SYNCWidget/
│   └── Resources/
│
├── scripts/
│   ├── build-swift-widget.sh    # Build + bundle native widget
│   └── notarize.js              # Apple notarization hook
│
├── assets/                      # Icons, images
├── electron-builder.yml         # Packaging config
├── tsconfig.main.json           # Main process TS config
├── tsconfig.json                # Renderer TS config
└── vite.config.ts               # Renderer bundler config
```

### Adding a New Service

1. Create `src/main/services/myService.ts`
2. Export a class with `start()` and `stop()` methods
3. Instantiate in `src/main/index.ts`
4. Add getter: `export function getMyService() { return myService; }`
5. Call `myService.start()` in the startup sequence
6. Add IPC handlers in `src/main/ipc/handlers.ts` if renderer needs access

### Adding a New IPC Channel

1. Add channel name to `src/shared/ipcChannels.ts`
2. Add handler in `src/main/ipc/handlers.ts`
3. Expose in `src/preload/index.ts` via `contextBridge.exposeInMainWorld`
4. Call from renderer: `window.electron.myChannel(args)`

### Adding a New Deep Context Event Type

1. Add event type to `ContextEvent.eventType` union in `src/deep-context/store/contextEventStore.ts`
2. Add detection pattern in `src/deep-context/pipeline/eventClassifier.ts`
3. Add privacy rules in `src/deep-context/privacy/privacyFilter.ts`
4. Events auto-persist to SQLite and sync to cloud

### Debugging

```bash
# Run with full logs visible
npm run build && npm start 2>&1 | tee /tmp/sync.log

# Filter specific service
npm start 2>&1 | grep '\[action-service\]'

# Inspect local database
sqlite3 ~/Library/Application\ Support/sync-desktop/sync-desktop.db
> SELECT * FROM hourly_summaries ORDER BY hour_start DESC LIMIT 5;
> SELECT event_type, COUNT(*) FROM context_events GROUP BY event_type;
> SELECT * FROM commitments WHERE status='pending';

# Check Supabase data (via Management API)
curl -s -X POST "https://api.supabase.com/v1/projects/sfxpmzicgpaxfntqleig/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM pending_actions ORDER BY created_at DESC LIMIT 5"}'
```

---

## 11. Extending the System

### Add a New Action Type

The action pipeline currently supports: `calendar_event`, `task_create`, `send_email`. To add more:

**1. Update the MLX classifier prompt** in `ActionClassifier.swift`:
```swift
// Add your new type to the classification prompt
let prompt = """
Classify this context into one of: calendar_event, task_create, send_email, YOUR_NEW_TYPE, none
"""
```

**2. Update `execute-action` edge function** (`app.isyncso/supabase/functions/execute-action/index.ts`):
```typescript
case 'your_new_type':
  // Execute via Composio or direct DB
  break;
```

**3. Update the notch UI** if it needs a custom icon/color for this type.

### Add a New Capture Source

To capture from a new data source (e.g., clipboard, browser history):

1. Create `src/deep-context/capture/myCapture.ts`
2. Implement the capture interface: `start()`, `stop()`, `capture(): CaptureResult`
3. Register in `src/deep-context/index.ts` (the DeepContextEngine)
4. Captured data flows through the existing pipeline → classifier → store

### Add a New Cloud Integration

Composio supports 30+ services. To add execution for a new one:

1. Ensure the user has connected the service on `app.isyncso.com/integrations`
2. Add execution logic in `execute-action/index.ts`
3. Use `composio.executeTool(toolSlug, { connectedAccountId, arguments })` pattern

### Improve the On-Device Classifier

The MLX model (Qwen2.5-1.5B Q4) can be swapped for a better model:

1. Download a new GGUF/safetensors model compatible with mlx-swift
2. Place in `native/SYNCWidget/Resources/model/`
3. Update `config.json` if the model architecture differs
4. Rebuild: `npm run build:swift`

For fine-tuning on your specific use cases, collect labeled examples from `pending_actions` (what users approve vs dismiss) and fine-tune with MLX's training utilities.

---

## 12. Product Opportunities

### What Makes This System Powerful

The combination of **local deep context** + **on-device classification** + **one-tap execution** creates a unique product:

1. **Privacy-first intelligence**: All ML inference runs on-device. Raw screen content never touches a server. Only structured, privacy-filtered events sync to cloud.

2. **Zero-friction automation**: User doesn't need to open any app. The action appears in the notch — one tap and it's done.

3. **Learning loop**: Every approve/dismiss builds a dataset of what actions users actually want, enabling fine-tuning.

### High-Impact Extensions

| Opportunity | Description | Effort |
|-------------|-------------|--------|
| **Smart Follow-ups** | Detect "I'll follow up" commitments, auto-remind | Medium (commitment detection already exists) |
| **Meeting Prep** | Before a calendar event, surface relevant emails/docs | Medium (combine calendar + deep context) |
| **Focus Mode** | Detect deep work, auto-silence notifications | Low (focus score already calculated) |
| **Team Insights** | Aggregate team activity patterns for managers | Low (cloud data already exists) |
| **Proactive Scheduling** | "You mentioned meeting Thomas — I found a free slot" | High (requires calendar read + LLM reasoning) |
| **Email Drafts** | "David asked for the report — draft a reply?" | Medium (requires email content + Composio Gmail) |
| **Daily Standup** | Auto-generate "what I did yesterday" from activity | Low (journal service already does this) |
| **Cross-Device Sync** | Sync context across Mac + iPhone + web | High (requires mobile app) |

### Data You Already Have (and Can Build On)

| Data Source | What It Tells You | Product Value |
|-------------|-------------------|---------------|
| Activity logs | What apps, how long, when | Productivity analytics, billing |
| Focus scores | Deep work vs. fragmented | Focus coaching, team health |
| Commitments | What people promise | Accountability, follow-up reminders |
| Context events | Full work narrative | AI assistant context, meeting prep |
| Screen OCR | What's on screen | Content-aware suggestions |
| Action approvals | What users actually want automated | Fine-tuning, personalization |

### Development Priority Recommendations

**Quick wins** (hours, not days):
- Add more action types to the classifier (Slack messages, Notion pages)
- Surface commitment follow-ups as notch actions
- Auto-generate daily standup summaries

**Medium-term** (days to a week):
- Fine-tune the MLX model on user approve/dismiss data
- Build a "focus session" mode that tracks uninterrupted deep work
- Add proactive meeting prep (surface relevant context before meetings)

**Long-term** (weeks):
- Multi-device context sync
- Team-level intelligence (aggregate patterns)
- Third-party developer API (let other apps consume context)

---

## Appendix: Key Commands

```bash
# Development
npm run build            # Full build (Swift + TS + Renderer)
npm run build:swift      # Build native widget only
npm start                # Run the built app

# Packaging
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder build --mac --arm64 --publish never
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder build --mac --x64 --publish never

# Release
gh release create v2.X.0 release/*.dmg release/*.zip --title "v2.X.0" --latest

# Edge Functions
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" npx supabase functions deploy <name> --project-ref sfxpmzicgpaxfntqleig --no-verify-jwt

# Database queries
curl -s -X POST "https://api.supabase.com/v1/projects/sfxpmzicgpaxfntqleig/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "YOUR SQL"}'

# Logs
npm start 2>&1 | grep '\[action-service\]\|\[notch-bridge\]\|\[deepContext\]'
```
