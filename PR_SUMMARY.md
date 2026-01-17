# Pull Request: Add macOS .pkg Installer with CI Packaging

## Summary

This PR adds plug-and-play macOS installer support (`.pkg` format) with automated GitHub Actions CI builds. Users can now double-click a `.pkg` file to install SYNC Desktop through the standard macOS Installer.app GUI wizard, instead of dragging from a DMG or using Terminal commands.

## What's Changed

### Core Changes

1. **electron-builder.yml** - Added `pkg` target for macOS builds
   - Builds both x64 and arm64 architectures
   - Uses existing signing/notarization configuration

2. **.github/workflows/build-macos.yml** (NEW) - Automated release builds
   - Triggers on GitHub Release creation
   - Can be manually triggered via workflow_dispatch
   - Produces **unsigned** builds by default (no secrets required)
   - Optionally signs + notarizes when Apple Developer secrets are configured
   - Uploads both `.dmg` and `.pkg` to release assets

3. **.gitignore** - Added `*.pkg` to ignore built installers

### Documentation

4. **README.md** - Updated installation section
   - Added "Plug & Play Installer (.pkg)" as recommended option
   - Documented Gatekeeper warnings for unsigned builds
   - Added comprehensive Apple signing/notarization setup guide

5. **PR_TESTING.md** (NEW) - Step-by-step testing instructions
   - Local build testing
   - CI workflow testing
   - Signed build testing (optional)
   - Troubleshooting guide

6. **RELEASE_PROCESS.md** (NEW) - Release workflow guide
   - How to create releases
   - Version numbering conventions
   - Code signing status explanation
   - Release checklist

7. **CI_BUILD_NOTES.md** - Added macOS workflow documentation
   - Explained the new build-macos.yml workflow
   - Documented signing/notarization secrets

## Key Features

### ✅ Works Out of the Box
- No Apple Developer account required for basic usage
- Creates unsigned installers that work (with Gatekeeper warnings)
- Users can right-click → "Open" to bypass warnings

### ✅ Optional Apple Signing
- When secrets are added, builds are automatically signed & notarized
- Zero Gatekeeper warnings for users
- Professional installation experience
- Clear documentation for setup

### ✅ Flexible Triggers
- Automatic: Runs on every GitHub Release
- Manual: Can trigger for any existing release tag

### ✅ Comprehensive Documentation
- Testing instructions for maintainers
- Release process guide
- Troubleshooting tips
- Code signing setup guide

## Testing

See `PR_TESTING.md` for complete testing instructions.

### Quick Test (Local)
```bash
npm install
npm run build
SKIP_NOTARIZE=true CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:mac
ls -lh release/  # Should show .dmg and .pkg files
```

### Quick Test (CI)
1. Create a test release with tag `v1.0.0-test`
2. Watch the "Build macOS Installer" workflow run
3. Verify `.dmg` and `.pkg` files are attached to the release

## Migration Notes

### For End Users
- No changes needed
- `.dmg` still available for traditional installation
- `.pkg` is now the recommended option (easier)

### For Maintainers
- Unsigned builds work immediately (no setup required)
- To enable signing, add 4 secrets to the repository (see README.md)
- Existing scripts/notarize.js is reused (no changes needed)

## Files Changed

```
Modified:
  .gitignore                      (+1 line)
  electron-builder.yml            (+4 lines - pkg target)
  README.md                       (+50 lines - installation + signing docs)
  CI_BUILD_NOTES.md              (+15 lines - workflow info)

Added:
  .github/workflows/build-macos.yml  (132 lines - CI workflow)
  PR_TESTING.md                      (253 lines - testing guide)
  RELEASE_PROCESS.md                 (232 lines - release guide)
```

## Screenshots

N/A - This is a build/CI enhancement, no UI changes.

## Breaking Changes

None. This is purely additive.

## Checklist

- [x] electron-builder configured for pkg builds
- [x] GitHub Actions workflow created and validated
- [x] Unsigned build path working (default)
- [x] Conditional signing path implemented (optional)
- [x] README updated with installation instructions
- [x] Signing/notarization documentation added
- [x] Testing guide created (PR_TESTING.md)
- [x] Release process guide created (RELEASE_PROCESS.md)
- [x] .gitignore updated
- [x] Local builds tested (dependencies + build + config)
- [x] YAML syntax validated

## Next Steps for Maintainers

### To Use Unsigned Builds (Immediate)
1. Merge this PR
2. Create a GitHub Release
3. Wait 5-10 minutes for the workflow
4. `.pkg` files will be attached to the release

### To Enable Signed Builds (Optional)
1. Follow the guide in README.md → "Apple Code Signing & Notarization"
2. Generate App Store Connect API Key
3. Add 4 secrets to the repository
4. Next release will be signed & notarized automatically

## Questions?

See `PR_TESTING.md` for testing instructions or `RELEASE_PROCESS.md` for release workflow.
