# CI/CD Build Notes for SYNC Desktop

This document provides specific guidance for building SYNC Desktop in CI/CD environments.

## Native Module Dependencies

SYNC Desktop uses two native Node.js modules that require compilation:

### 1. better-sqlite3
- **Purpose**: High-performance SQLite database for the transport queue
- **Build Requirements**: C++ compiler, Python 3.x
- **Critical**: Required for transport layer to function

### 2. keytar
- **Purpose**: Secure API key storage in OS keychain
- **Build Requirements**: OS-specific keychain libraries
- **Fallback**: Automatically falls back to electron-store if build fails

## Platform-Specific Setup

### macOS

**GitHub Actions:**
```yaml
- name: Setup Xcode
  uses: maxim-lobanov/setup-xcode@v1
  with:
    xcode-version: latest-stable

- name: Install dependencies
  run: npm install
```

**Xcode Command Line Tools** are usually pre-installed on GitHub Actions macOS runners.

### Windows

**GitHub Actions:**
```yaml
- name: Setup MSBuild
  uses: microsoft/setup-msbuild@v1

- name: Install dependencies
  run: npm install
```

**Visual Studio Build Tools** are pre-installed on GitHub Actions Windows runners.

**Alternative** (if build tools missing):
```yaml
- name: Install Windows Build Tools
  run: npm install --global windows-build-tools
  
- name: Install dependencies
  run: npm install
```

### Linux (Ubuntu/Debian)

**GitHub Actions:**
```yaml
- name: Install build dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y build-essential libsecret-1-dev

- name: Install dependencies
  run: npm install
```

**Required packages:**
- `build-essential` - GCC, make, and other build tools
- `libsecret-1-dev` - GNOME keyring library (required for keytar)

### Linux (Fedora/RHEL/CentOS)

```yaml
- name: Install build dependencies
  run: |
    sudo dnf install -y gcc-c++ make libsecret-devel

- name: Install dependencies
  run: npm install
```

## Complete GitHub Actions Workflow

```yaml
name: Build SYNC Desktop

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm run test:run
      
      - name: Build
        run: npm run build
      
      - name: Package
        run: npm run package:mac

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm run test:run
      
      - name: Build
        run: npm run build
      
      - name: Package
        run: npm run package:win

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install build dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y build-essential libsecret-1-dev
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm run test:run
      
      - name: Build
        run: npm run build
```

## Troubleshooting

### "gyp ERR! build error" or "node-gyp rebuild failed"

**Cause**: Missing C++ build tools or Python

**Solution:**
- **macOS**: Install Xcode Command Line Tools: `xcode-select --install`
- **Windows**: Install Visual Studio Build Tools or windows-build-tools
- **Linux**: Install build-essential package

### "keytar" build fails

**Cause**: Missing OS keychain libraries (libsecret on Linux)

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install libsecret-1-dev

# Fedora/RHEL
sudo dnf install libsecret-devel
```

**Workaround**: The app will work without keytar - it falls back to electron-store for API key storage.

### "better-sqlite3" build fails

**Cause**: Missing C++ compiler or Python

**Critical**: This will prevent the transport layer from working.

**Solution:**
1. Ensure all build tools are installed (see platform-specific setup above)
2. Check Node.js version (requires 16+ for better-sqlite3 v11)
3. Try rebuilding manually: `npm rebuild better-sqlite3 --build-from-source`

### Electron version mismatch

**Cause**: Native modules built for Node.js but need to run in Electron

**Solution**: electron-builder automatically rebuilds modules during packaging. For development:
```bash
npm rebuild
```

## Testing Native Modules

After building, verify native modules loaded correctly:

```bash
# Run tests (includes native module tests)
npm run test:run

# Check if better-sqlite3 loads
node -e "require('better-sqlite3')"

# Check if keytar loads (will fail gracefully if not available)
node -e "try { require('keytar'); console.log('keytar OK'); } catch(e) { console.log('keytar unavailable - will use fallback'); }"
```

## Docker Build Example

```dockerfile
FROM node:18

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Build
RUN npm run build

# Run tests
RUN npm run test:run
```

## Performance Tips

### Cache node_modules

Speed up CI builds by caching `node_modules`:

```yaml
- name: Cache node_modules
  uses: actions/cache@v3
  with:
    path: node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-
```

### Parallel Builds

If building for multiple platforms, use matrix builds:

```yaml
jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      # ... build steps
```

## Security Notes

### API Keys in CI

The pairing module stores API keys securely. In CI environments:
- Tests use mock API keys
- Keytar may not be available (builds succeed with fallback)
- Never commit actual API keys to the repository

### Code Signing (macOS/Windows)

For production releases, code signing is handled in the dedicated release workflow.

#### macOS Release Builds

The repository includes a dedicated workflow (`.github/workflows/build-macos.yml`) that:
- Builds both `.dmg` and `.pkg` installers for macOS
- Runs automatically on GitHub Releases
- Can be manually triggered via workflow_dispatch
- Produces **unsigned** builds by default (no secrets required)
- Optionally signs and notarizes when Apple Developer credentials are provided

**To enable signed builds**, add these secrets to the repository:
- `APPLE_API_KEY_ID` - App Store Connect API Key ID
- `APPLE_API_KEY_ISSUER_ID` - API Key Issuer ID
- `APPLE_API_KEY_PRIVATE_BASE64` - Base64-encoded .p8 private key
- `APPLE_TEAM_ID` - Apple Developer Team ID

See `README.md` for detailed instructions on generating and encoding Apple credentials.

## Support

For build issues, check:
1. Node.js version (16+)
2. Python version (3.x for node-gyp)
3. Platform-specific build tools (see above)
4. electron-builder logs in `release/` directory
