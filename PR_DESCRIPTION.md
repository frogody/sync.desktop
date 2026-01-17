# macOS .pkg Installer with Code Signing & Notarization

This PR adds comprehensive support for building macOS `.pkg` installers with **optional** code signing and notarization capabilities.

## 🎯 Overview

This implementation provides:
- ✅ **Plug-and-play unsigned .pkg installers** by default (works immediately, no Apple credentials needed)
- ✅ **Optional code signing & notarization** when Apple Developer credentials are configured
- ✅ **Dual distribution formats**: Both `.dmg` and `.pkg` files are built
- ✅ **Automated CI/CD workflow** for building macOS artifacts
- ✅ **Comprehensive documentation** for end-users and maintainers

## 📦 What Changed

### 1. Package Configuration (`package.json`)
- Added `pkg` to macOS build targets (alongside existing `dmg`)
- Added `artifactName` template for versioned filenames: `${productName}-${version}-${arch}.${ext}`
- Example output: `SYNC Desktop-1.0.0-arm64.pkg`

### 2. GitHub Actions Workflow (`.github/workflows/build-macos.yml`)
New automated workflow that:
- ✅ Triggers on `workflow_dispatch` (manual) and `release` events
- ✅ Builds on `macos-latest` with Node.js 18
- ✅ Installs dependencies and builds the app
- ✅ **Conditionally enables signing** when secrets are present
- ✅ Supports **App Store Connect API Key** (modern, recommended)
- ✅ Falls back to **Apple ID** notarization (legacy method)
- ✅ Uploads artifacts to GitHub Release (on release) or workflow artifacts (on manual trigger)
- ✅ Properly cleans up temporary signing files

### 3. Enhanced Notarization Script (`scripts/notarize.js`)
Updated to support two authentication methods:
- **App Store Connect API Key** (preferred): Uses `.p8` file
- **Apple ID method** (legacy): Uses Apple ID + app-specific password

### 4. Updated Documentation (`README.md`)
Added comprehensive sections:
- `.pkg` installer installation instructions
- Gatekeeper implications for unsigned vs signed builds
- Complete guide for setting up Apple Developer credentials
- Step-by-step secret configuration for GitHub Actions

## 🧪 Testing Instructions

### Test 1: Unsigned Build (No Secrets Required)

**Verify the workflow produces unsigned installers without any Apple credentials.**

1. **Trigger the workflow manually**:
   - Go to Actions → "Build macOS Artifacts" → "Run workflow"
   - Select branch: `feature/mac-pkg-installer-signed`
   - Click "Run workflow"

2. **Expected results**:
   - ✅ Workflow completes successfully
   - ✅ Artifacts appear in workflow run:
     - `SYNC Desktop-1.0.0-arm64.dmg`
     - `SYNC Desktop-1.0.0-arm64.pkg`
     - `SYNC Desktop-1.0.0-x64.dmg`
     - `SYNC Desktop-1.0.0-x64.pkg`
   - ✅ Console shows: "Skipping notarization - missing Apple credentials"

3. **Test the .pkg installer** (on macOS):
   - Download the `.pkg` file from workflow artifacts
   - Double-click to launch the macOS Installer
   - Follow installation wizard
   - App should install to `/Applications/SYNC Desktop.app`
   - On first launch, right-click app and select "Open" (Gatekeeper bypass)
   - Verify permission prompts for Accessibility and Screen Recording

### Test 2: Signed & Notarized Build (Requires Apple Developer Account)

**Verify full code signing and notarization when secrets are configured.**

#### Prerequisites Setup

1. **Get App Store Connect API Key**:
   ```bash
   # Go to https://appstoreconnect.apple.com/access/api
   # Create new API key with "Developer" access
   # Download the .p8 file (e.g., AuthKey_ABCD1234.p8)
   ```

2. **Export Developer ID Certificate**:
   ```bash
   # From Keychain Access:
   # - Find "Developer ID Application: Your Name (TEAM_ID)"
   # - Right-click → Export → Save as .p12 with password
   ```

3. **Encode files to base64**:
   ```bash
   # Encode the .p8 file
   base64 -i AuthKey_ABCD1234.p8 | pbcopy
   
   # Encode the .p12 certificate
   base64 -i certificate.p12 | pbcopy
   ```

#### Configure GitHub Secrets

Add these secrets at: `Settings → Secrets and variables → Actions → New repository secret`

| Secret Name | Value | Example |
|-------------|-------|---------|
| `APPLE_API_KEY_ID` | Your API Key ID | `ABCD1234` |
| `APPLE_API_KEY_ISSUER_ID` | Your Issuer ID | `12345678-1234-1234-1234-123456789012` |
| `APPLE_API_KEY_PRIVATE_BASE64` | Base64-encoded .p8 file | *(paste from clipboard)* |
| `APPLE_TEAM_ID` | Your Team ID | `A1B2C3D4E5` |
| `MAC_CERT_P12_BASE64` | Base64-encoded .p12 certificate | *(paste from clipboard)* |
| `MAC_CERT_PASSWORD` | Certificate password | *(password you set)* |

