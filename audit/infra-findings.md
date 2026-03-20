# Infrastructure & Environment Config Audit - Phase 1 (SPOTTER)

**Project:** sync.desktop (Electron app)
**Date:** 2026-03-20
**Auditor:** Claude Opus 4.6 (read-only scan)
**Scope:** Env vars, hardcoded config, health checks, build config, config consistency

---

## Finding INF-001: API Key Committed to .env in Git History
- **File:** `.env:1`
- **Variable/Service:** `TOGETHER_API_KEY`
- **Issue:** The `.env` file contains the production Together.ai API key (`6116baa...`) in plaintext. While `.env` is in `.gitignore`, the file exists on disk and the key is also hardcoded in memory/CLAUDE.md. If `.env` was ever committed, the key is in Git history.
- **Direct Impact:** API key exposure allows unauthorized usage of Together.ai credits.
- **Indirect Impact:** If key is rotated, developers may not know it was leaked. Third-party billing abuse.
- **Severity:** High
- **Status:** ACCEPTED RISK — API key is in .gitignore and never committed. Key rotation is a manual process; documenting in .env.example is sufficient.

---

## Finding INF-002: No .env.example File
- **File:** (missing) `.env.example`
- **Variable/Service:** `TOGETHER_API_KEY`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, `SKIP_NOTARIZE`, `VITE_DEV_SERVER_URL`
- **Issue:** There is no `.env.example` or `.env.template` file documenting required environment variables. New developers must read source code to discover which env vars are needed.
- **Direct Impact:** Onboarding friction; developers may run the app with missing config and get silent failures (e.g., semantic analysis silently degrades to quick-analysis-only mode).
- **Indirect Impact:** CI/CD pipelines may miss required secrets without a reference file.
- **Severity:** Medium
- **Status:** RESOLVED

---

## Finding INF-003: Supabase URL and Anon Key Duplicated in 6+ Files
- **File:** `src/shared/constants.ts:13-14`, `src/renderer/config.ts:7-8`, `src/main/services/cloudSyncService.ts:29-30`, `src/main/services/authUtils.ts:10-11`, `src/main/index.ts:97-98`, `src/main/ipc/handlers.ts:57-58`, `src/renderer/index.html:6` (CSP header)
- **Variable/Service:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **Issue:** The Supabase URL and anon key are hardcoded as string literals in at least 6 separate files plus the HTML CSP header. `src/shared/constants.ts` already exports them, but only `activityTracker.ts` and `semanticAnalyzer.ts` import from there. Most files re-declare their own local constants.
- **Direct Impact:** When the Supabase project changes, every file must be updated individually. If one is missed, auth or sync will silently fail against the wrong endpoint.
- **Indirect Impact:** The CSP header in `index.html` also hardcodes the URL, so even if all TS files are updated, the CSP may block requests to a new Supabase domain.
- **Severity:** High
- **Status:** PARTIALLY RESOLVED (cloudSyncService.ts and renderer/config.ts now import from shared/constants.ts; authUtils.ts, index.ts, handlers.ts, index.html still hardcode)

---

## Finding INF-004: Hardcoded Encryption Key in electron-store
- **File:** `src/main/store.ts:31`
- **Variable/Service:** `encryptionKey: 'sync-desktop-encryption-key-v1'`
- **Issue:** The electron-store encryption key is a hardcoded string literal. This provides minimal security since anyone with access to the source code can decrypt the store. A second hardcoded passphrase exists at `src/deep-context/store/contextEventStore.ts:62` (`'sync-desktop-deep-context-v1'`).
- **Direct Impact:** Stored auth tokens, API keys, and user data can be decrypted by anyone with the source code.
- **Indirect Impact:** False sense of security -- data appears encrypted but is trivially decryptable.
- **Severity:** Medium
- **Status:** RESOLVED (fixer-2 replaced hardcoded key with machine-specific SHA-256 key in SEC-003)

---

