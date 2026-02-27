# Deep Context Engine Takeover — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the DeepContextEngine the primary context source for SYNC conversations, enhance its detection capabilities, sync deep context to Supabase, and upgrade the web app to consume rich context.

**Architecture:** Engine Takeover — DeepContextEngine becomes primary, basic contextManager becomes fallback. Enhanced commitment/skill/entity detection. New `desktop_context_events` Supabase table. SYNC edge function queries deep context for richer system prompts.

**Tech Stack:** Electron (TypeScript), SQLite, Supabase (PostgreSQL + Edge Functions), React

---

## Task 1: Wire DeepContextEngine into IPC Handler (Desktop)

**Files:**
- Modify: `sync.desktop/src/main/ipc/handlers.ts:184-195`
- Modify: `sync.desktop/src/main/ipc/handlers.ts:11-26` (imports)

**Step 1: Add import for getDeepContextEngine**

In `src/main/ipc/handlers.ts`, update the import from `../index` at line 20-26 to include `getDeepContextEngine`:

```typescript
import {
  getContextManager,
  getSummaryService,
  getJournalService,
  getCloudSyncService,
  getDeepContextManager,
  getNotchBridge,
  getDeepContextEngine,  // ADD THIS
} from '../index';
```

**Step 2: Replace the IPC handler to use DeepContextEngine first**

Replace lines 184-195 in `src/main/ipc/handlers.ts`:

```typescript
ipcMain.handle(IPC_CHANNELS.ACTIVITY_GET_CONTEXT_FOR_SYNC, () => {
  try {
    // Primary: DeepContextEngine (rich context)
    const deepEngine = getDeepContextEngine();
    if (deepEngine) {
      const deepContext = deepEngine.getContextForSync();
      if (deepContext && deepContext.length > 0) {
        // Append basic tracker data (focus score, idle state)
        const contextManager = getContextManager();
        const basicContext = contextManager?.getContextForSync() || '';

        // Merge: deep context first, then append focus/idle from basic
        const focusLine = basicContext.split('\n').find(l => l.startsWith('Focus score:'));
        const idleLine = basicContext.split('\n').find(l => l.includes('idle'));
        const extras = [focusLine, idleLine].filter(Boolean).join('\n');

        const merged = extras ? `${deepContext}\n${extras}` : deepContext;
        return { success: true, data: merged };
      }
    }

    // Fallback: basic contextManager
    const contextManager = getContextManager();
    if (contextManager) {
      const context = contextManager.getContextForSync();
      return { success: true, data: context };
    }
    return { success: true, data: '' };
  } catch (error) {
    console.error('[ipc] Error getting context for sync:', error);
    // Fallback to basic on any error
    try {
      const contextManager = getContextManager();
      return { success: true, data: contextManager?.getContextForSync() || '' };
    } catch {
      return { success: false, error: String(error) };
    }
  }
});
```

**Step 3: Verify getDeepContextEngine is exported from index.ts**

Check `src/main/index.ts` — the function `getDeepContextEngine()` already exists at line 483. No changes needed.

**Step 4: Build and test**

Run: `cd /Users/godyduinsbergen/sync.desktop && npm run build`
Expected: Compiles without errors.

**Step 5: Commit**

```bash
cd /Users/godyduinsbergen/sync.desktop
git add src/main/ipc/handlers.ts
git commit -m "feat: wire DeepContextEngine as primary context source for SYNC chat"
```

---

## Task 2: Enhance Commitment Detection Patterns (Desktop)

**Files:**
- Modify: `sync.desktop/src/deep-context/pipeline/eventClassifier.ts:135-157`

**Step 1: Add new commitment patterns**

After the existing `COMMITMENT_PATTERNS` array (line 138-157), add these additional patterns:

```typescript
// Add these entries to COMMITMENT_PATTERNS array before the closing ];

  // Slack/Teams channel patterns
  { regex: /@(?:channel|here|everyone)\s+(?:reminder|heads up|please|action|todo):\s*(.+?)(?:\.|!|$)/gi, action: 'follow_up' },
  // Calendar invite patterns
  { regex: /(?:invited? (?:you |them )?to|scheduled?|booked?)\s+(?:a |the )?(.+?)(?:\.|!|$)/gi, action: 'create_event' },
  // "Can you" / "Could you" delegation patterns
  { regex: /(?:can|could|would) you (?:please )?(?:send|email|schedule|create|forward|share|review|check|update)(.+?)(?:\?|$)/gi, action: 'follow_up' },
  // "Will do" / "On it" confirmation patterns
  { regex: /(?:will do|on it|sure thing|absolutely|got it|consider it done)[,.]?\s*(?:I'll |will )?(.+?)(?:\.|!|$)/gi, action: 'follow_up' },
  // Sprint/agile deadline patterns
  { regex: /(?:by|before|due|deadline)\s+(?:end of sprint|next sprint|standup|retro|demo|release|launch|go-?live|asap|eob|eow)/gi, action: 'deadline' },
  // "Don't forget" / "Make sure" patterns
  { regex: /(?:don't forget|make sure|remember) to (.+?)(?:\.|!|$)/gi, action: 'follow_up' },
```

**Step 2: Add new deadline patterns**

After the existing `DEADLINE_PATTERNS` array (line 163-209), add:

```typescript
// Add these entries to DEADLINE_PATTERNS array before the closing ];

  {
    regex: /\b(?:asap|as soon as possible|urgent|immediately)\b/i,
    resolver: () => {
      const d = new Date();
      d.setHours(d.getHours() + 2); // 2 hours from now
      return d.getTime();
    },
  },
  {
    regex: /\b(?:end of week|eow|this week)\b/i,
    resolver: () => nextDayOfWeek(5), // Friday
  },
  {
    regex: /\b(?:end of month|eom)\b/i,
    resolver: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1, 0); // Last day of current month
      d.setHours(17, 0, 0, 0);
      return d.getTime();
    },
  },
  {
    regex: /\b(?:next sprint|end of sprint)\b/i,
    resolver: () => {
      const d = new Date();
      d.setDate(d.getDate() + 14); // ~2 weeks
      d.setHours(9, 0, 0, 0);
      return d.getTime();
    },
  },
```

**Step 3: Build and verify**

Run: `cd /Users/godyduinsbergen/sync.desktop && npm run build`
Expected: Compiles without errors.

**Step 4: Commit**

```bash
cd /Users/godyduinsbergen/sync.desktop
git add src/deep-context/pipeline/eventClassifier.ts
git commit -m "feat: enhance commitment detection with Slack, delegation, and sprint patterns"
```

---

## Task 3: Enhance Skill Signal Detection (Desktop)

**Files:**
- Modify: `sync.desktop/src/deep-context/pipeline/eventClassifier.ts` (skill detection section)

**Step 1: Find and read the skill detection method**

Look for `detectSkillSignals` method and the language detection patterns in `eventClassifier.ts`. Read the full method.

**Step 2: Add framework detection to skill signals**

In the `detectSkillSignals` method, after the language detection patterns, add framework detection:

```typescript
// Framework detection patterns (add after language patterns)
const FRAMEWORK_PATTERNS: { pattern: RegExp; framework: string; category: string }[] = [
  { pattern: /\b(?:useState|useEffect|useRef|useMemo|useCallback|React\.)\b/g, framework: 'React', category: 'Frontend' },
  { pattern: /\b(?:next\/|getServerSideProps|getStaticProps|NextResponse|app\/.*\/page)\b/g, framework: 'Next.js', category: 'Frontend' },
  { pattern: /\b(?:vue\.|v-bind|v-model|v-if|defineComponent|ref\(|computed\()\b/g, framework: 'Vue.js', category: 'Frontend' },
  { pattern: /\b(?:@angular|NgModule|@Component|@Injectable|ngOnInit)\b/g, framework: 'Angular', category: 'Frontend' },
  { pattern: /\b(?:from django|from flask|FastAPI|@app\.route|Blueprint)\b/g, framework: 'Python Web', category: 'Backend' },
  { pattern: /\b(?:express\(|app\.get\(|app\.post\(|router\.|middleware)\b/g, framework: 'Express.js', category: 'Backend' },
  { pattern: /\b(?:Deno\.serve|oak|fresh)\b/g, framework: 'Deno', category: 'Backend' },
  { pattern: /\b(?:docker|Dockerfile|docker-compose|ENTRYPOINT|FROM .+ AS)\b/gi, framework: 'Docker', category: 'DevOps' },
  { pattern: /\b(?:terraform|resource "|provider "|module ")\b/g, framework: 'Terraform', category: 'Infrastructure' },
  { pattern: /\b(?:tailwind|@apply|className="|class=".*(?:flex|grid|bg-|text-))\b/g, framework: 'Tailwind CSS', category: 'Styling' },
];
```

