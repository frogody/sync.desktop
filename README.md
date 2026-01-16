# SYNC Desktop

Desktop companion app for [app.isyncso.com](https://app.isyncso.com) - Activity tracking and AI assistant.

## Download

Download the latest version from [GitHub Releases](https://github.com/frogody/sync.desktop/releases):

- **macOS**: Download the `.dmg` file (Universal - works on Intel and Apple Silicon)
- **Windows**: Download the `.exe` installer or portable version

The app automatically checks for updates and will prompt you when a new version is available. You can also manually check via the menu bar icon → "Check for Updates..."

## Features

- **Floating Avatar** - Always-on-top SYNC avatar
  - 1 click → Open chat
  - 2 clicks → Open voice mode
  - 3 clicks → Open web app
- **Activity Tracking** - Monitors active apps and windows
- **Context Memory** - Detailed 10-minute rolling context
- **Daily Journals** - Auto-generated activity summaries
- **Chat & Voice** - Full SYNC agent capabilities

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# In a separate terminal, start Electron
npm run electron:dev
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

## Creating a Release

1. Update version in `package.json`
2. Build for all platforms: `npm run package`
3. Create a GitHub Release with the new version tag (e.g., `v1.0.1`)
4. Upload the built artifacts from `release/`:
   - `SYNC Desktop-{version}-arm64.dmg` (macOS Apple Silicon)
   - `SYNC Desktop-{version}-x64.dmg` (macOS Intel)
   - `SYNC Desktop Setup {version}.exe` (Windows installer)
   - `SYNC Desktop {version}.exe` (Windows portable)
5. The app's auto-updater will detect the new release

## Project Structure

```
sync-desktop/
├── src/
│   ├── main/           # Electron main process
│   │   ├── windows/    # Window management
│   │   ├── services/   # Activity tracking, sync
│   │   ├── db/         # SQLite database
│   │   ├── ipc/        # IPC handlers
│   │   └── tray/       # System tray
│   ├── renderer/       # React UI
│   │   ├── components/ # Avatar, Chat, Voice
│   │   └── hooks/      # Custom hooks
│   ├── preload/        # Context bridge
│   └── shared/         # Shared types & constants
├── assets/             # Icons, sounds
└── build/              # Build config
```

## Permissions Required

### macOS
- **Accessibility** - Required for window tracking (`active-win`)
- **Microphone** - Required for voice mode

### Windows
- No special permissions needed

## Tech Stack

- Electron 34+
- React 18
- TypeScript
- Vite
- Tailwind CSS
- better-sqlite3
- active-win

## License

MIT
