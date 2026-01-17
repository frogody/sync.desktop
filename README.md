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
| macOS (Apple Silicon & Intel) | `.dmg` file or `.pkg` installer |
| Windows | `.exe` installer |

### macOS Installation

#### Option 1: DMG (Drag & Drop)
1. Download the `.dmg` file
2. Open the DMG and drag SYNC Desktop to Applications
3. On first launch, right-click the app and select "Open" (required for non-App Store apps)
4. Grant Accessibility permission when prompted (required for activity tracking)
5. Optionally grant Screen Recording permission for Deep Context features

#### Option 2: macOS Plug & Play Installer (.pkg)
The `.pkg` installer provides a more traditional macOS installation experience with automatic placement in the Applications folder.

**Installation Steps:**
1. Download the `.pkg` file from [GitHub Releases](https://github.com/frogody/sync.desktop/releases)
2. Double-click the `.pkg` file to launch the installer
3. Follow the installation wizard (Introduction → Destination → Installation)
4. Enter your password when prompted for system-level installation
5. Click "Close" when installation completes
6. Launch SYNC Desktop from Applications or Spotlight
7. Grant Accessibility permission when prompted (required for activity tracking)
8. Optionally grant Screen Recording permission for Deep Context features

**Benefits of .pkg installer:**
- ✅ Automatic installation to `/Applications`
- ✅ System-level package management (visible in System Preferences → Profiles on newer macOS)
- ✅ Easier deployment for enterprise/MDM environments
- ✅ Cleaner uninstallation via package managers

**Note:** If the app is unsigned, you may need to right-click and select "Open" on first launch, or go to System Preferences → Security & Privacy to allow the app to run.

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

### Code Signing & Notarization (macOS)

SYNC Desktop supports optional code signing and notarization for macOS builds. This is **not required** for development, but is necessary for distribution to end users to avoid security warnings.

#### Prerequisites

You need an **Apple Developer Account** ($99/year) to sign and notarize macOS applications.

#### Setting Up Signing & Notarization

**Step 1: Generate Required Credentials**

1. **App-Specific Password:**
   - Go to [appleid.apple.com](https://appleid.apple.com)
   - Sign in with your Apple ID
   - Go to "Security" → "App-Specific Passwords"
   - Click "Generate Password" and name it (e.g., "SYNC Desktop Notarization")
   - Save the generated password securely

2. **Apple API Key (for notarization):**
   - Go to [App Store Connect → Keys](https://appstoreconnect.apple.com/access/api)
   - Click "+" to create a new key
   - Name: "SYNC Desktop Notarization"
   - Access: "Admin" or "App Manager"
   - Download the `.p8` file (can only be downloaded once!)
   - Note the **Key ID** (e.g., `ABC123XYZ`) and **Issuer ID** (found at top of page)

3. **Code Signing Certificate:**
   - Open Xcode on your Mac
   - Go to Preferences → Accounts → Manage Certificates
   - Click "+" and create a "Developer ID Application" certificate
   - Export the certificate (right-click → Export) as a `.p12` file with a password

**Step 2: Encode Credentials for GitHub Secrets**

```bash
# Base64-encode the Apple API Key (.p8 file)
base64 -i AuthKey_ABC123XYZ.p8 | pbcopy
# The base64 string is now in your clipboard

# Base64-encode the code signing certificate (.p12 file)
base64 -i certificate.p12 | pbcopy
# The base64 string is now in your clipboard
```

**Step 3: Add GitHub Repository Secrets**

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add the following secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `APPLE_ID` | `your.email@example.com` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | `xxxx-xxxx-xxxx-xxxx` | App-specific password from Step 1 |
| `APPLE_TEAM_ID` | `ABCDE12345` | Your Apple Developer Team ID (find in developer.apple.com) |
| `APPLE_API_KEY_ID` | `ABC123XYZ` | Key ID from the .p8 file name |
| `APPLE_API_ISSUER` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Issuer ID from App Store Connect |
| `APPLE_API_KEY_PRIVATE_BASE64` | `LS0tLS1CRUdJTi...` | Base64-encoded .p8 file content |
| `CSC_LINK` | `MIIJ...` | Base64-encoded .p12 certificate |
| `CSC_KEY_PASSWORD` | `your-certificate-password` | Password for the .p12 certificate |

**Step 4: Trigger Signed Build**

Once the secrets are configured, the GitHub Actions workflow will automatically:
1. Detect the presence of signing secrets
2. Decode and prepare the Apple API key
3. Sign the application with your Developer ID certificate
4. Notarize the app with Apple (for Gatekeeper approval)
5. Upload signed `.dmg` and `.pkg` files to the GitHub Release

**Testing Locally (Optional)**

To test signing locally, set environment variables:

```bash
export APPLE_ID="your.email@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABCDE12345"
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="your-certificate-password"

npm run package:mac
```

**Unsigned Builds**

If the secrets are not configured, the workflow will automatically build **unsigned** versions. These work fine for development and testing, but users will see a warning on first launch.

To explicitly skip notarization:

```bash
export SKIP_NOTARIZE=true
npm run package:mac
```

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