**Step 3: Add file-path-based skill detection**

Add detection based on window title file paths:

```typescript
// File path skill detection (from window title)
const FILE_SKILL_MAP: Record<string, { skill: string; category: string }> = {
  'package.json': { skill: 'Node.js', category: 'Runtime' },
  'Cargo.toml': { skill: 'Rust', category: 'Language' },
  'go.mod': { skill: 'Go', category: 'Language' },
  'requirements.txt': { skill: 'Python', category: 'Language' },
  'Pipfile': { skill: 'Python', category: 'Language' },
  'pyproject.toml': { skill: 'Python', category: 'Language' },
  'Gemfile': { skill: 'Ruby', category: 'Language' },
  'pom.xml': { skill: 'Java/Maven', category: 'Build' },
  'build.gradle': { skill: 'Java/Gradle', category: 'Build' },
  'docker-compose.yml': { skill: 'Docker Compose', category: 'DevOps' },
  'Dockerfile': { skill: 'Docker', category: 'DevOps' },
  '.github/workflows': { skill: 'GitHub Actions', category: 'CI/CD' },
  'terraform': { skill: 'Terraform', category: 'Infrastructure' },
  'tsconfig.json': { skill: 'TypeScript', category: 'Language' },
  'vite.config': { skill: 'Vite', category: 'Build' },
  'webpack.config': { skill: 'Webpack', category: 'Build' },
};
```

**Step 4: Integrate into detectSkillSignals method**

After existing skill detection, add framework and file-path checks:

```typescript
// Check text for framework patterns
for (const fp of FRAMEWORK_PATTERNS) {
  if (fp.pattern.test(text)) {
    signals.push({
      skillCategory: fp.category,
      skillPath: [fp.category, fp.framework],
      proficiencyIndicator: 'intermediate',
      evidence: `Using ${fp.framework} patterns`,
    });
  }
  fp.pattern.lastIndex = 0; // Reset regex state
}

// Check window title for file-path skill signals
const windowTitle = capture?.windowTitle || '';
for (const [fileKey, skillInfo] of Object.entries(FILE_SKILL_MAP)) {
  if (windowTitle.toLowerCase().includes(fileKey.toLowerCase())) {
    signals.push({
      skillCategory: skillInfo.category,
      skillPath: [skillInfo.category, skillInfo.skill],
      proficiencyIndicator: 'intermediate',
      evidence: `Working with ${fileKey}`,
    });
  }
}
```

**Step 5: Build and verify**

Run: `cd /Users/godyduinsbergen/sync.desktop && npm run build`

**Step 6: Commit**

```bash
cd /Users/godyduinsbergen/sync.desktop
git add src/deep-context/pipeline/eventClassifier.ts
git commit -m "feat: add framework and file-path skill detection"
```

---

## Task 4: Improve DeepContextEngine.getContextForSync() Output (Desktop)

**Files:**
- Modify: `sync.desktop/src/deep-context/index.ts:284-341`

**Step 1: Enhance the getContextForSync method**

Replace the existing `getContextForSync()` method in `src/deep-context/index.ts` (lines 284-341) with a richer version:

