# Deep Context System - Architecture Plan

## Overview

Transform SYNC Desktop from basic app/window tracking to a deep understanding AI that can:
- **See** what's on screen via screen capture + OCR
- **Understand** content semantically (emails, documents, calendars)
- **Track** commitments and promises made
- **Detect** incomplete actions (e.g., "said would send invite but didn't")
- **Provide** intelligent proactive assistance

## Use Case Example

User writes email: "I'll send you a calendar invite for our meeting tomorrow at 3pm"
Later, user closes Mail without creating calendar event.

**SYNC should:**
1. Capture the email content via OCR
2. Extract commitment: "send calendar invite, meeting tomorrow 3pm"
3. Monitor for Calendar app activity
4. After 30 minutes, if no calendar created → flag as pending action
5. Proactively remind user or offer to help

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEEP CONTEXT PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                   │
│  │   CAPTURE    │───►│     OCR      │───►│   EXTRACT    │                   │
│  │  Screenshot  │    │  Text Layer  │    │   Entities   │                   │
│  │  every 30s   │    │ (Vision API) │    │              │                   │
│  └──────────────┘    └──────────────┘    └──────────────┘                   │
│                                                 │                            │
│                                                 ▼                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      SEMANTIC ANALYZER (LLM)                          │   │
│  │                                                                       │   │
│  │  Extracts:                                                           │   │
│  │  - Commitments ("I will...", "Let me send...", "I'll follow up...")  │   │
│  │  - Action items ("TODO:", "Need to:", "Remember to:")                │   │
│  │  - Meetings/Events (dates, times, participants)                      │   │
│  │  - Email drafts (recipient, subject, intent)                         │   │
│  │  - Form submissions (what was filled, what was sent)                 │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                 │                            │
│                                                 ▼                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       CONTEXT STORE (SQLite)                          │   │
│  │                                                                       │   │
│  │  Tables:                                                              │   │
│  │  - screen_captures (timestamp, app, text_content, analysis)          │   │
│  │  - commitments (id, text, due_by, status, related_app, context)      │   │
│  │  - action_items (id, description, detected_at, completed_at)         │   │
│  │  - email_drafts (id, to, subject, body_summary, sent_at)             │   │
│  │  - calendar_events (id, title, time, created_from_commitment)        │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                 │                            │
│                                                 ▼                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    CROSS-REFERENCE ENGINE                             │   │
│  │                                                                       │   │
│  │  Matches:                                                            │   │
│  │  - Commitment → Completed Action (or flags as pending)               │   │
│  │  - Email mention of invite → Calendar event created                  │   │
│  │  - "I'll send the doc" → File sent via email/slack                   │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                 │                            │
│                                                 ▼                            │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      SYNC ENRICHED CONTEXT                            │   │
│  │                                                                       │   │
│  │  Provides to SYNC AI:                                                │   │
│  │  - Current screen understanding                                      │   │
│  │  - Pending commitments                                               │   │
│  │  - Incomplete actions                                                │   │
│  │  - Suggested follow-ups                                              │   │
│  │  - Proactive reminders                                               │   │
│  │                                                                       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Screen Capture Service
**File:** `src/main/services/screenCapture.ts`

```typescript
interface ScreenCapture {
  id: number;
  timestamp: number;
  appName: string;
  windowTitle: string;
  imagePath: string;         // Local file path to screenshot
  textContent: string | null; // OCR extracted text
  analyzed: boolean;
}

class ScreenCaptureService {
  // Capture every 30 seconds when user is active
  // Uses macOS screencapture utility or Electron's desktopCapturer
  // Stores in temp directory with cleanup after analysis
}
```

**Key features:**
- Capture only active window (not full screen for privacy)
- 30-second interval when active, pause when idle
- Automatic cleanup of images after OCR processing
- Privacy: exclude sensitive apps (banking, passwords)

### Phase 2: OCR Processing
**File:** `src/main/services/ocrService.ts`

**Options:**
1. **macOS Vision Framework** (via Swift/Obj-C bridge) - Native, fast, accurate
2. **Tesseract.js** - Pure JS, cross-platform, slightly slower
3. **Together.ai Vision Model** - Cloud-based, most intelligent but needs network

**Recommended:** Hybrid approach
- Use macOS Vision locally for speed (free, fast)
- Fall back to Together.ai for complex layouts or when analysis needed

