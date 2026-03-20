# Accessibility Audit (WCAG 2.1 AA) - Phase 1: SPOTTER

**App:** SYNC Desktop (Electron)
**Date:** 2026-03-20
**Scope:** `src/renderer/components/`, `src/renderer/App.tsx`, `src/renderer/styles/globals.css`
**Auditor:** Claude Code (read-only scan)

---

## Finding A11Y-001: FloatingAvatar has no accessible label or role
- **File:** src/renderer/components/FloatingAvatar.tsx:79-88
- **Element:** Outer `<div>` acting as an interactive button (click/drag)
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Issue:** The FloatingAvatar is a draggable/clickable interactive element implemented as a plain `<div>`. It has no `role="button"`, no `aria-label`, and no `tabIndex`. Screen readers cannot identify it as interactive or convey its purpose.
- **Direct Impact:** Screen reader users cannot discover, focus, or activate the avatar. They have no way to open chat, voice mode, or the web app.
- **Indirect Impact:** The avatar is the sole entry point to all widget functionality when in authenticated/avatar mode. This blocks the entire app for assistive technology users.
- **Severity:** Critical
- **Status:** RESOLVED

## Finding A11Y-002: FloatingAvatar is mouse-only (no keyboard support)
- **File:** src/renderer/components/FloatingAvatar.tsx:78-88
- **Element:** Outer `<div>` (click handler fires only on mouseup)
- **WCAG Criterion:** 2.1.1 Keyboard
- **Issue:** The avatar click interaction is driven entirely by `onMouseDown` + document `mouseup` listeners. There is no `onKeyDown` handler, no `tabIndex`, and no keyboard equivalent for the click/double-click/triple-click pattern (1=chat, 2=voice, 3=web app).
- **Direct Impact:** Keyboard-only users cannot open chat, voice mode, or the web app. The widget is completely inaccessible without a mouse.
- **Indirect Impact:** Also affects switch-access users and voice-control users who rely on keyboard emulation.
- **Severity:** Critical
- **Status:** RESOLVED