```typescript
  getContextForSync(): string {
    const recentEvents = this.getRecentEvents(15, 20);
    const commitments = this.getCommitments(Date.now() - 24 * 60 * 60 * 1000);

    if (recentEvents.length === 0) {
      return '';
    }

    const lines: string[] = ['--- Deep Context ---'];

    // Current activity with rich detail
    const latest = recentEvents[0];
    if (latest) {
      lines.push(`Current: ${latest.semanticPayload.summary}`);
      if (latest.semanticPayload.intent) {
        lines.push(`Intent: ${latest.semanticPayload.intent}`);
      }
      if (latest.source.filePath) {
        lines.push(`File: ${latest.source.filePath}`);
      }
    }

    // Recent context switches
    const switches = recentEvents.filter((e) => e.eventType === 'context_switch');
    if (switches.length > 0) {
      lines.push(`Context switches (last 15 min): ${switches.length}`);
    }

    // Recent entities (people, projects, tools)
    const allEntities = new Set<string>();
    for (const event of recentEvents.slice(0, 10)) {
      for (const entity of event.semanticPayload.entities) {
        allEntities.add(entity);
      }
    }
    if (allEntities.size > 0) {
      lines.push(`Mentioned: ${Array.from(allEntities).slice(0, 10).join(', ')}`);
    }

    // Pending commitments (the big differentiator)
    const pendingCommitments = commitments.filter(
      (c) => c.status === 'detected' || c.status === 'pending_action'
    );
    if (pendingCommitments.length > 0) {
      lines.push(`Pending commitments (${pendingCommitments.length}):`);
      for (const c of pendingCommitments.slice(0, 5)) {
        const due = c.dueDate ? ` (due: ${new Date(c.dueDate).toLocaleString()})` : ' (no deadline)';
        const parties = c.involvedParties.length > 0 ? ` [${c.involvedParties.join(', ')}]` : '';
        lines.push(`  - ${c.description}${due}${parties}`);
      }
    }

    // Overdue commitments (urgent)
    const overdueCommitments = commitments.filter((c) => c.status === 'overdue');
    if (overdueCommitments.length > 0) {
      lines.push(`OVERDUE (${overdueCommitments.length}):`);
      for (const c of overdueCommitments.slice(0, 3)) {
        lines.push(`  ! ${c.description}`);
      }
    }

    // Active skill signals from recent events
    const skillSet = new Set<string>();
    for (const event of recentEvents.slice(0, 10)) {
      const skills = event.semanticPayload.skillSignals || [];
      for (const s of skills) {
        skillSet.add(s.skillPath.join(' > '));
      }
    }
    if (skillSet.size > 0) {
      lines.push(`Active skills: ${Array.from(skillSet).slice(0, 5).join(', ')}`);
    }

    // Recent apps
    const recentApps = [...new Set(recentEvents.map((e) => e.source.application))];
    if (recentApps.length > 0) {
      lines.push(`Recent apps: ${recentApps.slice(0, 5).join(', ')}`);
    }

    lines.push('---');

    return lines.join('\n');
  }
```

**Step 2: Build and verify**

Run: `cd /Users/godyduinsbergen/sync.desktop && npm run build`

**Step 3: Commit**

```bash
cd /Users/godyduinsbergen/sync.desktop
git add src/deep-context/index.ts
git commit -m "feat: enrich deep context output with overdue alerts, skills, and file paths"
```

---

## Task 5: Add Deep Context Sync to CloudSyncService (Desktop)

**Files:**
- Modify: `sync.desktop/src/main/services/cloudSyncService.ts`
- Reference: `sync.desktop/src/deep-context/store/contextEventStore.ts`

**Step 1: Add DeepContextEngine import and constructor param**

At the top of `cloudSyncService.ts`, add import:

```typescript
import { DeepContextEngine } from '../../deep-context';
import type { ContextEvent } from '../../deep-context/types';
```

Update the class to accept a DeepContextEngine:

```typescript
export class CloudSyncService {
  private summaryService: SummaryService;
  private journalService: JournalService;
  private deepContextEngine: DeepContextEngine | null;
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;
  private syncErrors: string[] = [];

  constructor(
    summaryService: SummaryService,
    journalService: JournalService,
    deepContextEngine?: DeepContextEngine
  ) {
    this.summaryService = summaryService;
    this.journalService = journalService;
    this.deepContextEngine = deepContextEngine || null;
  }
```

**Step 2: Add syncContextEvents method**

After `syncDailyJournals()`, add:

```typescript
  /**
   * Sync deep context events to cloud
   */
  private async syncContextEvents(): Promise<number> {
    if (!this.deepContextEngine) return 0;

    const user = getUser();
    if (!user?.id || !user?.companyId) return 0;

    // Get unsynced events (sync_allowed only)
    const unsyncedEvents = this.deepContextEngine.getUnsyncedEvents(50);
    if (unsyncedEvents.length === 0) return 0;

    console.log(`[sync] Syncing ${unsyncedEvents.length} deep context events`);
    let syncedCount = 0;

    // Batch upload (chunks of 10)
    for (let i = 0; i < unsyncedEvents.length; i += 10) {
      const batch = unsyncedEvents.slice(i, i + 10);
      const cloudData = batch.map((event) => ({
        user_id: user.id,
        company_id: user.companyId,
        event_type: event.eventType,
        source_application: event.source.application,
        source_window_title: event.source.windowTitle?.substring(0, 200),
        summary: event.semanticPayload.summary,
        entities: event.semanticPayload.entities,
        intent: event.semanticPayload.intent || null,
        commitments: event.semanticPayload.commitments || [],
        skill_signals: event.semanticPayload.skillSignals || [],
        confidence: event.confidence,
        privacy_level: event.privacyLevel,
        created_at: new Date(event.timestamp).toISOString(),
      }));

      const { error } = await this.supabaseRequest(
        'desktop_context_events',
        'POST',
        cloudData
      );

      if (error) {
        console.error('[sync] Context events batch failed:', error.message);
        this.syncErrors.push(`Context events: ${error.message}`);
      } else {
        // Mark as synced locally
        for (const event of batch) {
          if (event.id) {
            this.deepContextEngine!.markEventSynced(event.id);
          }
        }
        syncedCount += batch.length;
      }
    }

    return syncedCount;
  }
```

