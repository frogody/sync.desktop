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
