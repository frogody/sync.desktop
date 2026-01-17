# Release Process for SYNC Desktop

This guide explains how to create and publish new releases of SYNC Desktop with automated macOS installer builds.

## Overview

When you create a GitHub Release, the automated workflow (`.github/workflows/build-macos.yml`) will:
1. Build the application from source
2. Create `.dmg` and `.pkg` installers for macOS (both Intel and Apple Silicon)
3. Automatically attach the installers to the release
4. Optionally sign and notarize (if Apple Developer credentials are configured)

---

## Quick Release (Recommended)

### 1. Create a New Release

1. Go to [Releases](https://github.com/frogody/sync.desktop/releases) on GitHub
2. Click **"Draft a new release"**
3. Click **"Choose a tag"** and create a new tag:
   - Format: `v1.0.0` (semantic versioning)
   - Target: `main` branch (or your release branch)
4. Fill in release details:
   - **Release title**: `SYNC Desktop v1.0.0` (or your version)
   - **Description**: What's new in this release
5. Check **"Set as the latest release"** (if this is the newest stable version)
6. Click **"Publish release"**

### 2. Wait for Build

- The workflow starts automatically
- Go to the **Actions** tab to monitor progress
- Build typically takes 5-10 minutes
- If signing is enabled, notarization adds 5-15 minutes

### 3. Verify Release Assets

Once the workflow completes, your release will have:
- `SYNC-Desktop-vX.X.X-macOS.dmg` (or similar naming)
- `SYNC-Desktop-vX.X.X-macOS.pkg` ✨ **NEW!**
- Possibly architecture-specific variants (arm64, x64)

---

## Manual Workflow Trigger

You can also manually trigger the build workflow for an existing release:

1. Go to **Actions** → **"Build macOS Installer"**
2. Click **"Run workflow"**
3. Enter the tag name (e.g., `v1.0.0`)
4. Click **"Run workflow"**
5. The build will run and attach artifacts to the specified release

---

## Pre-Release vs Stable Release

### Pre-Release (Beta/RC)
- Check **"Set as a pre-release"**
- Tag format: `v1.0.0-beta.1` or `v1.0.0-rc.1`
- Won't trigger auto-update for stable users
- Good for testing before stable release

### Stable Release
- Check **"Set as the latest release"**
- Tag format: `v1.0.0`
- Triggers auto-update for users on update channel
- Should be production-ready

---

## Version Numbering

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version (`1.0.0` → `2.0.0`): Breaking changes, major new features
- **MINOR** version (`1.0.0` → `1.1.0`): New features, backwards compatible
- **PATCH** version (`1.0.0` → `1.0.1`): Bug fixes, minor improvements

### Pre-release Tags
- Alpha: `v1.0.0-alpha.1`
- Beta: `v1.0.0-beta.1`
- Release Candidate: `v1.0.0-rc.1`

---

## Code Signing Status

### Unsigned Builds (Default)

If Apple Developer credentials are NOT configured:
- ✅ Builds succeed and produce installers
- ⚠️ Users see Gatekeeper warnings when installing
- ℹ️ Users must right-click and select "Open" to bypass warning
- ℹ️ Works fine, just slightly less convenient for users

### Signed & Notarized Builds (Recommended)

If Apple Developer credentials ARE configured:
- ✅ Builds succeed and produce installers
- ✅ Installers are code-signed with Developer ID
- ✅ Installers are notarized by Apple
- ✅ Users can double-click to install (no warnings!)
- ✅ Best user experience

To enable signing, see the **"Apple Code Signing & Notarization"** section in `README.md`.

---

## Troubleshooting

### Workflow doesn't start
- **Cause**: Workflow only runs on release events
- **Solution**: Make sure you clicked "Publish release" (not "Save draft")

### No artifacts attached to release
- **Cause**: Workflow failed or is still running
- **Solution**: Check the Actions tab for errors

### Build fails with "no identity found"
- **Cause**: Code signing is attempting but no credentials configured
- **Solution**: Either:
  - Add Apple Developer secrets (see README.md), OR
  - The workflow should automatically use unsigned build path

### Notarization fails
- **Cause**: Invalid Apple credentials or expired certificate
- **Solution**: 
  - Verify secrets are correct
  - Check that App Store Connect API Key is still valid
  - Ensure APPLE_TEAM_ID matches your Developer account

### Wrong version number in filename
- **Cause**: Version in `package.json` doesn't match tag
- **Solution**: Update `package.json` version before creating release

---

## Best Practices

1. **Update `package.json` version** before creating release tag
2. **Test locally** before creating release:
   ```bash
   npm run build
   npm run package:mac
   ```
3. **Write clear release notes** with:
   - What's new
   - Bug fixes
   - Breaking changes (if any)
   - Known issues
4. **Use pre-releases** for testing
5. **Keep release tags** - never delete and recreate same tag
6. **Sign releases** for best user experience (configure Apple credentials)

---

## Example Release Notes Template

```markdown
## What's New in v1.2.0

### New Features
- 🎉 Added automatic daily journal generation
- ✨ Improved focus score calculation
- 📊 New productivity insights dashboard

### Bug Fixes
- Fixed crash when switching between apps quickly
- Resolved issue with screen capture on external displays
- Fixed timezone handling in activity logs

### Improvements
- Faster cloud sync (50% reduction in upload time)
- Better error messages for permission issues
- Reduced memory usage by 20%

### Breaking Changes
None

### Known Issues
- Voice mode may not work on macOS 11 (investigating)

---

## Installation

**macOS:**
- Download `.pkg` for guided installer (recommended)
- Download `.dmg` for drag-to-Applications installation

**Windows:**
- Download `.exe` installer

See the [Installation Guide](https://github.com/frogody/sync.desktop#installation) for details.
```

---

## Release Checklist

Before publishing a release:

- [ ] Version bumped in `package.json`
- [ ] Changelog/release notes prepared
- [ ] Local build and tests pass
- [ ] Breaking changes documented (if any)
- [ ] Screenshots updated (if UI changed)
- [ ] Migration guide provided (if needed)
- [ ] Team notified

After publishing:

- [ ] Workflow completed successfully
- [ ] Artifacts attached to release
- [ ] Download and test installers
- [ ] Announce release (Twitter, blog, etc.)
- [ ] Update documentation site (if applicable)

---

## Auto-Updates

SYNC Desktop uses `electron-updater` to check for new releases. When you publish a new stable release:

1. Users' apps will check for updates (every 4 hours by default)
2. If a newer version is found, they'll see an update notification
3. User clicks "Update" → app downloads and installs the new version
4. App restarts with the new version

**Note**: Pre-releases don't trigger auto-updates for stable users.

---

## Questions?

For issues with the release process, open an issue on GitHub or contact the maintainers.