Optional (legacy method):
| Secret Name | Value |
|-------------|-------|
| `APPLE_ID` | Your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |

#### Run the Test

1. **Trigger the workflow**:
   - Actions → "Build macOS Artifacts" → "Run workflow"
   - Select branch: `feature/mac-pkg-installer-signed`
   - Click "Run workflow"

2. **Expected results**:
   - ✅ "Setup Apple signing" step succeeds
   - ✅ "Import Code Signing Certificate" step succeeds
   - ✅ Console shows: "Using App Store Connect API Key for notarization"
   - ✅ Notarization completes successfully
   - ✅ Signed artifacts uploaded

3. **Verify signed installer** (on macOS):
   - Download `.pkg` from workflow artifacts
   - Double-click to install
   - ✅ **No Gatekeeper warning** - installs smoothly
   - ✅ App launches without "unidentified developer" prompts
   
4. **Verify code signature**:
   ```bash
   # Check .pkg signature
   pkgutil --check-signature "SYNC Desktop-1.0.0-arm64.pkg"
   # Should show: "signed by Developer ID Installer: Your Name (TEAM_ID)"
   
   # Check app signature
   codesign -dv --verbose=4 "/Applications/SYNC Desktop.app"
   # Should show: "Developer ID Application: Your Name (TEAM_ID)"
   
   # Verify notarization
   spctl -a -vv "/Applications/SYNC Desktop.app"
   # Should show: "accepted" with "source=Notarized Developer ID"
   ```

### Test 3: Release Workflow

**Verify artifacts are automatically attached to GitHub releases.**

1. **Create a draft release**:
   ```bash
   # Via GitHub UI: Releases → Draft a new release
   # Tag: v1.0.1-test
   # Title: Test Release
   # Mark as draft
   # Publish
   ```

2. **Expected results**:
   - ✅ Workflow triggers automatically on release publish
   - ✅ Builds complete successfully
   - ✅ Release assets are automatically uploaded:
     - `SYNC Desktop-1.0.1-arm64.dmg`
     - `SYNC Desktop-1.0.1-arm64.pkg`
     - `SYNC Desktop-1.0.1-x64.dmg`
     - `SYNC Desktop-1.0.1-x64.pkg`

## 🔒 Security Notes

- ✅ **No secrets are committed to the repository**
- ✅ The `.p8` file is reconstructed from base64 at runtime and deleted after use
- ✅ Temporary keychains are created, used, and destroyed in the same workflow run
- ✅ All signing credentials are passed via GitHub Secrets (encrypted at rest)
- ✅ Certificate files are stored in `$RUNNER_TEMP` and cleaned up automatically

## 📝 Documentation Updates

Users will find:
- Clear instructions for both `.dmg` and `.pkg` installation methods
- Explanation of Gatekeeper behavior for unsigned vs signed builds
- Complete guide for maintainers to enable signing (optional)
- Command-line examples for encoding credentials

## 🎁 Benefits

### For End Users
- **Choice of installation method**: `.dmg` (drag-to-Applications) or `.pkg` (GUI installer)
- **Frictionless installs** when signed: No Gatekeeper warnings
- **Privacy-friendly**: Unsigned builds work fine with one extra click

### For Maintainers
- **Zero configuration required**: Unsigned builds work out-of-the-box
- **Easy signing setup**: Add secrets when ready, no code changes needed
- **Automated releases**: Artifacts auto-attach to GitHub releases
- **Manual builds**: Trigger workflow anytime via Actions tab

## ✅ Checklist

- [x] Package.json updated with pkg target
- [x] Artifact naming includes version and architecture
- [x] GitHub Actions workflow created and tested
- [x] Conditional signing logic implemented
- [x] Support for App Store Connect API Key
- [x] Fallback to Apple ID notarization
- [x] Certificate import with temporary keychain
- [x] Proper cleanup of signing artifacts
- [x] Upload to release on publish event
- [x] Upload to workflow artifacts on manual trigger
- [x] README.md updated with installation instructions
- [x] README.md updated with signing setup guide
- [x] Notarize.js enhanced with API key support
- [x] Security: No secrets in repository
- [x] Testing: Unsigned build workflow validated
- [x] Testing: Workflow syntax verified

## 🚀 Ready to Merge

This PR is ready for review and testing. The unsigned build workflow should work immediately. Maintainers can optionally add signing credentials to enable notarization for production releases.

---

**Questions or issues?** Please comment on this PR or reach out to @frogody.
