# SYNC Desktop

**Your AI-powered productivity companion that understands your work context.**

SYNC Desktop is the companion app for [app.isyncso.com](https://app.isyncso.com) that runs quietly in your menu bar, tracking your activity and providing intelligent assistance based on what you're actually doing on your computer.

---

## What is SYNC Desktop?

SYNC Desktop bridges the gap between you and your AI assistant by giving SYNC real-time awareness of your work context. Instead of explaining what you're working on every time you chat, SYNC already knows - it sees which apps you're using, understands your focus patterns, and can even detect commitments you've made in emails or messages.

**Think of it as giving your AI assistant eyes and memory for your desktop work.**

---

## Key Features

### Always-Available AI Assistant
A floating SYNC avatar stays on your screen, ready to help at any moment:
- **Single click** → Open chat with full context of what you're working on
- **Double click** → Voice mode for hands-free interaction
- **Triple click** → Open the full web app

### Intelligent Activity Tracking
SYNC Desktop monitors your workflow to understand your work patterns:
- **Active App Detection** - Knows what applications you're using
- **Window Context** - Understands what you're working on within each app
- **Focus Score** - Calculates how focused you are based on app switching patterns
- **Work Categorization** - Automatically categorizes time (Development, Communication, Research, etc.)

### Deep Context System (New!)
The most powerful feature - SYNC Desktop can now understand what's happening on your screen:

- **Screen Understanding** - Uses OCR and AI to read and comprehend screen content
- **Commitment Tracking** - Detects when you say things like "I'll send you that calendar invite" or "Let me email you the document"
- **Follow-up Reminders** - If you promised to do something but haven't done it yet, SYNC will remind you
- **Action Detection** - Knows when you've completed tasks like sending emails or creating calendar events

**Example scenario:**
> You're in a Zoom meeting and type in chat: "I'll send you the project timeline after this call."
>
> 30 minutes later, you haven't sent it. SYNC notices and gently reminds you: "You mentioned sending the project timeline - would you like me to help draft that email?"

### Automatic Journaling
Every day, SYNC generates a personal productivity journal:
- **Daily Overview** - AI-written summary of your day's work
- **Timeline** - Chronological narrative of your activities
- **Focus Analysis** - Insights into your productivity patterns
- **Top Applications** - Breakdown of where you spent your time

### Cloud Sync
All your activity data syncs securely to the SYNC cloud:
- Access your productivity data from anywhere via [app.isyncso.com](https://app.isyncso.com)
- Generate reports and analytics across days, weeks, and months
- Your AI assistant has full context whether you're on desktop or web

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                        YOUR COMPUTER                                 │
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │ Active App   │    │   Screen     │    │  Your Work   │         │
│   │  Detection   │───▶│   Capture    │───▶│   Context    │         │
│   └──────────────┘    └──────────────┘    └──────────────┘         │
│                              │                    │                  │
│                              ▼                    ▼                  │
│                       ┌──────────────┐    ┌──────────────┐         │
│                       │  OCR + AI    │    │  Commitment  │         │
│                       │  Analysis    │───▶│  Detection   │         │
│                       └──────────────┘    └──────────────┘         │
│                                                  │                   │
└──────────────────────────────────────────────────│───────────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────┐
                                          │  SYNC Cloud  │
                                          │  + AI Agent  │
                                          └──────────────┘
```

1. **Activity Tracking** - Every 5 seconds, SYNC notes which app and window is active
2. **Context Building** - Creates a rolling 10-minute detailed context of your work
3. **Screen Analysis** - Periodically captures and analyzes screen content (with privacy controls)
4. **Commitment Detection** - AI identifies promises and action items in your communications
5. **Smart Reminders** - Cross-references what you said you'd do with what you've actually done
6. **Cloud Sync** - Uploads summaries and journals to your SYNC account

---

## Privacy & Security

We take your privacy seriously:

- **Local-First Processing** - Screen OCR happens entirely on your device using macOS Vision framework
- **Sensitive App Exclusion** - Password managers, banking apps, and private browsing are automatically excluded
- **Encrypted Storage** - All local data is encrypted
- **You're in Control** - Pause tracking anytime, configure excluded apps, or disable screen analysis entirely
- **No Raw Screenshots Stored** - Only extracted text and analysis results are kept, images are immediately deleted

---

## Download & Installation

### Download
Get the latest version from [GitHub Releases](https://github.com/frogody/sync.desktop/releases):

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon & Intel) | `.dmg` file |
| Windows | `.exe` installer |

### macOS Installation
1. Download the `.dmg` file
2. Open the DMG and drag SYNC Desktop to Applications
3. On first launch, right-click the app and select "Open" (required for non-App Store apps)
4. Grant Accessibility permission when prompted (required for activity tracking)
5. Optionally grant Screen Recording permission for Deep Context features

### Auto-Updates
SYNC Desktop automatically checks for updates and will prompt you when a new version is available.

---

## Permissions Required

### macOS
| Permission | Purpose | Required? |
|------------|---------|-----------|
| **Accessibility** | Track active windows and apps | Yes |
| **Screen Recording** | Deep Context system (OCR, commitment tracking) | Optional |
| **Microphone** | Voice mode | Optional |

### Windows
No special permissions required.

---

## Use Cases

### For Knowledge Workers
- Track time spent across projects without manual logging
- Get AI assistance that knows what you're working on
- Never forget follow-ups or commitments made in meetings

### For Developers
- Automatic coding session tracking
- Context-aware code assistance
- Git activity correlation with time tracking

### For Managers
- Understand your own work patterns
- Generate reports for time allocation
- Stay on top of commitments across multiple conversations

### For Remote Workers
- Maintain focus with productivity insights
- Accountability without micromanagement
- AI assistant that understands your remote work context

---

## Device Pairing & Transport

### Device Pairing

SYNC Desktop uses secure device pairing to authenticate with the SYNC cloud. Your device API key is stored securely using OS-level keychain (macOS Keychain, Windows Credential Manager) via `keytar`, with a fallback to encrypted electron-store.

**Pairing your device:**

```typescript
import { storeApiKey, getApiKey, deleteApiKey } from './pairing/pairing';

// Store API key (obtained from app.isyncso.com)
await storeApiKey('your-device-api-key');

// Retrieve API key
const apiKey = await getApiKey();

// Remove pairing
await deleteApiKey();
```

### Transport Configuration

The Transport module handles reliable, batched upload of activity data to the SYNC cloud with automatic retry and offline support.

**Configuration Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `endpoint` | - | SYNC API endpoint (required) |
| `deviceId` | - | Unique device identifier (required) |
| `batchSize` | 200 | Max events per batch |
| `maxBatchBytes` | 512KB | Max batch size in bytes (before gzip) |
| `maxRetries` | 6 | Max retry attempts on failure |
| `clientVersion` | '1.0.0' | Client version identifier |

**Basic Usage:**

```typescript
import { Transport } from './transport/Transport';

const transport = new Transport({
  endpoint: 'https://app.isyncso.com',
  deviceId: 'unique-device-id',
  batchSize: 200,
  maxRetries: 6,
});

// Enqueue events (added to persistent SQLite queue)
await transport.enqueue({ 
  type: 'activity',
  app: 'Chrome',
  timestamp: Date.now(),
});

// Trigger flush (batches events, gzips, and uploads)
await transport.flushSoon();

// Force immediate flush
await transport.forceFlush();

// Get transport status
const status = transport.getStatus();
console.log(status.queueLength); // Pending events
console.log(status.sending);     // Currently sending?
```

**How it works:**

1. **Persistent Queue** - Events are stored in a local SQLite database (`~/.sync-desktop/transport_queue.db`), surviving app restarts
2. **Batching** - Events are grouped by count and byte size before upload
3. **Compression** - Batches are gzipped to reduce bandwidth usage
4. **Idempotency** - Each batch has a unique `upload_id` and events have `event_id` to prevent duplicates
5. **Retry Logic** - Exponential backoff with jitter for 5xx and network errors
6. **Error Handling** - 4xx client errors drop the batch (except 429 rate limit which retries)

**Retry Behavior:**

- **5xx errors & network failures**: Retry with exponential backoff (2s, 4s, 8s, 16s, 32s, 60s max)
- **429 rate limit**: Retry with backoff
- **4xx errors (except 429)**: Drop batch to prevent stuck queue
- **Max retries exceeded**: Stop and log error

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# In a separate terminal, start Electron
npm run electron:dev

# Run tests
npm test

# Run tests once (CI mode)
npm run test:run
```

## Building

```bash
# Build for current platform
npm run package

# Build for macOS only
npm run package:mac

# Build for Windows only
npm run package:win
```

Built installers are output to the `release/` directory.

### Native Module Requirements

This project uses native Node.js modules that require compilation:

#### Required Native Modules
- **better-sqlite3** - High-performance SQLite bindings for the transport queue
- **keytar** - Secure OS keychain integration for API key storage

#### Build Tools Required

**macOS:**
```bash
xcode-select --install  # Xcode Command Line Tools
```

**Windows:**
- Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) with "Desktop development with C++" workload
- Or install [windows-build-tools](https://www.npmjs.com/package/windows-build-tools): `npm install --global windows-build-tools`

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install build-essential libsecret-1-dev
```

**Linux (Fedora/RHEL):**
```bash
sudo dnf install gcc-c++ make libsecret-devel
```

#### Rebuilding Native Modules

Native modules are automatically rebuilt for Electron during `npm install` via electron-builder.

If you encounter issues, manually rebuild:
```bash
# Rebuild all native modules for Electron
npm rebuild

# Or rebuild a specific module
npm rebuild better-sqlite3 --build-from-source
npm rebuild keytar --build-from-source
```

#### CI/CD Notes

For CI environments, ensure build tools are installed before running `npm install`:

```yaml
# GitHub Actions example
- name: Install build dependencies (Ubuntu)
  run: sudo apt-get update && sudo apt-get install -y build-essential libsecret-1-dev
  
- name: Install dependencies
  run: npm install
```

**Keytar Fallback:** If keytar fails to build (e.g., missing libsecret on Linux), the pairing module automatically falls back to electron-store. The app will still work, but API keys will be stored in an encrypted JSON file instead of the OS keychain.

---

## Project Structure

```
sync-desktop/
├── src/
│   ├── main/              # Electron main process
│   │   ├── windows/       # Window management
│   │   ├── services/      # Core services
│   │   │   ├── activityTracker.ts     # App/window tracking
│   │   │   ├── contextManager.ts      # Rolling context
│   │   │   ├── screenCapture.ts       # Screen capture
│   │   │   ├── ocrService.ts          # Text extraction
│   │   │   ├── semanticAnalyzer.ts    # AI analysis
│   │   │   ├── deepContextManager.ts  # Orchestrator
│   │   │   ├── summaryService.ts      # Hourly summaries
│   │   │   ├── journalService.ts      # Daily journals
│   │   │   └── cloudSyncService.ts    # Cloud upload
│   │   ├── db/            # SQLite database
│   │   ├── ipc/           # IPC handlers
│   │   └── tray/          # System tray
│   ├── transport/         # Transport layer (NEW)
│   │   ├── sqliteQueue.ts      # Persistent event queue
│   │   └── Transport.ts        # Batching & retry logic
│   ├── pairing/           # Device pairing (NEW)
│   │   └── pairing.ts          # Secure API key storage
│   ├── renderer/          # React UI
│   │   ├── components/    # Avatar, Chat, Voice
│   │   └── hooks/         # Custom hooks
│   ├── preload/           # Context bridge
│   └── shared/            # Shared types & constants
├── test/                  # Unit tests (NEW)
├── assets/                # Icons, sounds
└── build/                 # Build config
```

---

## Tech Stack

- **Electron 34+** - Cross-platform desktop framework
- **React 18** - UI components
- **TypeScript** - Type-safe code
- **Vite** - Fast build tooling
- **Tailwind CSS** - Styling
- **better-sqlite3** - Local database
- **active-win** - Window detection
- **macOS Vision** - Native OCR
- **Together.ai** - LLM for semantic analysis

---

## Roadmap

- [ ] Windows Deep Context support
- [ ] Calendar integration
- [ ] Slack/Teams message tracking
- [ ] Custom commitment rules
- [ ] Team productivity dashboards
- [ ] Browser extension for web activity

---

## Support

- **Documentation**: [app.isyncso.com/docs](https://app.isyncso.com)
- **Issues**: [GitHub Issues](https://github.com/frogody/sync.desktop/issues)
- **Email**: support@isyncso.com

---

## License

MIT

---

<p align="center">
  <strong>SYNC Desktop</strong> - Your AI assistant that actually understands your work.
  <br>
  <a href="https://app.isyncso.com">app.isyncso.com</a>
</p>

---

## macOS Plug & Play Installer (.pkg) — Installation, Signing & Notarization

SYNC Desktop provides a macOS `.pkg` installer alongside the DMG for streamlined installation. The `.pkg` is a standard macOS Installer package that integrates with the built-in Installer.app — just download the `.pkg` from [Releases](https://github.com/frogody/sync.desktop/releases) and double-click to run the installation wizard. No Terminal commands required.

### Installation

1. Download the `.pkg` file from the latest release
2. Double-click to launch macOS Installer.app
3. Follow the installation wizard
4. The app will be installed to `/Applications/SYNC Desktop.app`

### Post-Installation Permissions

After installation, you'll need to grant permissions on first launch:

- **Accessibility** (Required): Allows SYNC to track active windows and apps
  - Navigate to: System Preferences → Privacy & Security → Accessibility
  - Enable "SYNC Desktop"

- **Screen Recording** (Optional): Enables Deep Context features (OCR, commitment tracking)
  - Navigate to: System Preferences → Privacy & Security → Screen Recording
  - Enable "SYNC Desktop"

### Gatekeeper and Code Signing

#### Unsigned Builds (Default)

By default, the CI workflow produces **unsigned** `.pkg` and `.dmg` installers. When you run an unsigned installer, macOS Gatekeeper may display a warning:

> "SYNC Desktop.pkg can't be opened because it is from an unidentified developer."

**Workaround for unsigned builds:**
1. Right-click (or Control-click) the `.pkg` file
2. Select "Open" from the context menu
3. Click "Open" in the confirmation dialog

This is a one-time action. Subsequent updates will open normally if they're signed.

#### Signed & Notarized Builds (Recommended for Distribution)

To create **signed and notarized** installers that install without Gatekeeper warnings, maintainers must configure code signing certificates and App Store Connect API credentials in GitHub repository secrets.

**Benefits of signed builds:**
- No Gatekeeper warnings for users
- Faster installation experience
- Enhanced trust and security
- Required for distribution outside the Mac App Store

---

## For Maintainers: Enabling Code Signing & Notarization

This section is for repository maintainers who want to enable automatic code signing and notarization in the CI workflow.

### Prerequisites

You need an active **Apple Developer Program** membership ($99/year) to create code signing certificates and use notarization.

### Understanding Apple Certificates

Apple provides different types of certificates for different purposes:

| Certificate Type | Purpose | Used For | Distribution |
|-----------------|---------|----------|--------------|
| **Apple Development** | Testing on personal devices during development | Local development, debugging | Cannot be distributed |
| **Developer ID Application** | Code signing Mac apps for distribution outside the Mac App Store | Signing .app bundles | Direct distribution, notarization required |
| **Developer ID Installer** | Signing .pkg installers for distribution outside the Mac App Store | Signing .pkg installers | Direct distribution, notarization required |
| **Mac App Store** | Apps distributed through the Mac App Store | App Store submissions | Mac App Store only |

**For SYNC Desktop distribution, you need:**
- **Developer ID Application** certificate (for signing the .app bundle)
- **Developer ID Installer** certificate (for signing the .pkg installer)

⚠️ **Note:** The screenshots you provided show "Apple Development" certificates. These are for local development only and **cannot be used for distribution**. You must create "Developer ID" certificates for public releases.

### Step 1: Create Developer ID Certificates

1. Log in to [Apple Developer](https://developer.apple.com/account/resources/certificates/list)
2. Click the **+** button to create a new certificate
3. Select **"Developer ID Application"** → Continue
4. Follow the instructions to create a Certificate Signing Request (CSR) in Keychain Access
5. Upload the CSR and download the certificate
6. Repeat the process for **"Developer ID Installer"**
7. Double-click each downloaded certificate to install it in your Keychain

### Step 2: Export Certificates to .p12

You need to export your certificates with their private keys as a `.p12` file:

1. Open **Keychain Access** on macOS
2. In the sidebar, select **login** keychain (or wherever you installed the certificates)
3. Find your **"Developer ID Application"** certificate
4. Expand it to reveal the private key underneath
5. Right-click on the certificate (not the private key) → **Export**
6. Choose format: **Personal Information Exchange (.p12)**
7. Save as `codesign.p12` (or any name)
8. Set a strong password (you'll need this for the P12_PASSWORD secret)

**Important:** The .p12 file contains your private key. Keep it secure and never commit it to source control.

### Step 3: Base64-Encode the .p12 File

GitHub Secrets accept text values, so we need to encode the binary .p12 file as base64:

```bash
# Encode the .p12 file and copy to clipboard
openssl base64 -in /path/to/codesign.p12 -A | pbcopy

# The base64 string is now in your clipboard
```

### Step 4: Create App Store Connect API Key

Notarization requires an App Store Connect API key:

1. Log in to [App Store Connect](https://appstoreconnect.apple.com/access/api)
2. Click **Keys** under the "Team Keys" section (or "Individual Keys")
3. Click the **+** button to generate a new key
4. Set the name (e.g., "SYNC Desktop CI") and role: **"App Manager"** or **"Developer"**
5. Click **Generate**
6. **Download the .p8 file** (you can only download it once - store it safely!)
7. Note the **Key ID** (10-character alphanumeric, e.g., "ABC123DEFG")
8. Note the **Issuer ID** (UUID format, shown at the top of the page)

Now base64-encode the .p8 file:

```bash
# Encode the .p8 file and copy to clipboard
openssl base64 -in /path/to/AuthKey_ABC123DEFG.p8 -A | pbcopy
```

### Step 5: Add Secrets to GitHub Repository

Use the GitHub CLI (`gh`) or the GitHub web interface to add the following secrets:

#### Required Secrets for Code Signing:

```bash
# Code signing certificate (base64-encoded .p12 file from Step 3)
gh secret set APPLE_P12_BASE64

# Password for the .p12 file (set during export in Step 2)
gh secret set P12_PASSWORD

# Temporary keychain password (choose any secure random string)
gh secret set KEYCHAIN_PASSWORD

# Certificate identity name (get from Keychain Access, e.g., "Developer ID Application: Your Name (TEAM_ID)")
gh secret set MAC_SIGNING_IDENTITY
```

**To find your certificate identity name:**
```bash
security find-identity -v -p codesigning
```
Look for the "Developer ID Application" line and copy the full quoted name.

#### Required Secrets for Notarization:

```bash
# App Store Connect API key (base64-encoded .p8 file from Step 4)
gh secret set APPLE_API_KEY_PRIVATE_BASE64

# Key ID from App Store Connect (e.g., "ABC123DEFG")
gh secret set APPLE_API_KEY_ID

# Issuer ID from App Store Connect (UUID format)
gh secret set APPLE_API_KEY_ISSUER_ID

# (Optional) Your Apple Developer Team ID (10-character alphanumeric)
gh secret set APPLE_TEAM_ID
```

#### Optional Debug Secret:

```bash
# Set to 'true' to enable debug output showing available signing identities
# Only enable when troubleshooting - may leak identity names in logs
gh secret set DEBUG_CODESIGN --body "false"
```

### Step 6: Trigger a Build

Once all secrets are configured:

1. Go to **Actions** tab in the GitHub repository
2. Select the **"Build & Package macOS"** workflow
3. Click **"Run workflow"** → **"Run workflow"**
4. The workflow will:
   - Import your code signing certificate
   - Build and sign the app
   - Create .dmg and .pkg installers
   - Notarize the installers with Apple
   - Upload artifacts (or attach to GitHub Release if triggered by a release event)

For release builds, create a new release in GitHub and the workflow will automatically run and attach the signed installers.

### Verification

After a successful build:
1. Download the `.pkg` installer
2. Double-click to run - it should open without Gatekeeper warnings
3. The app should show as "verified" when checking code signature:
   ```bash
   codesign -vv /Applications/SYNC\ Desktop.app
   spctl -a -vv /Applications/SYNC\ Desktop.app
   ```

### Troubleshooting

**"security: SecKeychainItemImport: The passphrase is incorrect"**
- Verify P12_PASSWORD matches the password you set when exporting the certificate

**"No identity found"**
- Run `security find-identity -v -p codesigning` locally to verify the certificate is installed
- Ensure APPLE_P12_BASE64 contains the full base64-encoded .p12 file
- Check that MAC_SIGNING_IDENTITY exactly matches the certificate name in Keychain

**"Unable to notarize app"**
- Verify APPLE_API_KEY_ID matches the Key ID from App Store Connect
- Ensure APPLE_API_KEY_ISSUER_ID is the correct Issuer ID (UUID format)
- Check that the .p8 file was encoded correctly

**Build succeeds but no .pkg file created**
- Ensure `pkg` is listed in the `mac.target` array in `package.json` or `electron-builder.yml`

### Security Reminders

⚠️ **NEVER commit the following to source control:**
- `.p12` certificate files
- `.p8` API key files  
- Private keys of any kind
- Passwords or passphrases

These values should **only** exist as GitHub Secrets or in your local secure storage (Keychain, password manager, etc.).

---

### Summary of Required Secrets

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `APPLE_P12_BASE64` | Base64-encoded Developer ID Application certificate + private key | Export from Keychain Access as .p12, then `openssl base64 -in cert.p12 -A` |
| `P12_PASSWORD` | Password for the .p12 file | Set when exporting from Keychain Access |
| `KEYCHAIN_PASSWORD` | Temporary password for CI build keychain | Choose any secure random string |
| `MAC_SIGNING_IDENTITY` | Certificate common name | Run `security find-identity -v -p codesigning` and copy the quoted name |
| `APPLE_API_KEY_PRIVATE_BASE64` | Base64-encoded App Store Connect API private key | Download .p8 from App Store Connect, then `openssl base64 -in AuthKey_XXX.p8 -A` |
| `APPLE_API_KEY_ID` | App Store Connect API Key ID | From App Store Connect API Keys page |
| `APPLE_API_KEY_ISSUER_ID` | App Store Connect Issuer ID | From App Store Connect API Keys page (UUID at top) |
| `APPLE_TEAM_ID` | Apple Developer Team ID (optional) | From Apple Developer account |
| `DEBUG_CODESIGN` | Set to `'true'` to enable debug output | Set manually when troubleshooting |

---
