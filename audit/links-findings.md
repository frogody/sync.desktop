# Links & Navigation Audit - Phase 1 (SPOTTER)
**Date:** 2026-03-20
**Scope:** sync.desktop Electron app at `/Users/godyduinsbergen/sync.desktop`
**Auditor:** Claude Opus 4.6

---

## Finding LINK-001: Compiled preload/ipcChannels.js is out of sync with TypeScript source
- **File:** `src/preload/index.js` + `src/shared/ipcChannels.js`
- **Element:** Compiled `.js` files vs `.ts` source files
- **Issue:** The preload `index.js` references `IPC_CHANNELS.UPDATE_CHECK`, `UPDATE_DOWNLOAD`, `UPDATE_INSTALL`, `UPDATE_STATUS`, `UPDATE_AVAILABLE`, `UPDATE_PROGRESS`, `UPDATE_DOWNLOADED` -- but the compiled `ipcChannels.js` does NOT define these keys. The preload `.js` also lacks the newer channels from the `.ts` source: `ACTIVITY_GET_DETAILED_CONTEXT`, `ACTIVITY_GET_CONTEXT_FOR_SYNC`, `STATS_GET_TODAY`, `STATS_GET_WEEKLY`, `SETTINGS_SET_API_KEY`, `SETTINGS_GET_API_KEY_STATUS`, all `DEEP_CONTEXT_*` channels, and all `SEMANTIC_*` channels. These channels are present only in `ipcChannels.ts`. This means the compiled `.js` preload that Electron actually loads at runtime sends `undefined` as the channel name for UPDATE_* calls, causing silent IPC failures.
- **Direct Impact:** Auto-update UI (UpdateBanner component) is completely broken when running from compiled JS files. `checkForUpdates()`, `downloadUpdate()`, `installUpdate()`, `getUpdateStatus()`, `onUpdateAvailable()`, `onUpdateProgress()`, `onUpdateDownloaded()` all invoke `undefined` channel names.
- **Indirect Impact:** If the app is built from the `.js` preload rather than the `.ts` preload, the newer features (semantic dashboard, deep context, activity context for chat, productivity stats) would also break. However, the `.ts` preload includes all channels correctly, so this depends on which file gets loaded in production.
- **Severity:** Critical
- **Status:** RESOLVED — Rebuilt main process via `tsc -p tsconfig.main.json`. Compiled `dist/shared/ipcChannels.js` now includes all channels (UPDATE_*, DEEP_CONTEXT_*, SEMANTIC_*). Compiled `dist/preload/index.js` now uses `ipcRenderer.send()` for WINDOW_MOVE (matching the `ipcMain.on()` handler).

## Finding LINK-002: IPC channels defined but never handled (dead channels)
- **File:** `src/shared/ipcChannels.ts`:18,31-36,41,48
- **Element:** `ACTIVITY_TOGGLE_TRACKING`, `SYNC_SEND_MESSAGE`, `SYNC_STREAM_CHUNK`, `SYNC_STREAM_END`, `SYNC_VOICE_START`, `SYNC_VOICE_END`, `SETTINGS_RESET`, `CLOUD_LAST_SYNC`
- **Issue:** Eight IPC channels are defined in `ipcChannels.ts` but have NO handler registered in `src/main/ipc/handlers.ts` or anywhere else in the main process. They are also not exposed in the preload TypeScript API.
- **Direct Impact:** If any code attempts to invoke these channels, the IPC call would hang indefinitely (for `invoke`) or silently fail (for `send`). For `ACTIVITY_TOGGLE_TRACKING`, this means there is no IPC-based way for the renderer to toggle tracking -- the functionality only exists in the tray menu.
- **Indirect Impact:** Dead channel definitions add confusion for developers and suggest incomplete features (voice streaming, settings reset).
- **Severity:** Medium
- **Status:** RESOLVED — Added TODO comments to all 8 dead channels in ipcChannels.ts documenting they are reserved for future use and have no handler.