## Finding A11Y-003: Chat input field has no accessible label
- **File:** src/renderer/components/ChatWidget.tsx:638-647
- **Element:** `<input type="text" placeholder="Ask SYNC anything..." className="chat-input flex-1">`
- **WCAG Criterion:** 1.3.1 Info and Relationships / 4.1.2 Name, Role, Value
- **Issue:** The text input has a `placeholder` attribute but no `<label>`, `aria-label`, or `aria-labelledby`. Placeholder text alone is insufficient as an accessible name per WCAG (it disappears on input and is not reliably announced by all screen readers).
- **Direct Impact:** Screen reader users hear "edit text" or similar generic announcement without understanding the input's purpose.
- **Indirect Impact:** Voice control users cannot target the field by name (e.g., "click Ask SYNC anything" may not work).
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-004: Send button has no accessible label
- **File:** src/renderer/components/ChatWidget.tsx:658-670
- **Element:** Send `<button>` containing only an SVG arrow icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value / 1.1.1 Non-text Content
- **Issue:** The send button contains only an SVG icon with no `aria-label`, no `title`, and no visually hidden text. Screen readers announce it as "button" with no name.
- **Direct Impact:** Screen reader users cannot determine the button's purpose.
- **Indirect Impact:** Voice control users cannot activate it by name.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-005: Stop streaming button has no accessible label
- **File:** src/renderer/components/ChatWidget.tsx:649-656
- **Element:** Stop `<button>` containing only an SVG stop icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value / 1.1.1 Non-text Content
- **Issue:** The stop-streaming button contains only an SVG rectangle icon with no `aria-label`, no `title`, and no visually hidden text.
- **Direct Impact:** Screen reader users cannot determine the button's purpose during active streaming.
- **Indirect Impact:** Users may not know how to stop a streaming response.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-006: Close button in ChatWidget has no accessible label
- **File:** src/renderer/components/ChatWidget.tsx:518-525
- **Element:** Close `<button>` containing only an SVG X icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value / 1.1.1 Non-text Content
- **Issue:** The close button contains only an SVG icon. No `aria-label`, `title`, or visually hidden text.
- **Direct Impact:** Screen reader users hear "button" with no indication it closes the chat.
- **Indirect Impact:** Keyboard users navigating by Tab have no context for what the button does.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-007: Dashboard button has no accessible label (only title)
- **File:** src/renderer/components/ChatWidget.tsx:506-516
- **Element:** Dashboard `<button>` with `title="Work Insights"` and an SVG icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Issue:** The dashboard button relies on `title` attribute for identification. While `title` can serve as an accessible name, it is unreliable across screen readers and is not visible to sighted keyboard users. An `aria-label` is preferred.
- **Direct Impact:** Some screen reader configurations may not announce the title.
- **Indirect Impact:** Minor -- the `title` attribute does provide a fallback name.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-008: Sync status button uses title-only labeling
- **File:** src/renderer/components/ChatWidget.tsx:472-503
- **Element:** Sync status `<button>` with dynamic `title` and an SVG icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Issue:** The sync button uses a dynamic `title` attribute for its label (e.g., "Syncing...", "X items to sync", "Synced"). While `title` can act as an accessible name, `aria-label` is more reliably announced. The spinning animation state is also not conveyed to assistive technology.
- **Direct Impact:** Screen reader users may miss the sync state.
- **Indirect Impact:** The visual-only spinning animation conveys status that is not programmatically determinable.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-009: Streaming chat messages lack aria-live region
- **File:** src/renderer/components/ChatWidget.tsx:530-633
- **Element:** Messages container `<div className="flex-1 overflow-y-auto p-4 space-y-3">`
- **WCAG Criterion:** 4.1.3 Status Messages
- **Issue:** Chat messages stream in dynamically (character-by-character in SSE) but the messages container has no `aria-live` region. New messages and streaming content are not announced to screen readers.
- **Direct Impact:** Screen reader users have no awareness that new messages have arrived or that content is streaming.
- **Indirect Impact:** The loading dots animation (bounce) is also not announced -- screen reader users do not know the assistant is "typing."
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-010: Chat widget does not trap focus when open
- **File:** src/renderer/components/ChatWidget.tsx:456-678
- **Element:** Entire ChatWidget component
- **WCAG Criterion:** 2.4.3 Focus Order
- **Issue:** When the chat widget opens, focus is set to the input field (good), but there is no focus trap. In an Electron app with a floating widget, focus can escape the chat panel. Since the widget overlays the desktop, focus should be trapped within it to prevent users from tabbing into invisible or non-existent content behind it.
- **Direct Impact:** Keyboard users can Tab out of the chat widget into a void, losing their place.
- **Indirect Impact:** Screen reader users may become disoriented navigating outside the visible widget.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-011: VoiceMode does not trap focus when open
- **File:** src/renderer/components/VoiceMode.tsx:252-355
- **Element:** Entire VoiceMode component
- **WCAG Criterion:** 2.4.3 Focus Order
- **Issue:** Same as ChatWidget -- VoiceMode is a full-panel overlay but has no focus trap. Keyboard users can Tab out into nothing.
- **Direct Impact:** Keyboard users can lose focus context.
- **Indirect Impact:** Screen reader users become disoriented.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-012: VoiceMode close button has no accessible label
- **File:** src/renderer/components/VoiceMode.tsx:265-268
- **Element:** `<button onClick={onClose} className="close-button">` with only an SVG icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value / 1.1.1 Non-text Content
- **Issue:** The close button contains only an SVG with no `aria-label` or visually hidden text.
- **Direct Impact:** Screen reader users cannot identify the button.
- **Indirect Impact:** Voice control users cannot target it.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-013: VoiceMode microphone button has no accessible label
- **File:** src/renderer/components/VoiceMode.tsx:303-319
- **Element:** Microphone `<button>` containing only an SVG microphone icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value / 1.1.1 Non-text Content
- **Issue:** The "tap to speak" button has no `aria-label` or text content. It contains only an SVG icon. The status text "Tap to speak" is rendered in a separate `<p>` element below but is not programmatically associated.
- **Direct Impact:** Screen reader users encounter an unlabeled button.
- **Indirect Impact:** The primary interaction in voice mode is inaccessible to screen reader users.
- **Severity:** Critical
- **Status:** RESOLVED

