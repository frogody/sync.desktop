# SYNC Desktop — Master Audit Report
**Date:** 2026-03-20
**Scope:** Full codebase audit across 8 domains
**Phase:** 1 (Spotter) — All findings catalogued, no fixes applied yet

---

## Executive Summary

| Audit | Findings | Critical | High | Medium | Low |
|-------|----------|----------|------|--------|-----|
| Security | 30 | 1 | 8 | 10 | 11 |
| Infrastructure & Config | 18 | 0 | 4 | 8 | 6 |
| Database Schema | 25 | 1 | 2 | 5 | 17 |
| Dependencies | 17 | 1 | 1 | 4 | 7+ |
| Test Coverage | 31 | 5 | 10 | 10 | 3 |
| Accessibility (WCAG) | 38 | 3 | 14 | 14 | 7 |
| Content & Copy | 32 | 0 | 6 | 16 | 10 |
| Links & Navigation | 14 | 1 | 3 | 5 | 5 |
| **TOTAL** | **205** | **12** | **48** | **72** | **66+** |

---

## Critical Findings (Fix Immediately)

### SEC-003: Hardcoded encryption key in store.ts
- **File:** `src/main/store.ts`
- **Issue:** Encryption key `'sync-desktop-encryption-key-v1'` is hardcoded in source. Anyone with source code can decrypt stored auth tokens and user data.
- **Impact:** Full compromise of stored credentials

### DB-022: SQLite foreign keys not enabled
- **File:** `src/main/db/database.ts`
- **Issue:** `PRAGMA foreign_keys = ON` is never called. All foreign key constraints are decorative — referential integrity is not enforced.
- **Impact:** Orphaned records, data corruption, silent integrity violations

### DEP-3: Electron 34 is 7 major versions behind (41.x)
- **File:** `package.json`
- **Issue:** Electron 34.5.8 is past EOL. No Chromium or Node.js security patches.
- **Impact:** Unpatched browser engine vulnerabilities in every user's desktop

### A11Y-001/002: FloatingAvatar completely inaccessible
- **File:** `src/renderer/components/FloatingAvatar.tsx`
- **Issue:** No accessible label, no ARIA role, no keyboard support. The primary entry point to the app is invisible to assistive technology.
- **Impact:** App is unusable for screen reader and keyboard-only users

### A11Y-013: VoiceMode mic button unlabeled
- **File:** `src/renderer/components/VoiceMode.tsx`
- **Issue:** Primary interaction button has no accessible name
- **Impact:** Voice mode unusable for assistive tech users

### LINK-001: Compiled JS preload out of sync with TypeScript
- **File:** `dist/main/preload/index.js` vs `src/preload/index.ts`
- **Issue:** Compiled JS references UPDATE_* IPC channels that don't exist in compiled ipcChannels.js
- **Impact:** Auto-update UI silently broken when running from compiled output

### TEST (5 Critical gaps):
- CloudSyncService — data integrity at stake, no tests
- Database migrations — schema correctness untested
- Database queries (40+ functions) — all data operations untested
- Auth flow — token refresh, deep link validation untested
- ActivityTracker — privacy-sensitive data collection untested

---

## High Severity Findings (Fix Soon)

### Security (8 High)
- **SEC-027:** No Content Security Policy on BrowserWindow — XSS risk
- **SEC-005:** `shell.openExternal()` with unvalidated URLs — arbitrary protocol execution
- **SEC-008:** SQLite database stored unencrypted at predictable path
- **SEC-004:** Raw access token exposed to renderer via IPC
- **SEC-001/002:** Supabase anon key and URL hardcoded in renderer config
- **SEC-006:** No input validation on IPC handlers
- **SEC-007:** Deep link state validation can be bypassed

### Infrastructure (4 High)
- **INF-001:** Together.ai API key in `.env` on disk
- **INF-003:** Supabase credentials duplicated across 6+ files
- **INF-005:** Version mismatch: package.json says 2.2.0, constants.ts says 1.0.0
- **INF-016:** Scheduler ignores user settings for sync interval

### Database (2 High)
- **DB-010:** entity_relationships missing unique constraint — silent duplicates
- **DB-009:** `cleanupOldData()` uses `datetime()` on epoch-ms timestamps — cleanup never runs