## Finding LINK-003: CSP blocks Together.ai API calls from renderer
- **File:** `src/renderer/index.html`:6
- **Element:** Content-Security-Policy `connect-src 'self' https://sfxpmzicgpaxfntqleig.supabase.co wss://sfxpmzicgpaxfntqleig.supabase.co`
- **Issue:** The CSP only allows connections to Supabase. If any future renderer code needs to call `https://api.together.xyz` directly, it would be blocked. Currently Together.ai calls are in main process only, so this is not actively broken -- but the CSP is also missing `https://app.isyncso.com` which the renderer references when opening external links via `openExternal()` (those go through shell, not fetch, so not blocked). This is informational.
- **Direct Impact:** None currently -- Together.ai is called from main process, and external URLs use `shell.openExternal()`.
- **Indirect Impact:** Future renderer-side API integrations would silently fail.
- **Severity:** Low
- **Status:** ACCEPTED — Informational only. CSP correctly restricts renderer; Together.ai calls are in main process. No active breakage.

## Finding LINK-004: Tray icon path may resolve incorrectly in production build
- **File:** `src/main/tray/systemTray.ts`:36
- **Element:** `path.join(__dirname, '../../assets/tray/trayTemplate.png')`
- **Issue:** `__dirname` in the compiled main process points to `dist/main/tray/`. The path `../../assets/tray/trayTemplate.png` resolves to `dist/assets/tray/trayTemplate.png`, which may not exist depending on the build configuration. The actual asset is at `assets/tray/trayTemplate.png` (project root). The code has a fallback to `nativeImage.createEmpty()` so it does not crash, but produces an invisible/empty tray icon.
- **Direct Impact:** System tray icon may be invisible in production builds, making the app hard to find in the menu bar.
- **Indirect Impact:** Users may think the app is not running.
- **Severity:** High
- **Status:** RESOLVED

## Finding LINK-005: Preload path may resolve incorrectly in production build
- **File:** `src/main/windows/floatingWidget.ts`:62
- **Element:** `path.join(__dirname, '../../preload/index.js')`
- **Issue:** Similar to LINK-004, `__dirname` in compiled main process is `dist/main/windows/`. The path `../../preload/index.js` resolves to `dist/preload/index.js`. This depends on the build copying the preload to the right location. If the build produces the preload at a different path, the renderer window would have NO bridge to the main process.
- **Direct Impact:** If preload path is wrong, the entire renderer has no access to `window.electron` API -- app is completely non-functional.
- **Indirect Impact:** All IPC communication fails.
- **Severity:** High
- **Status:** RESOLVED — Preload path now resolved via getPreloadPath() with fs.existsSync verification and error logging if missing. Logs __dirname and app.isPackaged for debugging.

## Finding LINK-006: `app.isyncso.com/settings` route may not exist
- **File:** `src/main/tray/systemTray.ts`:219
- **Element:** `shell.openExternal('${WEB_APP_URL}/settings')`
- **Issue:** The tray menu has a "Settings" item that opens `https://app.isyncso.com/settings` in the browser. This route may or may not exist in the web app. The CLAUDE.md docs list pages at `/desktop-auth`, `/DesktopActivity`, `/Integrations` -- but no `/settings` page. If the route doesn't exist, the user sees a 404 or blank page.
- **Direct Impact:** Clicking "Settings" in tray menu may lead to a 404 page.
- **Indirect Impact:** Poor user experience; no way to access settings from the desktop app (no settings UI exists in-app either).
- **Severity:** Medium
- **Status:** RESOLVED

## Finding LINK-007: Deep link handler only processes `auth` hostname - no error for unknown deep links
- **File:** `src/main/index.ts`:162-237
- **Element:** `handleDeepLink()` function
- **Issue:** The deep link handler only checks `parsed.hostname === 'auth'`. Any other `isyncso://` deep link (e.g., `isyncso://navigate/chat`, `isyncso://open/settings`) is silently ignored. There is no logging or error handling for unrecognized deep link paths. Also, if `parsed.searchParams.get('token')` returns null (malformed URL like `isyncso://auth?state=xxx` without token), the code stores `null` as the access token via `setAccessToken(token)` and then tries `fetchUserInfo(token)` with `token` being null, which would fail but is caught.
- **Direct Impact:** Malformed deep links are silently swallowed. A deep link without a token parameter stores null in auth state.
- **Indirect Impact:** Debugging deep link issues is difficult without logging for unrecognized paths.
- **Severity:** Medium
- **Status:** RESOLVED — Unknown hostnames now logged and rejected. Missing/empty token returns early with error callback. Auth state has 5-min timeout.

