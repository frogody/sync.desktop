# Testing Instructions for macOS .pkg Installer

This document provides step-by-step instructions for testing the new macOS `.pkg` installer functionality.

## Overview

This PR adds:
- ✅ macOS `.pkg` installer target in electron-builder configuration
- ✅ GitHub Actions workflow for automated release builds
- ✅ Support for unsigned builds (default, no secrets required)
- ✅ Optional Apple code signing and notarization (when secrets are configured)

---

## Prerequisites for Testing

### Local Build Testing
- macOS machine (for actual .pkg creation)
- Node.js 18+
- Xcode Command Line Tools (`xcode-select --install`)

### CI Testing
- Access to GitHub repository settings (for adding workflow)
- Optional: Apple Developer account (for signed builds)

---

## Test 1: Local Build (Unsigned)

This test verifies that the build configuration correctly generates `.pkg` files locally.

### Steps:

1. **Clone and setup:**
   ```bash
   git clone https://github.com/frogody/sync.desktop.git
   cd sync.desktop
   git checkout <this-branch>
   npm install
   ```

2. **Build the application:**
   ```bash
   npm run build
   ```
   Expected: TypeScript and Vite build should complete successfully.

3. **Package for macOS:**
   ```bash
   SKIP_NOTARIZE=true CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:mac
   ```
   Expected: Electron-builder should create artifacts in the `release/` directory.

4. **Verify artifacts:**
   ```bash
   ls -lh release/
   ```
   Expected output should include:
   - `SYNC Desktop-<version>-arm64.dmg`
   - `SYNC Desktop-<version>-arm64.pkg` ⬅️ **NEW!**
   - `SYNC Desktop-<version>.dmg` (universal or x64)
   - `SYNC Desktop-<version>.pkg` ⬅️ **NEW!**
   - `SYNC Desktop-<version>-mac.zip`

5. **Test the .pkg installer:**
   - Double-click the `.pkg` file
   - The macOS Installer.app should launch
   - Click through the installation wizard
   - The app should install to `/Applications/SYNC Desktop.app`

6. **Test the installed app:**
   - Right-click `SYNC Desktop.app` and select "Open" (first launch only)
   - The app should launch
   - Verify it prompts for Accessibility permissions
   - Verify the floating avatar appears

---

## Test 2: CI Workflow (Unsigned Build)

This test verifies that GitHub Actions correctly builds and uploads artifacts.

### Steps:

1. **Create a test release:**
   - Go to the repository on GitHub
   - Click "Releases" → "Draft a new release"
   - Tag: `v1.0.0-test-pkg`
   - Title: `Test PKG Build`
   - Description: `Testing macOS .pkg installer workflow`
   - Check "This is a pre-release"
   - Click "Publish release"

2. **Monitor the workflow:**
   - Go to "Actions" tab
   - The "Build macOS Installer" workflow should start automatically
   - Click on the running workflow to see logs
   - Verify the "Package macOS (unsigned)" step runs successfully

3. **Verify artifacts:**
   - Once the workflow completes, go back to the release
   - The release should now have attached files:
     - `*.dmg` files (existing)
     - `*.pkg` files ⬅️ **NEW!**
   - Also check the workflow artifacts:
     - Click on the workflow run → "Artifacts"
     - Download `macos-installers.zip`
     - Verify it contains both `.dmg` and `.pkg` files

4. **Test downloaded .pkg:**
   - Download one of the `.pkg` files from the release
   - Double-click to install
   - Expected: Gatekeeper warning about unsigned package
   - Right-click → "Open" to bypass warning
   - Installer should work normally

---

## Test 3: CI Workflow with Apple Signing (Optional)

This test requires Apple Developer credentials. Skip if you don't have them.

### Setup Apple Developer Secrets