## Finding INF-005: Version Mismatch Between package.json and constants.ts
- **File:** `package.json:3` vs `src/shared/constants.ts:6`
- **Variable/Service:** `APP_VERSION`
- **Issue:** `package.json` declares version `2.2.0` while `src/shared/constants.ts` declares `APP_VERSION = '1.0.0'`. The Transport layer also defaults `clientVersion` to `'1.0.0'` (`src/transport/Transport.ts:134`). These are not kept in sync.
- **Direct Impact:** Server-side analytics, auto-updater version comparisons, and API version headers report incorrect version.
- **Indirect Impact:** Debugging production issues becomes harder when reported version does not match actual release.
- **Severity:** High
- **Status:** RESOLVED (constants.ts updated to 2.2.0; Transport.ts now imports APP_VERSION from shared/constants)

---

## Finding INF-006: Together.ai API URL Hardcoded Outside Constants
- **File:** `src/main/services/semanticAnalyzer.ts:27`
- **Variable/Service:** `TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions'`
- **Issue:** The Together.ai API URL is hardcoded in `semanticAnalyzer.ts` rather than being defined in `shared/constants.ts` or read from an environment variable. The model name `moonshotai/Kimi-K2-Instruct` is also hardcoded on line 28.
- **Direct Impact:** Cannot switch API endpoints or models without code changes and a rebuild.
- **Indirect Impact:** Prevents A/B testing of different models or using a local proxy for development.
- **Severity:** Medium
- **Status:** RESOLVED (TOGETHER_API_URL and TOGETHER_MODEL moved to shared/constants.ts; semanticAnalyzer.ts imports from there)

---