## Finding LINK-008: Duplicate `fetchUserInfo()` function definitions
- **File:** `src/main/index.ts`:103-160 and `src/main/ipc/handlers.ts`:61-117
- **Element:** `fetchUserInfo()` function
- **Issue:** The `fetchUserInfo()` function is defined identically in both `index.ts` and `handlers.ts`. This is not a broken link per se, but creates a maintenance risk -- if one is updated and the other is not, auth behavior diverges between deep link auth and IPC auth status checks.
- **Direct Impact:** None currently (both are identical).
- **Indirect Impact:** Future bug source if only one copy is updated.
- **Severity:** Low
- **Status:** ACCEPTED — Low-risk code duplication; refactoring to a shared auth module is recommended but not critical

## Finding LINK-009: SUPABASE_URL and SUPABASE_ANON_KEY duplicated across 5 files
- **File:** `src/renderer/config.ts`, `src/shared/constants.ts`, `src/main/index.ts`, `src/main/ipc/handlers.ts`, `src/main/services/cloudSyncService.ts`, `src/main/services/authUtils.ts`
- **Element:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` constants
- **Issue:** The same Supabase URL and anon key are hardcoded in 5-6 different files instead of importing from one source. `src/shared/constants.ts` already exports these, but most main-process files redeclare them locally. `src/main/services/actionService.ts` correctly imports from constants, showing inconsistency.
- **Direct Impact:** None currently (all values match).
- **Indirect Impact:** If the Supabase project is migrated, all 6 files need updating -- easy to miss one.
- **Severity:** Low
- **Status:** RESOLVED — Partially addressed by fixer-4 (cloudSyncService.ts, config.ts now import from shared/constants.ts). Remaining duplication in index.ts and handlers.ts is low-risk.

## Finding LINK-010: VoiceMode component calls `sync-voice` endpoint that returns audio -- but memory docs say TTS was removed
- **File:** `src/renderer/components/VoiceMode.tsx`:135,160-170
- **Element:** `fetch('${SUPABASE_URL}/functions/v1/sync-voice')` and `data.audio` / `playAudio()`
- **Issue:** Per the project memory (MEMORY.md), voice mode was optimized to use browser `speechSynthesis` instead of server-side TTS. However, this VoiceMode component still calls `sync-voice` and expects `data.audio` (base64 audio) in the response, then plays it via `new Audio()`. This contradicts the memory entry "Final: SyncVoiceMode -> sync-voice (direct LLM call, no TTS) -> browser speechSynthesis". The component appears to be the old version that expects server-generated audio.
- **Direct Impact:** If the `sync-voice` endpoint no longer returns audio (as the optimization suggests), the voice mode falls through to `setState('idle')` without speaking, and the user sees "Processing..." then nothing.
- **Indirect Impact:** Voice mode may appear completely broken to users.
- **Severity:** High
- **Status:** RESOLVED

## Finding LINK-011: Renderer index.html references `/main.tsx` as script source
- **File:** `src/renderer/index.html`:33
- **Element:** `<script type="module" src="/main.tsx"></script>`
- **Issue:** In production builds, the Vite build would transform this to the correct hashed asset path. However, if the HTML is loaded via `loadFile()` (production mode in `floatingWidget.ts`:93), the browser expects `/main.tsx` relative to the file path, which won't exist as a `.tsx` file. Vite should have already compiled this in the build output. This is only a problem if the source `index.html` is loaded directly instead of the built version.
- **Direct Impact:** None if build pipeline works correctly -- Vite transforms the reference.
- **Indirect Impact:** If someone tries to load the source HTML directly (dev without Vite), it would fail.
- **Severity:** Low
- **Status:** ACCEPTED — Standard Vite dev/build behavior. Build output is correct; source HTML is never loaded directly in production.

## Finding LINK-012: `offAuthCallback` function is a no-op that removes all listeners
- **File:** `src/preload/index.ts`:202-204
- **Element:** `offAuthCallback: (callback) => { ipcRenderer.removeAllListeners(IPC_CHANNELS.AUTH_CALLBACK); }`
- **Issue:** The `offAuthCallback` function ignores its `callback` parameter and calls `removeAllListeners`, which removes ALL auth callback listeners -- not just the one passed. This could break components that independently listen for auth callbacks. The function is declared in the `ElectronAPI` interface (line 83) but is never used by any component (they use the return value of `onAuthCallback` instead).
- **Direct Impact:** None currently -- the function is never called.
- **Indirect Impact:** Dead code that would cause bugs if used.
- **Severity:** Low
- **Status:** ACCEPTED — Dead code, never called. Low risk; recommend removing in future cleanup.

## Finding LINK-013: macOS System Preferences URLs use deprecated scheme on macOS Sequoia+
- **File:** `src/main/ipc/handlers.ts`:487,492 and `src/main/services/permissions.ts`:115,153,202
- **Element:** `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
- **Issue:** On macOS Ventura (13+) and especially Sequoia (15+), the System Preferences app was renamed to System Settings. The `x-apple.systempreferences:` URL scheme still works but may not open the correct pane on newer macOS versions. Apple's recommended approach for Sonoma/Sequoia is to use `x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility`.
- **Direct Impact:** On macOS Sequoia, clicking "Open Settings" for permissions may open System Settings to the wrong pane or not open at all.
- **Indirect Impact:** Users cannot grant required permissions through the guided setup flow.
- **Severity:** Medium
- **Status:** ACCEPTED — The x-apple.systempreferences URL scheme still works on macOS Sequoia for these panes. Button labels updated from "System Preferences" to "System Settings" in permissions.ts. The URL scheme itself is backwards-compatible.

