# Deep Context Engine Takeover — Design Document

**Date:** 2026-02-27
**Status:** Approved
**Scope:** sync.desktop + app.isyncso (web app + SYNC edge function)

## Problem

The sync desktop app has two independent context systems:
1. **Basic Activity Tracker** (activityTracker.ts + contextManager.ts) — 5-second window polling, app names, focus scores
2. **Deep Context Engine** (deep-context/ module) — 15-second accessibility capture, commitment detection, entity extraction, skill signals

The Deep Context Engine runs but its output never reaches the chat/voice interface. The IPC handler at `handlers.ts:184` only calls `contextManager.getContextForSync()`. Result: SYNC AI gets shallow context ("Using VS Code, 72% focus") instead of rich context ("Debugging JWT in auth-service.ts, promised Sarah the API docs by tomorrow").

## Approach: Engine Takeover

Make DeepContextEngine the **primary** context source. Demote contextManager to fallback. Enhance the engine. Sync deep context to Supabase. Upgrade the web app to consume it.

## Design

### 1. Context Priority Chain

```
Chat/Voice requests context via IPC
         |
         v
  DeepContextEngine running & has data?
    |-- YES --> deepContextEngine.getContextForSync()
    |           + commitments + skill signals
    |           --> Rich context payload
    |
    '-- NO  --> contextManager.getContextForSync()
                --> Basic context (fallback)
```

The activityTracker (5-second polling) continues running — it feeds hourly summaries, daily journals, and focus score. But for real-time context injection into conversations, the Deep Context Engine is primary.

### 2. Enhanced Context Payload

```typescript
interface EnhancedContext {
  // From DeepContextEngine (primary)
  currentActivity: string;       // "Debugging JWT in auth-service.ts"
  intent: string;                // "fixing authentication bug"
  entities: string[];            // ["Sarah", "auth-service", "JWT"]
  pendingCommitments: Commitment[];
  skillSignals: SkillSignal[];
  contextSwitchCount: number;

  // From basic tracker (always available)
  currentApp: string;
  focusScore: number;
  isIdle: boolean;
  recentApps: { app: string; minutes: number }[];

  // Formatted string for SYNC AI prompt
  formattedContext: string;
}
```

### 3. Deep Context Engine Enhancements

**Better commitment detection:**
- Slack/Teams patterns ("@channel reminder: ...")
- Calendar invite patterns ("You've been invited to...")
- More deadline phrases ("ASAP", "end of sprint", "before standup")

**Smarter skill signals:**
- Detect frameworks (React, Next.js, Django) not just languages
- File context (package.json = Node.js, Cargo.toml = Rust)
- Track proficiency changes over time

**Richer accessibility capture:**
- Extract browser tab titles from accessibility tree
- Detect code editor file paths from window titles
- Better email context (subject line extraction)

### 4. Cloud Sync for Deep Context

New Supabase table: `desktop_context_events`

```sql
CREATE TABLE desktop_context_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  company_id UUID,
  event_type TEXT NOT NULL,
  source_application TEXT,
  source_window_title TEXT,
  summary TEXT,
  entities JSONB DEFAULT '[]',
  intent TEXT,
  commitments JSONB DEFAULT '[]',
  skill_signals JSONB DEFAULT '[]',
  confidence REAL,
  privacy_level TEXT DEFAULT 'sync_allowed',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dce_user_created ON desktop_context_events(user_id, created_at DESC);
CREATE INDEX idx_dce_type ON desktop_context_events(event_type);
```

CloudSyncService uploads context_events alongside existing summaries/journals. Only `privacy_level = 'sync_allowed'` events are synced.

### 5. SYNC Edge Function Enhancement

When processing a desktop-app message, the SYNC edge function queries `desktop_context_events` for the last 15 minutes and injects into the system prompt:

```
--- Desktop Deep Context ---
Current: Debugging JWT validation in auth-service.ts
Intent: fixing authentication bug
Entities: Sarah, auth-service, JWT, staging
Context switches (15 min): 3

Pending commitments:
  - Send Sarah the API docs (due: tomorrow 9 AM)
  - Schedule team sync (due: Friday)

Active skills: TypeScript, React
Focus score: 72%
---
```

### 6. Web App Dashboard

Add to DesktopActivity page:
- **Active commitments** — promises, status, deadlines
- **Skill map** — detected skills over time
- **Entity timeline** — people/projects mentioned throughout day

## Files Affected

### Desktop (sync.desktop)
- `src/main/ipc/handlers.ts` — Switch to DeepContextEngine-first context
- `src/deep-context/pipeline/eventClassifier.ts` — Enhanced patterns
- `src/deep-context/capture/accessibilityCapture.ts` — Richer capture
- `src/deep-context/index.ts` — Enhanced getContextForSync()
- `src/main/services/cloudSyncService.ts` — Sync context_events
- `src/preload/index.ts` — Updated type for enhanced context

### Web App (app.isyncso)
- `supabase/functions/sync/index.ts` — Query + inject deep context
- `src/pages/DesktopActivity.jsx` — Commitments/skills/entities display
- Supabase migration — desktop_context_events table

## Risk Mitigation

- Fallback to basic contextManager if DeepContextEngine fails
- Privacy filtering unchanged (sensitive apps excluded, PII stripped)
- Encrypted storage for local context events
- Only sync_allowed events uploaded to cloud