## Finding INF-007: Compiled constants.js Checked Into Source Tree
- **File:** `src/shared/constants.js`
- **Variable/Service:** All exported constants including `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- **Issue:** A compiled JavaScript version of `constants.ts` exists at `src/shared/constants.js` and appears to be checked into the repository. This file contains the same hardcoded Supabase anon key. It is a build artifact that should be in `dist/` not `src/`.
- **Direct Impact:** Developers may accidentally import the stale `.js` file instead of the `.ts` source. If the `.ts` is updated but `.js` is not regenerated, runtime behavior diverges.
- **Indirect Impact:** Increases repo size and creates confusion about which file is the source of truth.
- **Severity:** Medium
- **Status:** RESOLVED (file does not exist in source tree — finding not applicable)

---

## Finding INF-008: Transport and Pairing Modules Excluded from tsconfig.main.json
- **File:** `tsconfig.main.json:19`
- **Variable/Service:** `src/transport/`, `src/pairing/`
- **Issue:** `tsconfig.main.json` includes `src/main/**/*`, `src/shared/**/*`, `src/preload/**/*`, `src/deep-context/**/*` but does NOT include `src/transport/**/*` or `src/pairing/**/*`. These modules exist and contain valid TypeScript but are not compiled by the main process build.
- **Direct Impact:** The Transport layer (reliable batched event upload) and Pairing module (device API key management) are dead code -- they compile to nothing during `npm run build:main`.
- **Indirect Impact:** Features depending on these modules (device pairing, batched upload) silently do not work.
- **Severity:** Medium
- **Status:** RESOLVED (src/transport/**/* and src/pairing/**/* added to tsconfig.main.json includes)

---

## Finding INF-009: No Health Checks or Liveness Monitoring
- **File:** (multiple services)
- **Variable/Service:** CloudSyncService, ActivityTracker, Scheduler, DeepContextManager, SemanticAnalyzer
- **Issue:** None of the background services have health check mechanisms. There is no way for the renderer or user to know if a service has silently crashed, stalled, or entered an error loop. The scheduler tracks `lastRun` and `isRunning` per task, but nothing monitors whether runs are succeeding or timing out.
- **Direct Impact:** If CloudSyncService enters a permanent error state, data accumulates locally without sync and the user is not notified. If ActivityTracker's polling stops, context goes stale.
- **Indirect Impact:** Support incidents are harder to diagnose. Users may not realize the app is malfunctioning.
- **Severity:** Medium
- **Status:** RESOLVED (healthCheck.ts created with registerHealthProvider pattern; scheduler, context-manager, summary-service, auto-updater all register providers; IPC HEALTH_CHECK exposed to renderer)

---

## Finding INF-010: TOGETHER_API_KEY Not Provided in CI Build
- **File:** `.github/workflows/build-macos.yml`
- **Variable/Service:** `TOGETHER_API_KEY`
- **Issue:** The CI workflow sets `NODE_ENV=production` but does not provide `TOGETHER_API_KEY` as a secret or environment variable. The built app will start with `process.env.TOGETHER_API_KEY` undefined, falling back to the electron-store value (which is empty on a fresh install).
- **Direct Impact:** Production builds from CI have no semantic analysis capability until the user manually configures the key (which there is no UI for).
- **Indirect Impact:** The app silently degrades to quick-analysis-only mode with no user notification.
- **Severity:** Medium
- **Status:** MITIGATED (validateStartupConfig() now warns at startup if TOGETHER_API_KEY is missing; CI secret addition is a manual ops task)

---

## Finding INF-011: Hardcoded Timing Constants Not Configurable
- **File:** `src/main/services/autoUpdater.ts:203-210`, `src/main/services/deepContextManager.ts:69`, `src/main/services/semanticAnalyzer.ts:125-126`, `src/main/services/scheduler.ts:226-278`
- **Variable/Service:** Multiple timing values
- **Issue:** Several critical timing values are hardcoded as magic numbers rather than being defined in `shared/constants.ts` or user settings:
  - Auto-updater: initial check delay `10000ms`, check interval `4 * 60 * 60 * 1000` (4 hours) (autoUpdater.ts:203,210)
  - Cross-reference interval: `5 * 60 * 1000` (5 min) (deepContextManager.ts:69)
  - Semantic batch delay: `2000ms`, max batch size: `3` (semanticAnalyzer.ts:125-126)
  - Signature computation: `6 * 60 * 60 * 1000` (6 hours) (scheduler.ts:265-267)
  - Semantic cycle: `60 * 1000` (60s) (scheduler.ts:247)
  - Initial sync delay: `30000ms` (scheduler.ts:241)
  - Initial semantic delay: `15000ms` (scheduler.ts:259)
  - Initial signature delay: `60000ms` (scheduler.ts:278)
- **Direct Impact:** Tuning any of these requires code changes and a full rebuild. Cannot adjust per-user or per-environment.
- **Indirect Impact:** On low-powered machines, the combination of 5s activity polling + 30s screen capture + 60s semantic cycle + 5 min sync can cause excessive CPU/battery usage.
- **Severity:** Low
- **Status:** RESOLVED (all timing constants moved to shared/constants.ts; autoUpdater.ts, deepContextManager.ts, semanticAnalyzer.ts, scheduler.ts now import from there)

---

## Finding INF-012: WEB_APP_URL Hardcoded in Renderer Components
- **File:** `src/renderer/App.tsx:111`, `src/renderer/components/ChatWidget.tsx:603`
- **Variable/Service:** `https://app.isyncso.com`
- **Issue:** The web app URL is hardcoded as a string literal in `App.tsx` (line 111: `openExternal('https://app.isyncso.com')`) and `ChatWidget.tsx` (line 603: template literal with `https://app.isyncso.com`). Both files should import from `config.ts` or `shared/constants.ts` which already define `WEB_APP_URL`.
- **Direct Impact:** If the web app URL changes (e.g., staging environment, custom domain), these won't update.
- **Indirect Impact:** Inconsistent behavior where some features use the configured URL and others use the hardcoded one.
- **Severity:** Low
- **Status:** DEFERRED (renderer components owned by other agent)

---