**Step 3: Add context events to main sync() method**

In the `sync()` method (around line 177-208), after journal sync, add:

```typescript
      // Sync deep context events
      const contextCount = await this.syncContextEvents();
      result.syncedItems.contextEvents = contextCount;
```

Update the `SyncResult` interface to include contextEvents:

```typescript
export interface SyncResult {
  success: boolean;
  error?: string;
  syncedItems: {
    activities: number;
    summaries: number;
    journals: number;
    contextEvents: number;  // ADD THIS
  };
}
```

And update the initial value in `sync()`:

```typescript
    const result: SyncResult = {
      success: true,
      syncedItems: { activities: 0, summaries: 0, journals: 0, contextEvents: 0 },
    };
```

**Step 4: Add getUnsyncedEvents and markEventSynced to DeepContextEngine**

In `src/deep-context/index.ts`, add these methods to the class:

```typescript
  /**
   * Get unsynced events that are allowed to be synced
   */
  getUnsyncedEvents(limit: number = 50): ContextEvent[] {
    return this.store.getUnsyncedEvents(limit);
  }

  /**
   * Mark an event as synced
   */
  markEventSynced(eventId: number): void {
    this.store.markSynced(eventId);
  }
```

**Step 5: Add getUnsyncedEvents and markSynced to ContextEventStore**

In `src/deep-context/store/contextEventStore.ts`, add:

```typescript
  /**
   * Get unsynced events with privacy_level = 'sync_allowed'
   */
  getUnsyncedEvents(limit: number = 50): ContextEvent[] {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM context_events
      WHERE synced = 0 AND privacy_level = 'sync_allowed'
      ORDER BY timestamp ASC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map((row) => this.rowToEvent(row));
  }

  /**
   * Mark a single event as synced
   */
  markSynced(eventId: number): void {
    const db = getDatabase();
    db.prepare('UPDATE context_events SET synced = 1 WHERE id = ?').run(eventId);
  }
```

**Step 6: Update CloudSyncService constructor call in index.ts**

In `src/main/index.ts`, find where CloudSyncService is constructed and pass the deepContextEngine:

```typescript
// Find: new CloudSyncService(summaryService, journalService)
// Replace with: new CloudSyncService(summaryService, journalService, deepContextEngine || undefined)
```

**Step 7: Build and verify**

Run: `cd /Users/godyduinsbergen/sync.desktop && npm run build`

**Step 8: Commit**

```bash
cd /Users/godyduinsbergen/sync.desktop
git add src/main/services/cloudSyncService.ts src/deep-context/index.ts src/deep-context/store/contextEventStore.ts src/main/index.ts
git commit -m "feat: sync deep context events to Supabase cloud"
```

---

## Task 6: Create Supabase Migration for desktop_context_events Table (Web App)

**Files:**
- Create: `app.isyncso/supabase/migrations/20260227120000_desktop_context_events.sql`

**Step 1: Write the migration**

```sql
-- Deep Context Events from Desktop App
-- Receives rich activity context from the DeepContextEngine

CREATE TABLE IF NOT EXISTS public.desktop_context_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID,
  event_type TEXT NOT NULL,
  source_application TEXT,
  source_window_title TEXT,
  summary TEXT,
  entities JSONB DEFAULT '[]'::jsonb,
  intent TEXT,
  commitments JSONB DEFAULT '[]'::jsonb,
  skill_signals JSONB DEFAULT '[]'::jsonb,
  confidence REAL DEFAULT 0.5,
  privacy_level TEXT DEFAULT 'sync_allowed',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_dce_user_created
  ON public.desktop_context_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dce_type
  ON public.desktop_context_events(event_type);
CREATE INDEX IF NOT EXISTS idx_dce_company
  ON public.desktop_context_events(company_id, created_at DESC);

-- RLS
ALTER TABLE public.desktop_context_events ENABLE ROW LEVEL SECURITY;

-- Users can read own events
CREATE POLICY "Users can read own context events"
  ON public.desktop_context_events
  FOR SELECT TO authenticated
  USING (user_id = auth_uid());

-- Desktop app inserts via anon key with user token
CREATE POLICY "Authenticated users can insert context events"
  ON public.desktop_context_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth_uid());

-- Retention: auto-delete events older than 30 days (via pg_cron)
-- Run weekly: DELETE FROM desktop_context_events WHERE created_at < now() - interval '30 days';
```