## Finding A11Y-014: VoiceMode state changes not announced
- **File:** src/renderer/components/VoiceMode.tsx:323-326
- **Element:** Status text `<p>` and voice state transitions
- **WCAG Criterion:** 4.1.3 Status Messages
- **Issue:** The voice state transitions (idle -> listening -> processing -> speaking) update visual text and animations, but there is no `aria-live` region to announce these state changes. The status text ("Listening...", "Processing...", etc.) is not inside an `aria-live` region.
- **Direct Impact:** Screen reader users have no awareness of voice mode state changes.
- **Indirect Impact:** Users cannot determine whether the system is listening, processing, or speaking.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-015: Voice bars animation has no pause mechanism
- **File:** src/renderer/components/VoiceMode.tsx:277-299 and src/renderer/styles/globals.css:226-250
- **Element:** `.voice-wave` and `.voice-bar` elements
- **WCAG Criterion:** 2.2.2 Pause, Stop, Hide
- **Issue:** The voice bar animations run continuously when voice mode is in listening or speaking state. While `SyncAvatarMini` checks `prefersReducedMotion()`, the VoiceMode component does not check `prefers-reduced-motion` for its voice bar animations. The CSS `@keyframes voice-bar` has no reduced-motion media query.
- **Direct Impact:** Users with vestibular disorders or motion sensitivity may experience discomfort from the continuous bar animations.
- **Indirect Impact:** Fails to respect system-level accessibility preference.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-016: SyncAvatarMini canvas animation has no text alternative
- **File:** src/renderer/components/SyncAvatarMini.tsx:470-474
- **Element:** `<canvas>` element for particle animation
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Issue:** The `<canvas>` element has no fallback text, `aria-label`, or `role`. It is a decorative/status animation but is not marked as decorative (`role="presentation"` or `aria-hidden="true"`).
- **Direct Impact:** Screen readers may attempt to announce the canvas element with no meaningful information.
- **Indirect Impact:** Minor -- it is `pointer-events-none` so interaction is not expected, but screen readers may still encounter it.
- **Severity:** Low
- **Status:** RESOLVED

## Finding A11Y-017: SyncAvatarMini component has no accessible role or label
- **File:** src/renderer/components/SyncAvatarMini.tsx:406-484
- **Element:** Root `<div>` of SyncAvatarMini
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Issue:** The SyncAvatarMini is used both decoratively (empty state illustration) and as a meaningful status indicator (mood, level, active agent). When used as a status indicator, it has no `role="img"` or `aria-label` describing the current state.
- **Direct Impact:** Screen reader users miss the visual status information conveyed by the avatar (thinking, speaking, success animations).
- **Indirect Impact:** The mood/processing state is only conveyed visually.
- **Severity:** Medium
- **Status:** ACCEPTED — SyncAvatarMini is decorative/ambient; status is conveyed through text labels and ARIA attributes on parent components