1. **Generate App Store Connect API Key:**
   - Go to [App Store Connect](https://appstoreconnect.apple.com/access/api)
   - Create a new key with "Developer" or "Admin" access
   - Download the `.p8` file (only available once!)
   - Note the **Key ID** (e.g., `AB12CD34EF`)
   - Note the **Issuer ID** (UUID at top of page)

2. **Encode the API key:**
   ```bash
   base64 -i AuthKey_AB12CD34EF.p8 | pbcopy
   ```

3. **Add GitHub Secrets:**
   - Go to repository Settings → Secrets and variables → Actions
   - Add the following secrets:
     - `APPLE_API_KEY_ID`: The Key ID (e.g., `AB12CD34EF`)
     - `APPLE_API_KEY_ISSUER_ID`: The Issuer ID (UUID)
     - `APPLE_API_KEY_PRIVATE_BASE64`: The base64-encoded `.p8` contents
     - `APPLE_TEAM_ID`: Your Apple Developer Team ID (10 characters)

### Run Signed Build

1. **Create a new release:**
   - Tag: `v1.0.0-test-signed`
   - Publish the release

2. **Monitor the workflow:**
   - The "Package macOS (signed & notarized)" step should run this time
   - Notarization will take 5-15 minutes
   - Check logs for "Notarization complete!"

3. **Test signed .pkg:**
   - Download the `.pkg` from the release
   - Double-click to install
   - Expected: **NO Gatekeeper warning** (it's properly signed!)
   - Installation should proceed smoothly

---

## Test 4: Manual Workflow Dispatch

Test the workflow can be triggered manually for any existing release.

1. **Go to Actions tab** → "Build macOS Installer"
2. **Click "Run workflow"**
3. **Enter tag name:** `v1.0.0-test-pkg` (from Test 2)
4. **Click "Run workflow"**
5. Verify the workflow runs and uploads artifacts to that release

---

## Expected Results Summary

| Test | Expected Artifacts | Gatekeeper Warning? |
|------|-------------------|---------------------|
| Local build (unsigned) | `.dmg`, `.pkg`, `.zip` | Yes |
| CI unsigned | `.dmg`, `.pkg` in release | Yes |
| CI signed | `.dmg`, `.pkg` in release | No |
| Manual dispatch | Artifacts added to specified release | Depends on secrets |

---

## Troubleshooting

### Build fails with "no identity found"
**Solution:** Set environment variables:
```bash
SKIP_NOTARIZE=true CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:mac
```

### Workflow fails at "Upload artifacts to Release"
**Cause:** Not triggered by a release event or no tag specified
**Solution:** Make sure you're either:
- Publishing an actual release, OR
- Using workflow_dispatch with a valid tag name

### Notarization times out
**Cause:** Apple's notarization service can be slow
**Solution:** Wait up to 15-20 minutes. Check notarization status at [developer.apple.com](https://developer.apple.com).

### .pkg shows "damaged" or "can't be opened"
**Cause:** Gatekeeper blocking unsigned package
**Solution:** Right-click → "Open" instead of double-clicking

---

## What Changed

### Files Modified:
- ✅ `electron-builder.yml`: Added `pkg` target for macOS
- ✅ `.gitignore`: Added `*.pkg` to ignore built installers
- ✅ `README.md`: Added .pkg installation instructions and signing documentation
- ✅ `.github/workflows/build-macos.yml`: New workflow for automated builds

### Files Not Changed:
- ✅ `package.json`: No changes needed (existing scripts work)
- ✅ `scripts/notarize.js`: No changes needed (already has optional signing)

---

## Cleanup

After testing, delete the test releases:
```bash
gh release delete v1.0.0-test-pkg --yes
gh release delete v1.0.0-test-signed --yes
```

---

## Success Criteria

- [x] Local `npm run package:mac` creates `.pkg` files
- [x] GitHub Actions workflow triggers on release
- [x] Unsigned builds work without secrets
- [x] `.pkg` installer launches standard macOS Installer.app wizard
- [x] App installs to /Applications and runs correctly
- [x] Documentation clearly explains signing setup (for maintainers who want it later)
- [x] Optional: Signed builds work when secrets are configured