### Dependencies (1 High)
- **DEP-1:** keytar 7.9.0 deprecated and unmaintained (4+ years), replace with Electron safeStorage

### Accessibility (14 High)
- Missing labels on all icon-only buttons (send, stop, close, back)
- No aria-live regions for streaming chat or voice state changes
- No focus traps on chat/voice panels
- Color contrast failures (zinc-600 on dark backgrounds)
- Undiscoverable click-count gesture (1/2/3 clicks)
- Missing ARIA tab pattern on dashboard

### Content (6 High)
- Generic error messages in ChatWidget, VoiceMode, tray
- Raw API error codes shown to users
- SCREAMING_SNAKE_CASE activity types in SemanticDashboard

### Links (3 High)
- Tray icon path resolution may fail in production builds
- Preload script path resolution risk
- VoiceMode expects server TTS but it was removed — likely broken

---

## Findings by File (Top Offenders)

| File | Total Findings | Audits Affected |
|------|---------------|-----------------|
| `src/renderer/components/ChatWidget.tsx` | 12+ | Security, A11Y, Content, Links |
| `src/renderer/components/VoiceMode.tsx` | 10+ | Security, A11Y, Content, Links |
| `src/main/db/database.ts` | 8+ | Security, Database, Test, Infra |
| `src/main/store.ts` | 5+ | Security, Infra |
| `src/renderer/components/FloatingAvatar.tsx` | 4 | A11Y (Critical) |
| `src/main/services/cloudSyncService.ts` | 5+ | Security, Test, Database |
| `src/renderer/components/SemanticDashboard.tsx` | 6+ | A11Y, Content |
| `src/main/ipc/handlers.ts` | 5+ | Security, Test, Links |
| `src/preload/index.ts` | 4+ | Security, Links, Test |
| `src/renderer/config.ts` | 3+ | Security, Infra |

---

## Recommended Fix Order

### Phase A — Immediate (Security + Data Integrity)
1. Enable `PRAGMA foreign_keys = ON` in database init (DB-022)
2. Move encryption key to environment/keychain (SEC-003)
3. Add Content Security Policy to BrowserWindow (SEC-027)
4. Validate URLs in `shell.openExternal()` (SEC-005)
5. Fix `cleanupOldData()` timestamp comparison (DB-009)
6. Fix compiled JS preload sync issue (LINK-001)

### Phase B — Short-term (Auth + Config)
7. Add IPC input validation (SEC-006)
8. Stop exposing raw access token to renderer (SEC-004)
9. Create `.env.example` with all required vars (INF-002)
10. Fix version mismatch across files (INF-005)
11. Fix scheduler to respect user settings (INF-016)
12. Consolidate Supabase credentials to single source (INF-003)
13. Add unique constraints to entity_relationships (DB-010)
14. Fix VoiceMode to use browser speechSynthesis (LINK-010)

### Phase C — Accessibility Quick Wins
15. Add aria-labels to all icon-only buttons (14 findings)
16. Add keyboard support to FloatingAvatar (A11Y-002)
17. Add aria-live regions for streaming content (A11Y)
18. Add focus traps to chat/voice panels (A11Y)

### Phase D — Content Polish
19. Replace generic error messages with specific guidance
20. Format SCREAMING_SNAKE_CASE for display
21. Remove developer jargon from user-facing UI

### Phase E — Dependency Updates (Separate Branch)
22. Plan Electron 34→41 upgrade path
23. Replace keytar with Electron safeStorage
24. Update electron-store, React, Vite

### Phase F — Test Coverage (Ongoing)
25. Test database queries (40+ pure functions)
26. Test database migrations
27. Test CloudSyncService
28. Test auth flow
29. Test ActivityTracker privacy functions

---

## Detailed Findings

See individual audit files:
- [Security](./security-findings.md) — 30 findings
- [Infrastructure](./infra-findings.md) — 18 findings
- [Database](./database-findings.md) — 25 findings
- [Dependencies](./dependency-findings.md) — 17 findings
- [Test Coverage](./test-findings.md) — 31 findings
- [Accessibility](./a11y-findings.md) — 38 findings
- [Content & Copy](./content-findings.md) — 32 findings
- [Links & Navigation](./links-findings.md) — 14 findings