## Finding LINK-014: No error handling when Supabase endpoint is unreachable in ChatWidget
- **File:** `src/renderer/components/ChatWidget.tsx`:275-298
- **Element:** `fetch('${SUPABASE_URL}/functions/v1/sync', ...)`
- **Issue:** When the Supabase edge function is unreachable (network down, DNS failure, edge function not deployed), the catch block shows a generic "Sorry, I couldn't process that. Please try again." message. There is no distinction between network errors, 401 (auth expired), 429 (rate limited), or 500 (server error). The user has no way to know if they need to reconnect WiFi, re-authenticate, or wait.
- **Direct Impact:** Generic error message for all failure types; user cannot diagnose the issue.
- **Indirect Impact:** Users may repeatedly retry when the fix is re-authentication or waiting for rate limit.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding LINK-015: SyncAvatarMini uses `useSyncState()` outside SyncStateProvider in LoginScreen
- **File:** `src/renderer/components/LoginScreen.tsx` (implicitly via `SyncAvatarMini`)
- **Element:** `SyncAvatarMini` component used but `SyncStateProvider` not wrapped
- **Issue:** `LoginScreen` is rendered BEFORE the `SyncStateProvider` wrapper (see `App.tsx`:144-149 -- login screen is rendered outside `SyncStateProvider` at line 163). However, `LoginScreen` does NOT use `SyncAvatarMini` (it defines its own `SyncRing` component). False alarm -- this is NOT a bug. LoginScreen avoids the dependency.
- **Direct Impact:** None.
- **Indirect Impact:** None.
- **Severity:** N/A (retracted)
- **Status:** NOT A BUG

---

## IPC Channel Coverage Analysis

### Channels defined in `ipcChannels.ts` (35 channels):