```typescript
interface OCRResult {
  text: string;
  confidence: number;
  regions: {
    text: string;
    bounds: { x: number; y: number; width: number; height: number };
    type: 'heading' | 'paragraph' | 'button' | 'input' | 'link';
  }[];
}
```

### Phase 3: Semantic Analyzer
**File:** `src/main/services/semanticAnalyzer.ts`

Uses Together.ai LLM (Kimi-K2) to analyze screen text and extract:

```typescript
interface ScreenAnalysis {
  timestamp: number;
  appContext: {
    app: string;
    activity: 'composing_email' | 'reading_email' | 'editing_doc' | 'browsing' | 'coding' | 'meeting' | 'calendar' | 'other';
  };

  // Extracted commitments
  commitments: {
    text: string;              // "I'll send you the calendar invite"
    type: 'send_email' | 'send_file' | 'create_event' | 'make_call' | 'follow_up' | 'other';
    recipient?: string;        // Who the commitment is to
    deadline?: string;         // When (if mentioned)
    confidence: number;
  }[];

  // Detected action items
  actionItems: {
    text: string;
    priority: 'high' | 'medium' | 'low';
    source: 'email' | 'document' | 'chat' | 'self';
  }[];

  // Email context (if in email app)
  emailContext?: {
    composing: boolean;
    to: string[];
    subject: string;
    bodyPreview: string;
    attachments: string[];
  };

  // Calendar context
  calendarContext?: {
    viewing: boolean;
    creating: boolean;
    eventTitle?: string;
    eventTime?: string;
    participants?: string[];
  };
}
```

**LLM Prompt Template:**
```
Analyze this screen content from {appName}. Extract:

1. COMMITMENTS: Any promises or statements of future action
   - "I will...", "Let me send...", "I'll get back to you..."
   - Include who it's to and any deadlines mentioned

2. ACTION ITEMS: Tasks detected
   - TODO items, requests, things that need doing

3. CONTEXT: What is the user doing right now?
   - Composing email, reading document, in a meeting, etc.

4. EMAIL DETAILS: If in email app
   - To, Subject, Body summary, any commitments in the email

Screen Content:
{ocrText}

Respond in JSON format:
{schema}
```

### Phase 4: Context Store
**File:** `src/main/db/database.ts` (add migration)

```sql
-- Migration: 004_deep_context

-- Screen captures with OCR results
CREATE TABLE screen_captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  app_name TEXT NOT NULL,
  window_title TEXT,
  text_content TEXT,
  analysis TEXT, -- JSON: ScreenAnalysis
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_captures_timestamp ON screen_captures(timestamp);
CREATE INDEX idx_captures_app ON screen_captures(app_name);

-- Commitments/promises extracted
CREATE TABLE commitments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  type TEXT NOT NULL, -- 'send_email', 'create_event', etc.
  recipient TEXT,
  deadline INTEGER, -- timestamp
  detected_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'expired'
  source_capture_id INTEGER REFERENCES screen_captures(id),
  context TEXT, -- JSON with additional details
  synced INTEGER DEFAULT 0
);

CREATE INDEX idx_commitments_status ON commitments(status);
CREATE INDEX idx_commitments_deadline ON commitments(deadline);

-- Action items detected
CREATE TABLE action_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  source TEXT, -- 'email', 'document', 'chat'
  detected_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT DEFAULT 'pending',
  source_capture_id INTEGER REFERENCES screen_captures(id)
);

-- Track completed actions for cross-reference
CREATE TABLE completed_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_type TEXT NOT NULL, -- 'sent_email', 'created_event', 'sent_file'
  details TEXT, -- JSON
  timestamp INTEGER NOT NULL,
  matched_commitment_id INTEGER REFERENCES commitments(id)
);
```

### Phase 5: Cross-Reference Engine
**File:** `src/main/services/crossReferenceEngine.ts`

Runs periodically to match commitments with completed actions:

```typescript
class CrossReferenceEngine {
  // Every 5 minutes, check:
  // 1. Any commitments made in last hour?
  // 2. Any matching completed actions?
  // 3. Flag unmatched commitments as "pending follow-up"

  async checkCommitments(): Promise<PendingFollowUp[]> {
    const recentCommitments = this.getRecentCommitments(60); // last hour
    const completedActions = this.getRecentCompletedActions(60);

    const pendingFollowUps: PendingFollowUp[] = [];

    for (const commitment of recentCommitments) {
      if (commitment.type === 'create_event') {
        // Check if calendar event was created
        const calendarAction = completedActions.find(a =>
          a.type === 'created_event' &&
          this.isRelated(commitment, a)
        );

        if (!calendarAction) {
          pendingFollowUps.push({
            commitment,
            suggestedAction: 'Create calendar event',
            context: 'You mentioned sending a calendar invite but no event was created',
          });
        }
      }
      // Similar for send_email, send_file, etc.
    }

    return pendingFollowUps;
  }
}
```