**Step 2: Apply migration**

Deploy via Supabase Management API or MCP:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/sfxpmzicgpaxfntqleig/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL from above>"}'
```

**Step 3: Commit**

```bash
cd /Users/godyduinsbergen/app.isyncso
git add supabase/migrations/20260227120000_desktop_context_events.sql
git commit -m "feat: add desktop_context_events table for deep context sync"
```

---

## Task 7: Upgrade SYNC Edge Function to Query Deep Context (Web App)

**Files:**
- Modify: `app.isyncso/supabase/functions/sync/index.ts`

**Step 1: Add deep context query helper function**

Near the top of `index.ts` (after the helper functions), add:

```typescript
/**
 * Fetch recent deep context events for a user from the desktop app.
 * Returns a formatted string to inject into the system prompt.
 */
async function getDesktopDeepContext(
  supabase: any,
  userId: string
): Promise<string> {
  try {
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: events, error } = await supabase
      .from('desktop_context_events')
      .select('event_type, source_application, summary, entities, intent, commitments, skill_signals, created_at')
      .eq('user_id', userId)
      .gte('created_at', fifteenMinAgo)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !events || events.length === 0) return '';

    const lines: string[] = ['--- Desktop Deep Context ---'];

    // Latest activity
    const latest = events[0];
    if (latest.summary) lines.push(`Current: ${latest.summary}`);
    if (latest.intent) lines.push(`Intent: ${latest.intent}`);

    // Context switches
    const switches = events.filter((e: any) => e.event_type === 'context_switch');
    if (switches.length > 0) lines.push(`Context switches (15 min): ${switches.length}`);

    // All entities mentioned
    const allEntities = new Set<string>();
    for (const event of events.slice(0, 10)) {
      const entities = event.entities || [];
      for (const e of entities) allEntities.add(e);
    }
    if (allEntities.size > 0) {
      lines.push(`Entities mentioned: ${Array.from(allEntities).slice(0, 10).join(', ')}`);
    }

    // Pending commitments (from all recent events)
    const allCommitments: any[] = [];
    for (const event of events) {
      const cmts = event.commitments || [];
      for (const c of cmts) {
        if (c.status === 'detected' || c.status === 'pending_action') {
          allCommitments.push(c);
        }
      }
    }
    if (allCommitments.length > 0) {
      lines.push(`Pending commitments (${allCommitments.length}):`);
      for (const c of allCommitments.slice(0, 5)) {
        const due = c.dueDate ? ` (due: ${new Date(c.dueDate).toLocaleString()})` : '';
        lines.push(`  - ${c.description}${due}`);
      }
    }

    // Skills being used
    const skillSet = new Set<string>();
    for (const event of events.slice(0, 10)) {
      const skills = event.skill_signals || [];
      for (const s of skills) {
        const path = Array.isArray(s.skillPath) ? s.skillPath.join(' > ') : s.skillCategory;
        skillSet.add(path);
      }
    }
    if (skillSet.size > 0) {
      lines.push(`Active skills: ${Array.from(skillSet).slice(0, 5).join(', ')}`);
    }

    // Recent apps
    const apps = [...new Set(events.map((e: any) => e.source_application).filter(Boolean))];
    if (apps.length > 0) lines.push(`Recent apps: ${apps.slice(0, 5).join(', ')}`);

    lines.push('---');
    return lines.join('\n');
  } catch (err) {
    console.error('[sync] Error fetching desktop deep context:', err);
    return '';
  }
}
```

**Step 2: Inject deep context into SYNC's message processing**

Find where the user message is sent to the LLM (in the main request handler). Before the LLM call, add:

```typescript
// Fetch desktop deep context if userId is available
let desktopContext = '';
if (userId) {
  desktopContext = await getDesktopDeepContext(supabase, userId);
}