## Finding A11Y-018: Color contrast - text-zinc-500 on dark backgrounds
- **File:** src/renderer/components/ChatWidget.tsx:467, 572; src/renderer/components/SemanticDashboard.tsx:155
- **Element:** `text-zinc-500` (`#71717a`) on `bg-zinc-900` (`#18181b`) and similar dark backgrounds
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Issue:** `text-zinc-500` (#71717a) on `bg-zinc-900/95` (#18181b at ~95% opacity) yields a contrast ratio of approximately 4.3:1 for normal text. At the `text-xs` size used (12px), this is below the 4.5:1 threshold for normal text. Specific instances: "AI Orchestrator" (line 467), "I can help with..." description (line 572), "Semantic Analysis" (line 155 of SemanticDashboard).
- **Direct Impact:** Users with low vision or color vision deficiencies may struggle to read secondary text.
- **Indirect Impact:** Affects readability in varying ambient lighting conditions.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-019: Color contrast - text-zinc-600 on dark backgrounds
- **File:** src/renderer/components/ChatWidget.tsx:576, 673
- **Element:** `text-zinc-600` (`#52525b`) on dark backgrounds
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Issue:** `text-zinc-600` (#52525b) on `bg-zinc-900` (#18181b) yields a contrast ratio of approximately 3.0:1, which fails the 4.5:1 minimum for normal text. Instances: "I see you're working in..." (line 576), "Press Enter to send" hint (line 673).
- **Direct Impact:** Users with low vision cannot read these UI hints.
- **Indirect Impact:** Keyboard shortcut hints are invisible to users who need them most.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-020: Color contrast - text-white/40 and text-white/20 on dark backgrounds
- **File:** src/renderer/components/LoginScreen.tsx:222, 286; src/renderer/components/VoiceMode.tsx:346
- **Element:** `text-white/40` (`rgba(255,255,255,0.4)`) and `text-white/20` on black/near-black
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Issue:** `text-white/40` on black yields approximately 2.9:1 contrast. `text-white/20` yields approximately 1.7:1. Both fail the 4.5:1 minimum. Instances: Login screen subtitle "Your AI companion..." (line 222), footer "Secure authentication..." (line 286), VoiceMode hint text (line 346), feature list items (line 275).
- **Direct Impact:** Users with low vision cannot read these labels.
- **Indirect Impact:** Important context (security assurance, feature list, keyboard hints) is effectively invisible to some users.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-021: Color contrast - text-white/50 on gradient backgrounds
- **File:** src/renderer/components/ChatWidget.tsx:543
- **Element:** `text-white/50` on `from-cyan-500/10 to-blue-500/10` background
- **WCAG Criterion:** 1.4.3 Contrast (Minimum)
- **Issue:** `text-white/50` on a near-black background with very low-opacity cyan/blue gradient yields approximately 3.4:1 contrast, below the 4.5:1 minimum. Instance: "Sign in to access your data and personalized features" in the login banner.
- **Direct Impact:** Low-vision users cannot read the sign-in prompt.
- **Indirect Impact:** Users may not understand why they should sign in.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-022: No skip navigation link
- **File:** src/renderer/App.tsx (all modes)
- **Element:** Missing skip-to-content link
- **WCAG Criterion:** 2.4.1 Bypass Blocks
- **Issue:** The chat widget has a header with multiple buttons before the main content area and input. There is no skip navigation link to jump past the header to the chat messages or input field.
- **Direct Impact:** Keyboard/screen reader users must Tab through all header buttons every time to reach the chat input.
- **Indirect Impact:** Reduces efficiency for power keyboard users.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-023: Heading hierarchy skips levels
- **File:** src/renderer/components/ChatWidget.tsx:466, 571
- **Element:** `<h3>` "SYNC" and `<h4>` "Hey! How can I help?"
- **WCAG Criterion:** 1.3.1 Info and Relationships
- **Issue:** The heading structure starts at `<h3>` (line 466) then uses `<h4>` (line 571), skipping `<h1>` and `<h2>`. On the LoginScreen, `<h1>` is used correctly (line 221), but the ChatWidget and SemanticDashboard start at `<h3>`.
- **Direct Impact:** Screen reader users navigating by heading level get a confusing document structure.
- **Indirect Impact:** Heading-based navigation is less effective.
- **Severity:** Low
- **Status:** RESOLVED

## Finding A11Y-024: SemanticDashboard tabs missing ARIA tab pattern
- **File:** src/renderer/components/SemanticDashboard.tsx:161-175
- **Element:** Tab buttons (`overview`, `threads`, `patterns`)
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Issue:** The tab bar is implemented as plain `<button>` elements without `role="tablist"`, `role="tab"`, `aria-selected`, or `role="tabpanel"`. The selected state is only conveyed via CSS class (`text-cyan-400 border-cyan-400`). Arrow key navigation between tabs is not implemented.
- **Direct Impact:** Screen reader users cannot identify these as tabs or know which tab is selected.
- **Indirect Impact:** Keyboard users cannot use expected arrow-key navigation within the tab set.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-025: SemanticDashboard back button has no accessible label
- **File:** src/renderer/components/SemanticDashboard.tsx:145-152
- **Element:** Back `<button>` with only an SVG arrow icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value / 1.1.1 Non-text Content
- **Issue:** The back button contains only an SVG icon with no `aria-label` or text.
- **Direct Impact:** Screen reader users cannot identify the button's purpose.
- **Indirect Impact:** Voice control users cannot target it.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-026: Loading spinner has no accessible announcement
- **File:** src/renderer/App.tsx:137-141
- **Element:** Loading spinner `<div>` with `animate-spin`
- **WCAG Criterion:** 4.1.3 Status Messages
- **Issue:** The loading state shows a visual spinner but has no `role="status"`, `aria-live`, or visually hidden text like "Loading...". Screen readers are not informed the app is loading.
- **Direct Impact:** Screen reader users encounter an empty or confusing page during loading.
- **Indirect Impact:** Users may think the app has failed to start.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-027: "View in app" action link is not keyboard-accessible
- **File:** src/renderer/components/ChatWidget.tsx:600-609
- **Element:** `<button className="text-cyan-400 text-xs hover:underline">View in app</button>`
- **WCAG Criterion:** 2.1.1 Keyboard
- **Issue:** While this is technically a `<button>` (keyboard-accessible by default), it is styled to look like a link (`hover:underline`) without any focus styling. It has no visible focus indicator.
- **Direct Impact:** Keyboard users cannot see when this button is focused.
- **Indirect Impact:** Minor -- the button is focusable, but the lack of focus indicator violates focus visibility requirements.
- **Severity:** Low
- **Status:** RESOLVED

## Finding A11Y-028: UpdateBanner dismiss button has no accessible label
- **File:** src/renderer/components/UpdateBanner.tsx:105-112
- **Element:** Dismiss `<button>` with only an SVG X icon
- **WCAG Criterion:** 4.1.2 Name, Role, Value / 1.1.1 Non-text Content
- **Issue:** The dismiss button in the update banner contains only an SVG X icon with no `aria-label` or text.
- **Direct Impact:** Screen reader users cannot determine the button's purpose.
- **Indirect Impact:** Users may accidentally dismiss the update notification.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-029: UpdateBanner progress bar has no accessible representation
- **File:** src/renderer/components/UpdateBanner.tsx:123-129
- **Element:** Download progress bar (`<div>` with width percentage)
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Issue:** The download progress bar is implemented as styled `<div>` elements without `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, or `aria-valuemax`. The percentage text is visible but not programmatically associated with the progress.
- **Direct Impact:** Screen reader users cannot track download progress.
- **Indirect Impact:** Users relying on assistive tech may not know an update is downloading.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-030: PermissionsSetup progress bar has no accessible representation
- **File:** src/renderer/components/PermissionsSetup.tsx:100-112
- **Element:** Permission progress bar (`<div>` elements)
- **WCAG Criterion:** 4.1.2 Name, Role, Value
- **Issue:** Same as A11Y-029. The permissions progress indicator is styled `<div>` elements without ARIA progressbar attributes.
- **Direct Impact:** Screen reader users cannot determine setup progress.
- **Indirect Impact:** Users may not understand how many permissions remain.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-031: PermissionsSetup status icons have no text alternatives
- **File:** src/renderer/components/PermissionsSetup.tsx:129-138
- **Element:** SVG check and warning icons for permission status
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Issue:** The SVG icons indicating granted (checkmark) vs. not-granted (warning) status have no `aria-label` or hidden text. The status is only conveyed through color (cyan vs. amber) and icon shape.
- **Direct Impact:** Screen reader users cannot determine whether a permission is granted or not from the icon alone. (The "Required" badge helps partially.)
- **Indirect Impact:** Color-only status indication also fails 1.4.1 Use of Color for users who cannot distinguish cyan from amber.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-032: Login screen decorative SVGs not hidden from assistive technology
- **File:** src/renderer/components/LoginScreen.tsx:79-112 (SyncRing), 127-153 (FeatureIcon SVGs)
- **Element:** Decorative SVGs in SyncRing and FeatureIcon components
- **WCAG Criterion:** 1.1.1 Non-text Content
- **Issue:** The SyncRing SVG and feature icon SVGs are decorative/supplementary but are not marked with `aria-hidden="true"` or `role="presentation"`. Screen readers may attempt to parse and announce them, creating noise.
- **Direct Impact:** Screen reader users hear unnecessary SVG element announcements.
- **Indirect Impact:** Slows down navigation for assistive tech users.
- **Severity:** Low
- **Status:** RESOLVED

## Finding A11Y-033: Floating avatar click-count pattern is undiscoverable
- **File:** src/renderer/App.tsx:95-117
- **Element:** Click pattern handler (1-click=chat, 2-click=voice, 3-click=web app)
- **WCAG Criterion:** 3.3.2 Labels or Instructions / 2.1.1 Keyboard
- **Issue:** The triple-click pattern to access different modes (1=chat, 2=voice, 3=web app) is not documented in any visible UI or ARIA description. There are no instructions, tooltips, or alternative navigation for these modes. This is a custom gesture with no standard equivalent.
- **Direct Impact:** All users (not just assistive tech users) must discover this pattern by trial or documentation. Screen reader/keyboard users cannot access it at all (see A11Y-002).
- **Indirect Impact:** Violates the principle of discoverability. The 400ms timing window makes it difficult even for mouse users to reliably trigger double/triple click.
- **Severity:** High
- **Status:** RESOLVED

## Finding A11Y-034: focus:outline-none in chat-input without sufficient alternative
- **File:** src/renderer/styles/globals.css:176
- **Element:** `.chat-input` style with `focus:outline-none`
- **WCAG Criterion:** 2.4.7 Focus Visible
- **Issue:** The `.chat-input` class uses `focus:outline-none` which removes the default focus ring. It replaces it with `focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20`. However, the ring is semi-transparent (`ring-cyan-500/20` = 20% opacity) and the border change is subtle (`cyan-500/50` = 50% opacity). This may not provide sufficient visual contrast as a focus indicator, especially in the dark theme.
- **Direct Impact:** Keyboard users may not clearly see which element is focused.
- **Indirect Impact:** The low-opacity ring on a dark background may be imperceptible to low-vision users.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-035: Icon-only buttons throughout app lack visible focus indicators
- **File:** src/renderer/components/ChatWidget.tsx:472-525 (sync, dashboard, close buttons)
- **Element:** All icon-only header buttons with `hover:bg-white/10` but no explicit focus style
- **WCAG Criterion:** 2.4.7 Focus Visible
- **Issue:** The header buttons use `hover:bg-white/10` for hover state but do not specify any `focus:` or `focus-visible:` styles. While browsers may provide a default outline, Tailwind's preflight resets can suppress it. Without explicit focus styling, these buttons may have no visible focus indicator.
- **Direct Impact:** Keyboard users cannot see which button is currently focused.
- **Indirect Impact:** All header navigation becomes unpredictable for keyboard users.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-036: Error messages not associated with form controls
- **File:** src/renderer/components/LoginScreen.tsx:267-269; src/renderer/components/VoiceMode.tsx:329-331
- **Element:** Error `<p>` elements
- **WCAG Criterion:** 3.3.1 Error Identification
- **Issue:** Error messages are rendered as standalone `<p>` elements not programmatically linked to the relevant control via `aria-describedby` or `aria-errormessage`. They are also not in `aria-live` regions, so dynamic error appearance is not announced.
- **Direct Impact:** Screen reader users may not be informed when an error occurs.
- **Indirect Impact:** Users cannot associate the error with the action that caused it.
- **Severity:** Medium
- **Status:** RESOLVED

## Finding A11Y-037: Activity distribution bars have no accessible representation
- **File:** src/renderer/components/SemanticDashboard.tsx:268-286
- **Element:** Activity distribution bar chart (styled `<div>` elements)
- **WCAG Criterion:** 1.1.1 Non-text Content / 4.1.2 Name, Role, Value
- **Issue:** The activity distribution visualization uses colored `<div>` elements as bar charts. While the percentage text is visible, the bar relationship is not conveyed programmatically. No `role="meter"` or `role="img"` with `aria-label`.
- **Direct Impact:** Screen reader users miss the visual distribution representation. (The text values are accessible, so impact is moderate.)
- **Indirect Impact:** The color-coded bars also rely on color alone to distinguish categories (BUILDING=blue, INVESTIGATING=purple, etc.), violating 1.4.1.
- **Severity:** Low
- **Status:** RESOLVED

## Finding A11Y-038: Drag region blocks keyboard interaction
- **File:** src/renderer/components/ChatWidget.tsx:461; src/renderer/components/VoiceMode.tsx:255
- **Element:** `<div className="drag-region ...">` header areas
- **WCAG Criterion:** 2.1.1 Keyboard
- **Issue:** The `drag-region` class (with `-webkit-app-region: drag`) is applied to the header area containing interactive buttons. While individual buttons use the `no-drag` class, the drag region can interfere with keyboard focus and click events on child elements in some Electron versions.
- **Direct Impact:** Potential keyboard interaction issues depending on Electron version.
- **Indirect Impact:** Low probability but could make header buttons unresponsive to keyboard.
- **Severity:** Low
- **Status:** ACCEPTED — Buttons already use no-drag class; removing drag region would break window dragging. Low probability in current Electron version.

---

# Summary: WCAG 2.1 AA Criteria Coverage

| WCAG Criterion | Status | Findings |
|---|---|---|
| **1.1.1 Non-text Content** | FAIL | A11Y-004, A11Y-005, A11Y-006, A11Y-012, A11Y-013, A11Y-016, A11Y-017, A11Y-025, A11Y-028, A11Y-031, A11Y-032 |
| **1.3.1 Info and Relationships** | FAIL | A11Y-003, A11Y-023, A11Y-024 |
| **1.4.1 Use of Color** | FAIL | A11Y-031, A11Y-037 |
| **1.4.3 Contrast (Minimum)** | FAIL | A11Y-018, A11Y-019, A11Y-020, A11Y-021 |
| **2.1.1 Keyboard** | FAIL | A11Y-002, A11Y-033, A11Y-038 |
| **2.2.2 Pause, Stop, Hide** | FAIL | A11Y-015 |
| **2.4.1 Bypass Blocks** | FAIL | A11Y-022 |
| **2.4.3 Focus Order** | FAIL | A11Y-010, A11Y-011 |
| **2.4.7 Focus Visible** | FAIL | A11Y-034, A11Y-035 |
| **3.3.1 Error Identification** | FAIL | A11Y-036 |
| **3.3.2 Labels or Instructions** | FAIL | A11Y-033 |
| **4.1.2 Name, Role, Value** | FAIL | A11Y-001, A11Y-003, A11Y-004, A11Y-005, A11Y-006, A11Y-007, A11Y-008, A11Y-012, A11Y-013, A11Y-024, A11Y-025, A11Y-028, A11Y-029, A11Y-030 |
| **4.1.3 Status Messages** | FAIL | A11Y-009, A11Y-014, A11Y-026 |

## Severity Distribution

| Severity | Count | Findings |
|---|---|---|
| **Critical** | 3 | A11Y-001, A11Y-002, A11Y-013 |
| **High** | 14 | A11Y-003, A11Y-004, A11Y-005, A11Y-006, A11Y-009, A11Y-010, A11Y-011, A11Y-012, A11Y-014, A11Y-019, A11Y-020, A11Y-024, A11Y-025, A11Y-033 |
| **Medium** | 14 | A11Y-007, A11Y-008, A11Y-015, A11Y-017, A11Y-018, A11Y-021, A11Y-022, A11Y-026, A11Y-028, A11Y-029, A11Y-030, A11Y-031, A11Y-034, A11Y-035, A11Y-036 |
| **Low** | 7 | A11Y-016, A11Y-023, A11Y-027, A11Y-032, A11Y-037, A11Y-038 |

**Total findings: 38**
**All findings addressed (RESOLVED or ACCEPTED)**