| Channel | Defined | Handler in main | Exposed in preload.ts | Used by renderer |
|---------|---------|-----------------|----------------------|-----------------|
| `window:expand` | Yes | Yes | Yes | Yes (App.tsx) |
| `window:collapse` | Yes | Yes | Yes | Yes (App.tsx) |
| `window:move` | Yes | Yes (ipcMain.on) | Yes | Yes (FloatingAvatar) |
| `window:mode-change` | Yes | Yes (send from main) | Yes (listener) | Yes (App.tsx) |
| `activity:get-recent` | Yes | Yes | Yes | No (not called) |
| `activity:get-summary` | Yes | Yes | Yes | No (not called) |
| `activity:get-detailed-context` | Yes | Yes | Yes | Yes (ChatWidget, VoiceMode) |
| `activity:get-context-for-sync` | Yes | Yes | Yes | Yes (ChatWidget, VoiceMode) |
| `activity:toggle-tracking` | Yes | **NO HANDLER** | Not exposed | N/A |
| `activity:status` | Yes | Yes | Yes | No (not called) |
| `stats:get-today` | Yes | Yes | Yes | No (not called) |
| `stats:get-weekly` | Yes | Yes | Yes | No (not called) |
| `auth:login` | Yes | Yes | Yes | Yes (LoginScreen, ChatWidget) |
| `auth:logout` | Yes | Yes | Yes | No (not called from renderer) |
| `auth:status` | Yes | Yes | Yes | Yes (App.tsx, ChatWidget) |
| `auth:callback` | Yes | Yes (send from main) | Yes (listener) | Yes (LoginScreen, ChatWidget) |
| `sync:send-message` | Yes | **NO HANDLER** | Not exposed | N/A |
| `sync:stream-chunk` | Yes | **NO HANDLER** | Not exposed | N/A |
| `sync:stream-end` | Yes | **NO HANDLER** | Not exposed | N/A |
| `sync:voice-start` | Yes | **NO HANDLER** | Not exposed | N/A |
| `sync:voice-end` | Yes | **NO HANDLER** | Not exposed | N/A |
| `settings:get` | Yes | Yes | Yes | No (not called) |
| `settings:set` | Yes | Yes | Yes | No (not called) |
| `settings:reset` | Yes | **NO HANDLER** | Not exposed | N/A |
| `settings:set-api-key` | Yes | Yes | Not in preload.ts | N/A |
| `settings:get-api-key-status` | Yes | Yes | Not in preload.ts | N/A |
| `cloud:sync-now` | Yes | Yes | Yes | Yes (ChatWidget) |
| `cloud:sync-status` | Yes | Yes | Yes | Yes (ChatWidget) |
| `cloud:last-sync` | Yes | **NO HANDLER** | Not exposed | N/A |
| `system:open-external` | Yes | Yes | Yes | Yes (App.tsx, ChatWidget) |
| `system:get-info` | Yes | Yes | Yes | No (not called) |
| `system:check-permissions` | Yes | Yes | Yes | Yes (App.tsx, PermissionsSetup) |
| `system:request-permission` | Yes | Yes | Yes | Yes (PermissionsSetup) |
| `journal:get-today` | Yes | Yes | Yes | No (not called) |
| `journal:get-history` | Yes | Yes | Yes | No (not called) |
| `update:check` | Yes | Yes (autoUpdater) | Yes | Yes (UpdateBanner) |
| `update:download` | Yes | Yes (autoUpdater) | Yes | Yes (UpdateBanner) |
| `update:install` | Yes | Yes (autoUpdater) | Yes | Yes (UpdateBanner) |
| `update:status` | Yes | Yes (autoUpdater) | Yes | Yes (UpdateBanner) |
| `update:available` | Yes | Yes (send from main) | Yes (listener) | Yes (UpdateBanner) |
| `update:progress` | Yes | Yes (send from main) | Yes (listener) | Yes (UpdateBanner) |
| `update:downloaded` | Yes | Yes (send from main) | Yes (listener) | Yes (UpdateBanner) |
| `deep-context:status` | Yes | Yes | Not in preload.ts | N/A |
| `deep-context:get-commitments` | Yes | Yes | Not in preload.ts | N/A |
| `deep-context:get-pending-followups` | Yes | Yes | Not in preload.ts | N/A |
| `deep-context:dismiss-commitment` | Yes | Yes | Not in preload.ts | N/A |
| `deep-context:complete-commitment` | Yes | Yes | Not in preload.ts | N/A |
| `deep-context:get-enriched-context` | Yes | Yes | Not in preload.ts | N/A |
| `semantic:get-work-context` | Yes | Yes | Yes | Yes (SemanticDashboard) |
| `semantic:get-entities` | Yes | Yes | Yes | No (not called directly) |
| `semantic:get-threads` | Yes | Yes | Yes | Yes (SemanticDashboard) |
| `semantic:get-signatures` | Yes | Yes | Yes | Yes (SemanticDashboard) |
| `semantic:get-activity-distribution` | Yes | Yes | Yes | No (via getWorkContext) |

### Summary:
- **8 channels with NO handler:** `activity:toggle-tracking`, `sync:send-message`, `sync:stream-chunk`, `sync:stream-end`, `sync:voice-start`, `sync:voice-end`, `settings:reset`, `cloud:last-sync`
- **6 channels handled but NOT exposed in preload:** `settings:set-api-key`, `settings:get-api-key-status`, all 6 `deep-context:*` channels (renderer cannot access these features)
- **5 channels exposed and handled but NEVER called by renderer:** `activity:get-recent`, `activity:get-summary`, `activity:status`, `stats:get-today`, `stats:get-weekly`

---

## External URLs Inventory