// Prepend to user message or add as system context
if (desktopContext) {
  // Add as a system-level context block before the user's message
  effectiveMessages.push({
    role: 'system',
    content: desktopContext,
  });
}
```

**Step 3: Deploy**

```bash
SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
npx supabase functions deploy sync --project-ref sfxpmzicgpaxfntqleig --no-verify-jwt
```

**Step 4: Commit**

```bash
cd /Users/godyduinsbergen/app.isyncso
git add supabase/functions/sync/index.ts
git commit -m "feat: inject desktop deep context into SYNC AI conversations"
```

---

## Task 8: Add Commitments & Skills Display to DesktopActivity Page (Web App)

**Files:**
- Modify: `app.isyncso/src/pages/DesktopActivity.jsx`

**Step 1: Add a new "Deep Context" tab**

In DesktopActivity.jsx, find the tab list and add a new tab:

```jsx
{ id: 'deep-context', label: 'Deep Context', icon: Brain }
```

**Step 2: Create the Deep Context tab content**

Add a new section that queries `desktop_context_events`:

```jsx
function DeepContextTab({ userId }) {
  const [commitments, setCommitments] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDeepContext() {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await db.from('desktop_context_events')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) {
        // Extract unique commitments
        const allCommitments = [];
        const allSkills = new Set();

        for (const event of data) {
          for (const c of (event.commitments || [])) {
            allCommitments.push({ ...c, timestamp: event.created_at, app: event.source_application });
          }
          for (const s of (event.skill_signals || [])) {
            const path = Array.isArray(s.skillPath) ? s.skillPath.join(' > ') : s.skillCategory;
            allSkills.add(path);
          }
        }

        setCommitments(allCommitments);
        setSkills([...allSkills]);
      }
      setLoading(false);
    }
    if (userId) fetchDeepContext();
  }, [userId]);

  if (loading) return <div className="text-zinc-500">Loading deep context...</div>;

  return (
    <div className="space-y-6">
      {/* Commitments */}
      <div className="bg-white/[0.03] rounded-2xl p-6 border border-white/[0.06]">
        <h3 className="text-lg font-medium text-white mb-4">
          Commitments Today ({commitments.length})
        </h3>
        {commitments.length === 0 ? (
          <p className="text-zinc-500">No commitments detected today</p>
        ) : (
          <div className="space-y-3">
            {commitments.map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-xl">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  c.status === 'overdue' ? 'bg-red-400' :
                  c.status === 'fulfilled' ? 'bg-green-400' : 'bg-cyan-400'
                }`} />
                <div>
                  <p className="text-white text-sm">{c.description}</p>
                  <p className="text-zinc-500 text-xs mt-1">
                    {c.dueDate ? `Due: ${new Date(c.dueDate).toLocaleString()}` : 'No deadline'}
                    {c.involvedParties?.length > 0 && ` • ${c.involvedParties.join(', ')}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="bg-white/[0.03] rounded-2xl p-6 border border-white/[0.06]">
        <h3 className="text-lg font-medium text-white mb-4">
          Skills Exercised Today
        </h3>
        {skills.length === 0 ? (
          <p className="text-zinc-500">No skills detected today</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {skills.map((skill, i) => (
              <span key={i} className="px-3 py-1 bg-cyan-500/10 text-cyan-400 rounded-full text-sm border border-cyan-500/20">
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
cd /Users/godyduinsbergen/app.isyncso
git add src/pages/DesktopActivity.jsx
git commit -m "feat: add Deep Context tab showing commitments and skills"
```

---

## Task Summary

| Task | Scope | What It Does |
|------|-------|--------------|
| 1 | Desktop | Wire DeepContextEngine into IPC handler (primary, with fallback) |
| 2 | Desktop | Enhance commitment detection (Slack, delegation, sprint patterns) |
| 3 | Desktop | Enhance skill detection (frameworks, file paths) |
| 4 | Desktop | Improve getContextForSync() output (overdue alerts, skills, files) |
| 5 | Desktop | Add deep context event sync to CloudSyncService |
| 6 | Web App | Create desktop_context_events Supabase table |
| 7 | Web App | Inject deep context into SYNC AI system prompt |
| 8 | Web App | Add commitments/skills display to DesktopActivity page |

**Dependencies:** Task 6 must be done before Task 5 (table must exist before syncing). Task 7 depends on Task 6. Task 8 depends on Task 6. Tasks 1-4 are independent of each other and can be parallelized.
