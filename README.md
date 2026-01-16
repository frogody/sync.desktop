# SYNC Desktop

Desktop companion app for [app.isyncso.com](https://app.isyncso.com) - Activity tracking and AI assistant.

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