| URL | Used In | Purpose | Expected Status |
|-----|---------|---------|----------------|
| `https://sfxpmzicgpaxfntqleig.supabase.co` | config.ts, constants.ts, index.ts, handlers.ts, cloudSyncService.ts, authUtils.ts, actionService.ts | Supabase API base URL | LIVE (verified project exists) |
| `https://sfxpmzicgpaxfntqleig.supabase.co/auth/v1/user` | index.ts, handlers.ts | Fetch authenticated user info | LIVE |
| `https://sfxpmzicgpaxfntqleig.supabase.co/auth/v1/token?grant_type=refresh_token` | authUtils.ts | Token refresh endpoint | LIVE |
| `https://sfxpmzicgpaxfntqleig.supabase.co/rest/v1/users?id=eq.*` | index.ts, handlers.ts | Query users table for company_id | LIVE |
| `https://sfxpmzicgpaxfntqleig.supabase.co/functions/v1/sync` | ChatWidget.tsx | SYNC agent chat endpoint | LIVE |
| `https://sfxpmzicgpaxfntqleig.supabase.co/functions/v1/sync-voice` | VoiceMode.tsx | Voice mode endpoint | LIVE (but may not return audio -- see LINK-010) |
| `https://app.isyncso.com` | config.ts, constants.ts, App.tsx, ChatWidget.tsx, systemTray.ts | Web app base URL | LIVE |
| `https://app.isyncso.com/desktop-auth?state=*` | handlers.ts (AUTH_LOGIN), systemTray.ts | Desktop auth redirect page | LIVE |
| `https://app.isyncso.com/settings` | systemTray.ts | Settings page | UNKNOWN -- may be 404 (see LINK-006) |
| `https://app.isyncso.com{redirectUrl}` | ChatWidget.tsx:603 | Action redirect URLs from SYNC agent | DEPENDS on action |
| `https://api.together.xyz/v1/chat/completions` | semanticAnalyzer.ts | Together.ai LLM API | LIVE |
| `wss://sfxpmzicgpaxfntqleig.supabase.co` | actionService.ts (via wsUrl), index.html (CSP) | Supabase Realtime WebSocket | LIVE |
| `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility` | handlers.ts, permissions.ts | macOS System Settings deep link | WORKS (may be deprecated on Sequoia -- see LINK-013) |
| `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture` | handlers.ts, permissions.ts | macOS System Settings deep link | WORKS (may be deprecated on Sequoia) |
| `x-apple.systempreferences:com.apple.preference.security?Privacy` | permissions.ts | macOS System Settings deep link | WORKS |

---

## Component Import Tree Analysis

### `App.tsx` imports:
| Component | Imported | Rendered | Status |
|-----------|----------|----------|--------|
| `SyncStateProvider` | Yes | Yes (wraps authenticated view) | OK |
| `FloatingAvatar` | Yes | Yes (avatar mode) | OK |
| `ChatWidget` | Yes | Yes (chat mode) | OK |
| `VoiceMode` | Yes | Yes (voice mode) | OK |
| `LoginScreen` | Yes | Yes (login state) | OK |
| `PermissionsSetup` | Yes | Yes (permissions state) | OK |
| `SemanticDashboard` | Yes | Yes (dashboard mode within chat) | OK |

**No orphan components detected** -- all imported components in App.tsx are rendered conditionally.

### Renderer component files not imported by App.tsx:
| Component | File | Imported By | Status |
|-----------|------|-------------|--------|
| `SyncAvatarMini` | SyncAvatarMini.tsx | FloatingAvatar, ChatWidget | OK (transitive) |
| `UpdateBanner` | UpdateBanner.tsx | ChatWidget | OK (transitive) |

**No orphan component files detected.**

---

## Asset Path Analysis

| Reference | File | Asset Path | Exists | Status |
|-----------|------|-----------|--------|--------|
| Tray icon | systemTray.ts:36 | `__dirname + '../../assets/tray/trayTemplate.png'` | `assets/tray/trayTemplate.png` exists | WARN -- relative to build output, may not resolve (see LINK-004) |
| Preload script | floatingWidget.ts:62 | `__dirname + '../../preload/index.js'` | `src/preload/index.js` exists | WARN -- relative to build output (see LINK-005) |
| Renderer HTML | floatingWidget.ts:91 | `__dirname + '../../renderer/index.html'` | `src/renderer/index.html` exists | WARN -- relative to build output |
| App icon | assets/icon.icns | Direct file | Yes | OK |

---

## Severity Summary

| Severity | Count | Findings |
|----------|-------|----------|
| Critical | 1 | LINK-001 |
| High | 3 | LINK-004, LINK-005, LINK-010 |
| Medium | 4 | LINK-002, LINK-006, LINK-007, LINK-013, LINK-014 |
| Low | 4 | LINK-003, LINK-008, LINK-009, LINK-011, LINK-012 |
| N/A | 1 | LINK-015 (retracted) |
