# Fix Summary: Notarization and GitHub Workflow Issues

This document summarizes the changes made to fix logical errors in notarize.js and GitHub workflow issues.

## Changes Made

### 1. scripts/notarize.js - Enhanced Authentication Logic

**Problem:** The script only supported Apple ID authentication method and didn't provide clear guidance when credentials were missing.

**Solution:**
- Added support for both authentication methods:
  - **Method 1 (Apple ID - legacy):** APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
  - **Method 2 (API Key - recommended for CI/CD):** APPLE_API_KEY_PATH, APPLE_API_KEY_ID, APPLE_API_KEY_ISSUER_ID, APPLE_TEAM_ID
- Improved console messages with specific format requirements and examples
- Cleanly separated authentication detection logic:
  - `hasAppleIdAuth` - checks if all Apple ID credentials are present
  - `hasApiKeyAuth` - checks if all API Key credentials are present
  - If neither: shows helpful message with both methods
  - If both: prefers API Key method (more reliable for CI/CD)
- Updated header comments to document both authentication methods

**Key Features:**
- API Key authentication takes precedence when both methods are available
- Clear, actionable error messages with specific examples
- Consistent debug comments throughout

### 2. .github/workflows/build-macos.yml - Fixed Secret Conditionals

**Problem:** The workflow was trying to check secrets directly in `if` conditions, which doesn't work in GitHub Actions (secrets are not available in the `if` context).

**Solution:**
- Added setup steps that convert secrets to environment variables:
  - "Setup Apple signing" - sets `HAVE_APPLE_P12` env var
  - "Setup Apple API key flag" - sets `HAVE_APPLE_API_KEY` env var
- Updated all conditional steps to use environment variables instead:
  - Line 45: `if: ${{ env.HAVE_APPLE_P12 == 'true' }}`
  - Line 81: `if: ${{ env.HAVE_APPLE_API_KEY == 'true' }}`
  - Line 104: `if: ${{ env.HAVE_APPLE_API_KEY == 'true' }}`
- Added `APPLE_TEAM_ID` to notarization step env vars (required by notarize.js)
- Fixed formatting issues (missing newlines after `if` statements)

**Why This Works:**
GitHub Actions secrets cannot be checked directly in `if` conditions for security reasons. The solution uses a two-step approach:
1. Setup step: Evaluates secret existence and sets an environment variable
2. Conditional step: Uses the environment variable in the `if` condition

### 3. electron-builder.yml - Added .pkg Target

**Problem:** The .pkg target was missing from electron-builder.yml (though it was present in package.json).

**Solution:**
- Added .pkg target for both x64 and arm64 architectures
- Maintains consistency between package.json and electron-builder.yml
- Ensures .dmg, .zip, and .pkg are all built for macOS

**Note:** The .zip target was already present in both files and provides portable app compatibility for users who prefer it over disk images.

### 4. package.json - Verification

**Status:** ✅ No changes needed
- .zip target is present alongside .dmg and .pkg (lines 69-71)
- This maintains compatibility for users who prefer portable apps

## Validation

Created `scripts/validate-notarize.js` to test all authentication scenarios:
- ✅ Non-macOS platform detection
- ✅ SKIP_NOTARIZE flag handling
- ✅ No credentials scenario
- ✅ Partial Apple ID credentials
- ✅ Partial API Key credentials
- ✅ Both authentication methods (prefers API Key)

All validation tests pass successfully.

## Testing Recommendations

1. **Local Testing:**
   ```bash
   # Validate notarize.js logic
   node scripts/validate-notarize.js
   
   # Validate YAML syntax
   js-yaml .github/workflows/build-macos.yml
   ```

2. **CI Testing:**
   - Trigger workflow_dispatch without secrets (should skip signing/notarization)
   - Trigger workflow_dispatch with only signing secrets (should sign but skip notarization)
   - Trigger workflow_dispatch with all secrets (should sign and notarize)

3. **Build Testing:**
   ```bash
   # Test macOS packaging
   npm run build
   npm run package:mac
   
   # Verify all three formats are created
   ls -lh release/*.{dmg,zip,pkg}
   ```

## Files Changed

1. `scripts/notarize.js` - Authentication logic enhancement
2. `.github/workflows/build-macos.yml` - Fixed secret conditionals
3. `electron-builder.yml` - Added .pkg target
4. `scripts/validate-notarize.js` - New validation script (can be removed after merge)

## Migration Guide

No migration needed for existing users. The changes are backward compatible:
- Old workflows using Apple ID authentication will continue to work
- New workflows can use API Key authentication
- Missing credentials will show clear guidance instead of cryptic errors