### Phase 6: Enriched Context for SYNC
**File:** `src/main/services/contextManager.ts` (extend)

Add to existing context:

```typescript
interface EnrichedContext extends ContextSnapshot {
  // ... existing fields ...

  // Deep context additions
  screenUnderstanding: {
    currentActivity: string;
    contentSummary: string;
  };

  pendingCommitments: {
    count: number;
    urgent: Commitment[];
    recent: Commitment[];
  };

  actionItems: {
    total: number;
    high_priority: number;
    items: ActionItem[];
  };

  suggestedFollowUps: {
    text: string;
    reason: string;
    action: string;
  }[];
}
```

---

## Privacy Considerations

1. **Local Processing First**
   - All OCR done locally via macOS Vision
   - Only send to cloud LLM for semantic analysis (not raw screenshots)

2. **Sensitive App Exclusion**
   - Expand `SENSITIVE_APP_PATTERNS` to include:
     - Banking apps
     - Password managers
     - Medical apps
     - Private browsing windows
     - Incognito modes

3. **Data Retention**
   - Screen captures: Delete images after OCR (keep only text)
   - Text content: Retain for 24 hours max
   - Commitments/Actions: Retain until completed + 7 days

4. **User Control**
   - Toggle deep context on/off
   - Exclude specific apps
   - Clear all captured data on demand

---

## Performance Considerations

1. **Capture Throttling**
   - Only capture when app/window changes OR every 30s
   - Skip if same content as last capture (image hash comparison)

2. **Async Processing**
   - OCR and analysis run in background worker
   - Don't block main thread

3. **Batch Analysis**
   - Group screen captures for semantic analysis
   - Send 3-5 captures to LLM at once for efficiency

4. **Smart Scheduling**
   - More frequent during active email/calendar use
   - Less frequent during coding/watching videos

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/main/services/screenCapture.ts` | CREATE | Screen capture service |
| `src/main/services/ocrService.ts` | CREATE | OCR processing (Vision + fallback) |
| `src/main/services/semanticAnalyzer.ts` | CREATE | LLM-powered content analysis |
| `src/main/services/crossReferenceEngine.ts` | CREATE | Commitment/action matching |
| `src/main/db/database.ts` | MODIFY | Add deep context tables |
| `src/main/services/contextManager.ts` | MODIFY | Integrate enriched context |
| `src/main/services/scheduler.ts` | MODIFY | Schedule deep context tasks |
| `src/shared/types.ts` | MODIFY | Add new type definitions |
| `src/shared/constants.ts` | MODIFY | Add deep context config |
| `src/main/ipc/handlers.ts` | MODIFY | Add IPC for settings/status |

---

## Supabase Schema (Cloud Sync)

```sql
-- New table for syncing commitments
CREATE TABLE desktop_commitments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  type TEXT NOT NULL,
  recipient TEXT,
  deadline TIMESTAMPTZ,
  detected_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  context JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE desktop_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own commitments"
ON desktop_commitments FOR SELECT
USING (user_id = auth_uid());

CREATE POLICY "Users can insert own commitments"
ON desktop_commitments FOR INSERT
WITH CHECK (user_id = auth_uid());

CREATE POLICY "Users can update own commitments"
ON desktop_commitments FOR UPDATE
USING (user_id = auth_uid());
```

---

## Testing Scenarios

1. **Email Commitment Detection**
   - Compose email saying "I'll send calendar invite"
   - Verify commitment extracted
   - Close email without creating event
   - Verify reminder triggered

2. **Calendar Event Creation**
   - Make commitment to create meeting
   - Open Calendar, create event
   - Verify commitment marked complete

3. **Cross-App Tracking**
   - Slack message: "I'll email you the doc"
   - Switch to Mail, send email with attachment
   - Verify action matched

4. **Privacy**
   - Open 1Password - verify no capture
   - Open banking app - verify no capture
   - Toggle deep context off - verify all capture stops