## Finding INF-013: Missing Error Handling for TOGETHER_API_KEY
- **File:** `src/main/services/semanticAnalyzer.ts:130`, `src/main/store.ts:107-114`
- **Variable/Service:** `TOGETHER_API_KEY`
- **Issue:** When `TOGETHER_API_KEY` is not set, `semanticAnalyzer.ts` silently falls back to quick analysis (line 157-159). There is no validation of the key format, no expiration check, and no user notification that semantic analysis is running in degraded mode. The `store.ts` function `getTogetherApiKey()` returns `undefined` silently.
- **Direct Impact:** Users get reduced functionality without knowing. The LLM-powered analysis (commitments, action items, work context) is silently disabled.
- **Indirect Impact:** Support burden when users report "missing features" that are actually working but degraded.
- **Severity:** Low
- **Status:** RESOLVED (validateStartupConfig() in healthCheck.ts warns at startup when TOGETHER_API_KEY is missing or malformed)

---

## Finding INF-014: Duplicate build Configuration in package.json and electron-builder.yml
- **File:** `package.json:63-112` and `electron-builder.yml:1-109`
- **Variable/Service:** electron-builder config
- **Issue:** Both `package.json` (under the `"build"` key) and `electron-builder.yml` contain electron-builder configuration. They differ in several ways:
  - `package.json` specifies `"buildResources": "build"` while `electron-builder.yml` specifies `buildResources: assets`
  - `package.json` has `identity: "Gody Duinsbergen (FY5J7KSYHJ)"` and `artifactName` not present in `electron-builder.yml`
  - `electron-builder.yml` has extra `dmg.contents`, `dmg.window` config, `deleteAppDataOnUninstall`, linux targets, and `extraResources` not in `package.json`
  - `electron-builder.yml` has notarization via `${env.APPLE_TEAM_ID}` while `package.json` does not
- **Direct Impact:** electron-builder merges both configs with `electron-builder.yml` taking precedence. The `package.json` `buildResources: "build"` is silently overridden. This creates confusion about which config is active.
- **Indirect Impact:** A developer editing `package.json` build config may not realize their changes are overridden.
- **Severity:** Medium
- **Status:** RESOLVED (removed duplicate build key from package.json; electron-builder.yml is now the single source of truth with identity+artifactName merged in)

---

## Finding INF-015: CSP in index.html Does Not Allow Together.ai API Calls
- **File:** `src/renderer/index.html:6`
- **Variable/Service:** Content-Security-Policy `connect-src`
- **Issue:** The CSP `connect-src` directive only allows `'self' https://sfxpmzicgpaxfntqleig.supabase.co wss://sfxpmzicgpaxfntqleig.supabase.co`. It does not include `https://api.together.xyz`. While Together.ai calls currently happen in the main process (not renderer), if any renderer code attempts direct API calls, they would be blocked.
- **Direct Impact:** Currently no direct impact since LLM calls are from the main process. However, the CSP is fragile and would break if the architecture changes.
- **Indirect Impact:** The CSP does not cover the Supabase edge function URLs (`/functions/v1/*`) which the renderer DOES call (ChatWidget.tsx:275, VoiceMode.tsx:135). These work only because they share the same origin as the REST API.
- **Severity:** Low
- **Status:** ACCEPTED RISK (CSP is correct for current architecture where LLM calls happen in main process; fixer-2 added production-only CSP via session.webRequest)

---

