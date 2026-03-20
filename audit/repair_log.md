# Repair Log

| Timestamp | Finding | File | Change | Agent |
|-----------|---------|------|--------|-------|
| 2026-03-20 | SEC-005 | handlers.ts | Added URL validation (https/http only) to SYSTEM_OPEN_EXTERNAL handler | fixer-3 |
| 2026-03-20 | SEC-006/SEC-013 | handlers.ts | Added input validation to 10 IPC handlers: type checks, bounds caps, allowlists | fixer-3 |
| 2026-03-20 | SEC-004 | handlers.ts | Marked ACCEPTED RISK — renderer needs token for streaming fetch to Supabase | fixer-3 |
| 2026-03-20 | LINK-002 | ipcChannels.ts | Added TODO comments to 8 dead channels documenting reserved-for-future status | fixer-3 |
| 2026-03-20 | INF-002 | .env.example | Created .env.example documenting all required env vars (TOGETHER_API_KEY, Apple notarization, Supabase overrides, VITE_DEV_SERVER_URL) | fixer-4 |
| 2026-03-20 | INF-005 | src/shared/constants.ts | Updated APP_VERSION from '1.0.0' to '2.2.0' to match package.json | fixer-4 |
| 2026-03-20 | INF-016 | src/main/services/scheduler.ts | Scheduler now reads syncIntervalMinutes and dataRetentionDays from user settings via getSettings() instead of hardcoded DEFAULT_SETTINGS | fixer-4 |
| 2026-03-20 | INF-003 | cloudSyncService.ts, renderer/config.ts | Replaced hardcoded Supabase URL/anon key with imports from shared/constants.ts | fixer-4 |
| 2026-03-20 | INF-007 | (n/a) | constants.js does not exist in source tree — finding not applicable | fixer-4 |
| 2026-03-20 | INF-014 | (skipped) | Outside owned files — recommend moving identity+artifactName to electron-builder.yml then removing build key from package.json | fixer-4 |
| 2026-03-20 | DB-022 | database.ts | Added PRAGMA foreign_keys = ON after connection open, before migrations | fixer-1 |
| 2026-03-20 | DB-009 | queries.ts | Fixed cleanupOldData() to use epoch-ms cutoff instead of datetime() on integer column | fixer-1 |
| 2026-03-20 | DB-010 | database.ts, queries.ts | Added migration 012 with dedup + UNIQUE index; rewrote upsertEntityRelationship to use ON CONFLICT DO UPDATE | fixer-1 |
| 2026-03-20 | DB-014 | database.ts | Added migration 013 with dedup + UNIQUE index on event_entity_links(event_id, entity_id) | fixer-1 |
| 2026-03-20 | DB-006 | database.ts | Added migration 014 to create local_actions table in migration system (CREATE TABLE IF NOT EXISTS) | fixer-1 |
| 2026-03-20 | DB-017 | database.ts | Added migration 015 to UPDATE screen_captures SET synced=0 WHERE synced IS NULL | fixer-1 |
| 2026-03-20 | DB-001 | database-findings.md | Marked as MITIGATED — historical data loss unrecoverable, schema already fixed by migration 010 | fixer-1 |
| 2026-03-20 | SEC-003 | store.ts | Replaced hardcoded encryption key with machine-specific SHA-256 key (hostname+username); added legacy key migration path | fixer-2 |
| 2026-03-20 | SEC-027 | floatingWidget.ts | Added Content Security Policy via session.webRequest.onHeadersReceived (production only) | fixer-2 |
| 2026-03-20 | SEC-007 | store.ts, index.ts | Added 5-minute auth state timeout, one-time-use enforcement, token validation, state expiry checks | fixer-2 |
| 2026-03-20 | SEC-010 | index.ts | Redacted token/refresh_token values in deep link log output | fixer-2 |
| 2026-03-20 | LINK-005 | floatingWidget.ts | Added getPreloadPath() with fs.existsSync verification and diagnostic logging | fixer-2 |
| 2026-03-20 | LINK-007 | index.ts | Added unknown hostname rejection with warning log; null/empty token early-return with error callback | fixer-2 |
| 2026-03-20 | A11Y-001 | FloatingAvatar.tsx | Added role="button" and aria-label="Open SYNC assistant" to outer container | fixer-6 |
| 2026-03-20 | A11Y-002 | FloatingAvatar.tsx | Added tabIndex={0} and onKeyDown handler for Enter/Space keyboard activation | fixer-6 |
| 2026-03-20 | A11Y-016 | SyncAvatarMini.tsx | Added aria-hidden="true" to decorative canvas and SVG elements | fixer-6 |
| 2026-03-20 | A11Y-024 | SemanticDashboard.tsx | Added ARIA tab pattern: role="tablist", role="tab", aria-selected, role="tabpanel", arrow key navigation | fixer-6 |
| 2026-03-20 | A11Y-025 | SemanticDashboard.tsx | Added aria-label="Back to chat" and aria-hidden on back button SVG | fixer-6 |
| 2026-03-20 | COPY-014 | SemanticDashboard.tsx | Added formatActivityType() helper to convert SCREAMING_SNAKE_CASE to Title Case | fixer-6 |
| 2026-03-20 | COPY-016 | SemanticDashboard.tsx | Added formatMetricName() helper to capitalize snake_case metric names | fixer-6 |
| 2026-03-20 | COPY-017 | SemanticDashboard.tsx | Replaced "Semantic Analysis" subtitle with "Activity Patterns" | fixer-6 |
| 2026-03-20 | COPY-019 | SemanticDashboard.tsx | Replaced "behavioral signatures" with "work patterns" in empty state | fixer-6 |
| 2026-03-20 | COPY-015 | SemanticDashboard.tsx | Standardized thread title fallback to "Untitled Thread" everywhere | fixer-6 |
| 2026-03-20 | A11Y-032 | LoginScreen.tsx | Added aria-hidden="true" to decorative gradient orbs, SyncRing SVG, and FeatureIcon SVGs | fixer-6 |
| 2026-03-20 | A11Y-020 | LoginScreen.tsx | Improved contrast: text-white/40 to /60, text-white/20 to /50 on dark backgrounds | fixer-6 |
| 2026-03-20 | A11Y-035 | LoginScreen.tsx | Added focus-visible ring to Sign in button | fixer-6 |
| 2026-03-20 | A11Y-030 | PermissionsSetup.tsx | Added role="progressbar" with aria-valuenow/min/max to progress bar | fixer-6 |
| 2026-03-20 | COPY-032 | PermissionsSetup.tsx | Fixed progress bar bug: count only required granted permissions, not all granted | fixer-6 |
| 2026-03-20 | A11Y-031 | PermissionsSetup.tsx | Added aria-hidden to status icons, sr-only granted/not-granted text, aria-label to Open Settings buttons | fixer-6 |
| 2026-03-20 | A11Y-028 | UpdateBanner.tsx | Added role="alert" to banner, aria-label="Dismiss update notification" to dismiss button | fixer-6 |
| 2026-03-20 | A11Y-029 | UpdateBanner.tsx | Added role="progressbar" with aria values to download progress bar | fixer-6 |
| 2026-03-20 | A11Y-028 | UpdateBanner.tsx | Added aria-labels to download and install buttons | fixer-6 |
| 2026-03-20 | A11Y-033 | App.tsx | Added aria-description and title tooltip to FloatingAvatar wrapper explaining click patterns | fixer-6 |
| 2026-03-20 | A11Y-026 | App.tsx | Added role="status" and aria-label to loading spinner, plus sr-only "Loading..." text | fixer-6 |
| 2026-03-20 | A11Y-015 | globals.css | Added prefers-reduced-motion media query to disable voice-bar and avatar animations | fixer-6 |
| 2026-03-20 | A11Y-034 | globals.css | Improved chat-input focus ring opacity from /20 to /40 and border from /50 to /70 | fixer-6 |
| 2026-03-20 | A11Y-035 | globals.css | Added focus-visible ring to .close-button, added .sr-only utility class | fixer-6 |
| 2026-03-20 | A11Y-003 | ChatWidget.tsx | Added aria-label="Message SYNC" to chat input field | fixer-5 |
| 2026-03-20 | A11Y-004 | ChatWidget.tsx | Added aria-label="Send message" to send button | fixer-5 |
| 2026-03-20 | A11Y-005 | ChatWidget.tsx | Added aria-label="Stop response" to stop streaming button | fixer-5 |
| 2026-03-20 | A11Y-006 | ChatWidget.tsx | Added aria-label="Close chat" to close button | fixer-5 |
| 2026-03-20 | A11Y-007 | ChatWidget.tsx | Added aria-label="Work Insights" to dashboard button | fixer-5 |
| 2026-03-20 | A11Y-008 | ChatWidget.tsx | Added dynamic aria-label and role="status" to sync status button | fixer-5 |
| 2026-03-20 | A11Y-009 | ChatWidget.tsx | Added role="log", aria-live="polite", aria-label to messages container | fixer-5 |
| 2026-03-20 | A11Y-010 | ChatWidget.tsx | Added focus trap to keep Tab cycling within chat widget | fixer-5 |
| 2026-03-20 | A11Y-011 | VoiceMode.tsx | Added focus trap to keep Tab cycling within voice mode | fixer-5 |
| 2026-03-20 | A11Y-012 | VoiceMode.tsx | Added aria-label="Close voice mode" to close button | fixer-5 |
| 2026-03-20 | A11Y-013 | VoiceMode.tsx | Added aria-label="Start recording" to microphone button | fixer-5 |
| 2026-03-20 | A11Y-014 | VoiceMode.tsx | Added role="status" and aria-live="assertive" to status text | fixer-5 |
| 2026-03-20 | COPY-001 | ChatWidget.tsx | Replaced generic "I'm here to help!" fallback with descriptive empty-response message | fixer-5 |
| 2026-03-20 | COPY-002 / LINK-014 | ChatWidget.tsx | Differentiated error messages by type: auth, rate limit, server, network, unknown | fixer-5 |
| 2026-03-20 | COPY-003 | ChatWidget.tsx | Action feedback now shows action type name instead of generic "Action completed/failed" | fixer-5 |
| 2026-03-20 | COPY-008 | VoiceMode.tsx | Mapped Web Speech API error codes to human-readable messages with recovery guidance | fixer-5 |
| 2026-03-20 | COPY-009 / COPY-031 | VoiceMode.tsx | Differentiated voice processing errors by type: auth, rate limit, server, network | fixer-5 |
| 2026-03-20 | COPY-010 | VoiceMode.tsx | Replaced "Speech recognition not supported" with user-friendly message suggesting chat | fixer-5 |
| 2026-03-20 | LINK-010 | VoiceMode.tsx | Replaced base64 audio playback with browser speechSynthesis for TTS output | fixer-5 |
| 2026-03-20 | A11Y-014 | VoiceMode.tsx | Added aria-label="Cancel voice interaction" to cancel button | fixer-5 |
| 2026-03-20 | TEST-031 | src/preload/index.ts | Changed moveWindow from ipcRenderer.invoke() to ipcRenderer.send() to match ipcMain.on() handler; updated type from Promise to void | claude-agent |
| 2026-03-20 | LINK-001 | dist/ (rebuilt) | Rebuilt main process via tsc; compiled JS now includes all IPC channels and uses send() for WINDOW_MOVE | claude-agent |
| 2026-03-20 | DB-002 | database.ts | Migration 016: Added index on completed_actions(matched_commitment_id) | db-fixer |
| 2026-03-20 | SEC-006 | notchBridge.ts | Added URL validation to open_external handler: only https/http protocols allowed, URL format validated | fixer-7 |
| 2026-03-20 | SEC-019 | notchBridge.ts | Added codesign --verify integrity check before spawning SYNCWidget binary in production | fixer-7 |
| 2026-03-20 | SEC-016 | ocrService.ts | Fixed TOCTOU: script written with mode 0o600, SHA-256 hash verified before each execution, auto-rewrite on mismatch | fixer-7 |
| 2026-03-20 | SEC-018 | ocrService.ts | Added sanitizeForAppleScript() to escape backslashes/quotes in imagePath before AppleScript interpolation | fixer-7 |
| 2026-03-20 | SEC-017 | screenCapture.ts | Added documentation confirming AppleScript is fully static with no user input interpolated | fixer-7 |
| 2026-03-20 | SEC-020/SEC-030 | pairing.ts | Added machine-specific SHA-256 encryption key to electron-store fallback instance | fixer-7 |
| 2026-03-20 | SEC-029 | package.json | Moved signing identity to env var ${env.APPLE_SIGNING_IDENTITY}; documented in .env.example | fixer-7 |
| 2026-03-20 | SEC-011 | notchBridge.ts | Marked ACCEPTED RISK — stdin pipe not interceptable without root; token short-lived; binary verified in prod | fixer-7 |
| 2026-03-20 | SEC-021/SEC-022 | actionService.ts | Marked ACCEPTED RISK — standard Supabase Realtime pattern, WSS encrypted, local process | fixer-7 |
| 2026-03-20 | SEC-024 | deepContextManager.ts | Marked ACCEPTED RISK — OCR text follows same storage as activity data; sensitive apps excluded; SQLCipher future | fixer-7 |
| 2026-03-20 | SEC-025 | cloudSyncService.ts | Marked ACCEPTED RISK — core product functionality; authenticated HTTPS; user opts in by installation | fixer-7 |
| 2026-03-20 | SEC-001 | .env | Marked ACCEPTED RISK — gitignored, developer-machine only | fixer-7 |
| 2026-03-20 | SEC-002 | constants.ts | Marked ACCEPTED RISK — anon keys are public by design (RLS enforced); duplication partially resolved by fixer-4 | fixer-7 |
| 2026-03-20 | SEC-008 | database.ts | Marked ACCEPTED RISK — SQLCipher requires replacing native module; FileVault provides disk encryption | fixer-7 |
| 2026-03-20 | SEC-009 | sqliteQueue.ts | Marked ACCEPTED RISK — same as SEC-008; events are transient | fixer-7 |
| 2026-03-20 | SEC-012 | floatingWidget.ts | Marked ACCEPTED RISK — sandbox:false required for preload IPC; mitigated by contextIsolation+CSP | fixer-7 |
| 2026-03-20 | SEC-014 | handlers.ts | Marked ACCEPTED RISK — settings are user preferences with no security-critical fields | fixer-7 |
| 2026-03-20 | SEC-015 | handlers.ts | Marked ACCEPTED RISK — 8-char preview of 64-char key leaves 224 bits entropy | fixer-7 |
| 2026-03-20 | SEC-023 | floatingWidget.ts | Marked ACCEPTED RISK — DevTools only opens when VITE_DEV_SERVER_URL set (dev workflow only) | fixer-7 |
| 2026-03-20 | SEC-026 | floatingWidget.ts | Marked RESOLVED — fixer-2 added getPreloadPath() with fs.existsSync verification | fixer-7 |
| 2026-03-20 | SEC-028 | activityTracker.ts | Marked ACCEPTED RISK — hardcoded module path, CJS-to-ESM workaround, no user input | fixer-7 |
| 2026-03-20 | SEC-007 | .env.example | Marked RESOLVED — .env.example created by fixer-4 | fixer-7 |
| 2026-03-20 | DB-003 | database.ts | Migration 016: Added indexes on source_capture_id FK columns (email_contexts, calendar_contexts, action_items, commitments) | db-fixer |
| 2026-03-20 | DB-007 | database.ts | Migration 017: Added synced INTEGER DEFAULT 0 column to action_items | db-fixer |
| 2026-03-20 | DB-008 | database.ts | Migration 017: Added synced INTEGER DEFAULT 0 columns to email_contexts and calendar_contexts | db-fixer |
| 2026-03-20 | DB-012 | database.ts | Migration 018: Deduplicated entity_intent_map rows + added UNIQUE index on (entity_id, intent_id) | db-fixer |
| 2026-03-20 | DB-013 | database.ts | Migration 018: Deduplicated intent_sequences rows + added UNIQUE index on (intent_id, activity_id) | db-fixer |
| 2026-03-20 | DB-004 | database-findings.md | Marked ACCEPTED RISK — app_breakdown intentionally removed, code no longer uses it | db-fixer |
| 2026-03-20 | DB-005 | database-findings.md | Marked ACCEPTED RISK — chat_sessions kept for future local chat persistence | db-fixer |
| 2026-03-20 | DB-011 | database-findings.md | Marked ACCEPTED RISK — SQLite type affinity handles TEXT-vs-INTEGER correctly | db-fixer |
| 2026-03-20 | DB-015 | database-findings.md | Marked ACCEPTED RISK — standard SQLite TEXT-as-JSON pattern | db-fixer |
| 2026-03-20 | DB-016 | database-findings.md | Marked ACCEPTED RISK — cosmetic naming inconsistency, renaming not worth data loss risk | db-fixer |
| 2026-03-20 | DB-018 | database-findings.md | Marked ACCEPTED RISK — DEFAULT 0 works correctly for omitted synced column | db-fixer |
| 2026-03-20 | DB-019 | database-findings.md | Marked ACCEPTED RISK — NULL columns expected when OCR pipeline is disabled | db-fixer |
| 2026-03-20 | DB-020 | database-findings.md | Marked ACCEPTED RISK — partial indexes on synced=0 already sufficient | db-fixer |
| 2026-03-20 | DB-021 | database-findings.md | Marked ACCEPTED RISK — kept for future activity sync enablement | db-fixer |
| 2026-03-20 | DB-023 | database-findings.md | Marked ACCEPTED RISK — migration system uses full names, renaming would break existing DBs | db-fixer |
| 2026-03-20 | DB-024 | database-findings.md | Marked ACCEPTED RISK — SQLite type affinity handles joins correctly | db-fixer |
| 2026-03-20 | DB-025 | database-findings.md | Marked ACCEPTED RISK — empty table kept for future activity transition tracking | db-fixer |
| 2026-03-20 | INF-001 | infra-findings.md | Marked ACCEPTED RISK — .env is gitignored, key documented in .env.example | infra-fixer |
| 2026-03-20 | INF-004 | infra-findings.md | Marked RESOLVED — already fixed by fixer-2 (SEC-003, machine-specific SHA-256 key) | infra-fixer |
| 2026-03-20 | INF-005 | Transport.ts | Replaced hardcoded clientVersion '1.0.0' with import of APP_VERSION from shared/constants | infra-fixer |
| 2026-03-20 | INF-006 | shared/constants.ts, semanticAnalyzer.ts | Moved TOGETHER_API_URL and TOGETHER_MODEL to shared/constants.ts; semanticAnalyzer imports from there | infra-fixer |
| 2026-03-20 | INF-008 | tsconfig.main.json | Added src/transport/**/* and src/pairing/**/* to includes | infra-fixer |
| 2026-03-20 | INF-009 | healthCheck.ts (new), contextManager.ts, scheduler.ts, summaryService.ts, autoUpdater.ts | Created health check service with registerHealthProvider pattern; 4 services register providers; IPC HEALTH_CHECK channel added | infra-fixer |
| 2026-03-20 | INF-010 | healthCheck.ts | Added validateStartupConfig() that warns at startup if TOGETHER_API_KEY missing | infra-fixer |
| 2026-03-20 | INF-011 | shared/constants.ts, autoUpdater.ts, deepContextManager.ts, semanticAnalyzer.ts, scheduler.ts | Extracted all magic timing numbers to named constants in shared/constants.ts; all services import from there | infra-fixer |
| 2026-03-20 | INF-012 | infra-findings.md | Marked DEFERRED — renderer components owned by other agent | infra-fixer |
| 2026-03-20 | INF-013 | healthCheck.ts | validateStartupConfig() warns at startup when TOGETHER_API_KEY is missing or malformed | infra-fixer |
| 2026-03-20 | INF-014 | package.json, electron-builder.yml | Removed duplicate build key from package.json; merged identity+artifactName into electron-builder.yml | infra-fixer |
| 2026-03-20 | INF-015 | infra-findings.md | Marked ACCEPTED RISK — CSP correct for current architecture; fixer-2 added production CSP | infra-fixer |
| 2026-03-20 | INF-017 | scripts/notarize.js | Replaced hardcoded appBundleId with context.packager.appInfo.id from electron-builder config | infra-fixer |
| 2026-03-20 | INF-018 | screenCapture.ts | Removed 9 duplicate entries from DEEP_CONTEXT_EXCLUDED_APPS already present in SENSITIVE_APP_PATTERNS | infra-fixer |
| 2026-03-20 | COPY-004/LINK-004 | systemTray.ts | Fixed tray icon path: uses process.resourcesPath for packaged builds, __dirname for dev; added diagnostic logging | fixer-final |
| 2026-03-20 | COPY-006 | systemTray.ts | Improved tray tooltips: "Running", "Syncing your data...", "Sync issue, check your connection" | fixer-final |
| 2026-03-20 | COPY-007/COPY-025 | systemTray.ts | Translated raw sync errors to user-friendly messages; title "SYNC Cloud Sync Failed" | fixer-final |
| 2026-03-20 | COPY-026 | systemTray.ts | Renamed "Start Voice" to "Start Voice Mode" | fixer-final |
| 2026-03-20 | LINK-006 | systemTray.ts | Changed Settings link from /settings (404) to /Integrations (valid route) | fixer-final |
| 2026-03-20 | COPY-023/COPY-024/LINK-013 | permissions.ts | Removed emoji from native dialogs; renamed "System Preferences" to "System Settings" in all button labels | fixer-final |
| 2026-03-20 | COPY-011 | LoginScreen.tsx | Replaced "An unexpected error occurred" with actionable guidance | fixer-final |
| 2026-03-20 | COPY-012 | LoginScreen.tsx | Replaced "Failed to open login page" with browser-check guidance | fixer-final |
| 2026-03-20 | COPY-013 | LoginScreen.tsx | Replaced "Authentication failed. Please try again." with connection-check guidance | fixer-final |
| 2026-03-20 | COPY-020 | LoginScreen.tsx, ChatWidget.tsx | Standardized brand: "AI companion" -> "AI assistant", "AI Orchestrator" -> "AI Assistant" | fixer-final |
| 2026-03-20 | A11Y-036 | LoginScreen.tsx, VoiceMode.tsx | Wrapped error messages in aria-live="assertive" regions with role="alert" | fixer-final |
| 2026-03-20 | A11Y-018/A11Y-019 | ChatWidget.tsx, SemanticDashboard.tsx | Improved contrast: text-zinc-500 -> text-zinc-400, text-zinc-600 -> text-zinc-500/text-zinc-400 | fixer-final |
| 2026-03-20 | A11Y-021 | ChatWidget.tsx | Improved login banner text contrast: text-white/50 -> text-white/70 | fixer-final |
| 2026-03-20 | A11Y-023 | ChatWidget.tsx, SemanticDashboard.tsx | Fixed heading hierarchy: h3->h1, h4->h2 to follow h1->h2 order | fixer-final |
| 2026-03-20 | A11Y-022 | ChatWidget.tsx | Added skip-to-content link ("Skip to message input") for keyboard users | fixer-final |
| 2026-03-20 | A11Y-027 | ChatWidget.tsx | Added focus-visible ring to "View in app" action button | fixer-final |
| 2026-03-20 | COPY-021/COPY-022 | ChatWidget.tsx | Changed placeholder from "Ask SYNC anything..." to "Ask about invoices, products, prospects..." | fixer-final |
| 2026-03-20 | COPY-018 | SemanticDashboard.tsx | Added explanatory text to empty threads state | fixer-final |
| 2026-03-20 | COPY-030 | SemanticDashboard.tsx | Added guidance text to "No active thread detected" empty state | fixer-final |
| 2026-03-20 | A11Y-037 | SemanticDashboard.tsx | Added role="meter" with aria-label/valuenow/min/max to activity distribution bars | fixer-final |
| 2026-03-20 | COPY-028 | VoiceMode.tsx | Differentiated hint text: "Thinking..." for processing, "Responding..." for speaking | fixer-final |
| 2026-03-20 | COPY-029 | UpdateBanner.tsx | Improved update messages: "SYNC Desktop vX — update available", "vX ready to install" | fixer-final |
| 2026-03-20 | COPY-027 | App.tsx | Already resolved by fixer-6 (sr-only "Loading..." text + role="status") | fixer-final |
| 2026-03-20 | COPY-005 | systemTray.ts | Marked ACCEPTED — icon differentiation requires shipping multiple assets; tooltips now convey status | fixer-final |
| 2026-03-20 | A11Y-017 | a11y-findings.md | Marked ACCEPTED — SyncAvatarMini is decorative; status conveyed by text/ARIA on parent components | fixer-final |
| 2026-03-20 | A11Y-038 | a11y-findings.md | Marked ACCEPTED — buttons use no-drag class; removing drag region would break window dragging | fixer-final |
| 2026-03-20 | LINK-003 | links-findings.md | Marked ACCEPTED — informational; CSP correct for current architecture | fixer-final |
| 2026-03-20 | LINK-008 | links-findings.md | Marked ACCEPTED — low-risk duplication; recommend refactoring to shared auth module | fixer-final |
| 2026-03-20 | LINK-009 | links-findings.md | Marked RESOLVED — partially fixed by fixer-4 | fixer-final |
| 2026-03-20 | LINK-011 | links-findings.md | Marked ACCEPTED — standard Vite behavior, build output is correct | fixer-final |
| 2026-03-20 | LINK-012 | links-findings.md | Marked ACCEPTED — dead code, never called | fixer-final |