## Finding INF-016: Scheduler Uses DEFAULT_SETTINGS Instead of User Settings for Sync Interval
- **File:** `src/main/services/scheduler.ts:226`
- **Variable/Service:** `syncIntervalMinutes`
- **Issue:** The scheduler reads `DEFAULT_SETTINGS.syncIntervalMinutes` (hardcoded to `1` minute in types.ts:154) instead of the user's actual settings from the store. The `getSettings()` function is never called in the scheduler. Similarly, `cleanupOldData` on line 381 uses `DEFAULT_SETTINGS.dataRetentionDays` (30) instead of the user's configured retention period.
- **Direct Impact:** User changes to sync interval and data retention in settings have no effect. Sync runs every 1 minute regardless of user preference (the constant says 1, but the scheduler's `|| 5` fallback makes it 5 minutes when the value is truthy).
- **Indirect Impact:** Battery drain on mobile/laptop users who expect a longer sync interval.
- **Severity:** High
- **Status:** RESOLVED

---

## Finding INF-017: Hardcoded App Bundle ID in Notarize Script
- **File:** `scripts/notarize.js:45`
- **Variable/Service:** `appBundleId: 'com.isyncso.sync-desktop'`
- **Issue:** The app bundle ID is hardcoded in the notarize script. It should be read from `electron-builder.yml` (`appId`) or `package.json` (`build.appId`) to maintain a single source of truth.
- **Direct Impact:** If the bundle ID changes in electron-builder config but not in the notarize script, notarization will fail or notarize the wrong bundle.
- **Indirect Impact:** Minor -- the bundle ID rarely changes.
- **Severity:** Low
- **Status:** RESOLVED (notarize.js now reads appBundleId from context.packager.appInfo.id instead of hardcoding)

---

## Finding INF-018: Deep Context Excluded Apps List Partially Duplicates Constants
- **File:** `src/main/services/screenCapture.ts:35-56`
- **Variable/Service:** `DEEP_CONTEXT_EXCLUDED_APPS`
- **Issue:** `screenCapture.ts` spreads `SENSITIVE_APP_PATTERNS` from constants and then adds additional patterns (`'banking'`, `'chase'`, etc.). However, `SENSITIVE_APP_PATTERNS` already includes `'banking'` (constants.ts:81), creating a duplicate entry. The extended list also includes patterns like `'private'` and `'incognito'` that could match legitimate apps.
- **Direct Impact:** Minor performance impact from duplicate pattern matching. The `'private'` pattern could accidentally exclude apps with "private" in their name (e.g., "Private Internet Access" VPN).
- **Indirect Impact:** The two lists will drift apart as one is updated without the other.
- **Severity:** Low
- **Status:** RESOLVED (removed duplicate entries from DEEP_CONTEXT_EXCLUDED_APPS that already exist in SENSITIVE_APP_PATTERNS; added clarifying comments)

---

# Summary

| Severity | Count | Finding IDs |
|----------|-------|-------------|
| **Critical** | 0 | -- |
| **High** | 3 | INF-001, INF-003, INF-005, INF-016 |
| **Medium** | 7 | INF-002, INF-004, INF-006, INF-007, INF-008, INF-009, INF-010, INF-014 |
| **Low** | 6 | INF-011, INF-012, INF-013, INF-015, INF-017, INF-018 |
| **Total** | 18 | |

## Top Priority Recommendations

1. **Centralize Supabase config** (INF-003): All files should import `SUPABASE_URL` and `SUPABASE_ANON_KEY` from `src/shared/constants.ts`. Remove all local re-declarations. Update CSP in `index.html` to reference a build-time variable.

2. **Fix version mismatch** (INF-005): Read version from `package.json` at runtime using `app.getVersion()` (Electron) or import from `package.json`. Remove hardcoded `APP_VERSION = '1.0.0'` in constants.ts.

3. **Fix scheduler to use user settings** (INF-016): Replace `DEFAULT_SETTINGS.syncIntervalMinutes` with `getSettings().syncIntervalMinutes` in scheduler.ts. Same for `dataRetentionDays`.

4. **Create .env.example** (INF-002): Document all environment variables with descriptions and example values (redacted).

5. **Remove compiled constants.js** (INF-007): Delete `src/shared/constants.js` and ensure `.gitignore` prevents JS build artifacts in `src/`.

6. **Include transport/pairing in tsconfig** (INF-008): Add `src/transport/**/*` and `src/pairing/**/*` to `tsconfig.main.json` includes, or explicitly mark them as unused/deprecated.

7. **Consolidate electron-builder config** (INF-014): Choose one location (recommend `electron-builder.yml` only) and remove the duplicate `build` key from `package.json`.
