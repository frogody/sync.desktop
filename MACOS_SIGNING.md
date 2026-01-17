# macOS Code Signing and Notarization Setup

This document explains how to configure the GitHub Actions workflow to sign and notarize macOS builds of SYNC Desktop.

---

## Overview

The macOS build workflow (`.github/workflows/build-macos.yml`) supports optional code signing and notarization. When properly configured with Apple Developer credentials, it will:

1. **Import your codesigning certificate** from a base64-encoded .p12 file
2. **Sign the .app bundle** using electron-builder with your Developer ID Application certificate
3. **Create signed .dmg and .pkg installers**
4. **Notarize with Apple** using App Store Connect API credentials
5. **Upload artifacts** separately (.dmg and .pkg) for release events

All signing and notarization steps are **optional** - if credentials are not provided, the workflow will produce unsigned builds.

---

## Required Apple Developer Account Setup

### 1. Apple Developer Program Membership

You need an active [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year).

### 2. Certificates

You need a **Developer ID Application** certificate to sign apps for distribution outside the Mac App Store.

#### Creating the Certificate

1. Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
2. Click the **+** button to create a new certificate
3. Select **Developer ID Application** under "Software"
4. Follow the prompts to create a Certificate Signing Request (CSR) using Keychain Access on macOS
5. Upload the CSR and download the certificate (`.cer` file)
6. Double-click the `.cer` file to install it in your macOS Keychain

#### Exporting the Certificate as .p12

1. Open **Keychain Access** on macOS
2. Find your "Developer ID Application" certificate in the "My Certificates" section
3. Right-click the certificate and select **Export...**
4. Save as `.p12` format
5. Set a strong password (you'll need this for `P12_PASSWORD` secret)

**Example certificate name format:**
```
Developer ID Application: Your Company Name (TEAM_ID_HERE)
```

The exact name can be found by running:
```bash
security find-identity -v -p codesigning
```

### 3. App Store Connect API Key

For notarization, you need an App Store Connect API key.

#### Creating the API Key

1. Go to [App Store Connect API Keys](https://appstoreconnect.apple.com/access/api)
2. Click the **+** button to generate a new key
3. Give it a name (e.g., "SYNC Desktop Notarization")
4. Select **Developer** role (minimum required for notarization)
5. Click **Generate**
6. Download the `.p8` file (you can only download it once!)

**Note the following information:**
- **Key ID**: 10-character alphanumeric string (e.g., `ABC123DEFG`)
- **Issuer ID**: UUID format (e.g., `12345678-90ab-cdef-1234-567890abcdef`)
- **Private Key**: The downloaded `.p8` file contents

---

## GitHub Secrets Configuration

Add the following secrets to your GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

### Required for Code Signing

| Secret Name | Description | Example / How to Get |
|-------------|-------------|----------------------|
| `APPLE_P12_BASE64` | Base64-encoded .p12 certificate file | `base64 -i certificate.p12 \| pbcopy` (macOS) |
| `P12_PASSWORD` | Password for the .p12 file | Password you set when exporting |
| `KEYCHAIN_PASSWORD` | Password for temporary keychain | Any strong random password (e.g., generate with `openssl rand -base64 32`) |
| `MAC_SIGNING_IDENTITY` | Full certificate name | Copy from `security find-identity -v -p codesigning` output |

### Required for Notarization

| Secret Name | Description | Example / How to Get |
|-------------|-------------|----------------------|
| `APPLE_API_KEY_ID` | App Store Connect API Key ID | `ABC123DEFG` (from API key page) |
| `APPLE_API_KEY_ISSUER_ID` | App Store Connect Issuer ID | `12345678-90ab-cdef-1234-567890abcdef` (from API key page) |
| `APPLE_API_KEY_PRIVATE_BASE64` | Base64-encoded .p8 private key | `base64 -i AuthKey_ABC123DEFG.p8 \| pbcopy` |

### Optional Debug Secret

| Secret Name | Description | Example / How to Get |
|-------------|-------------|----------------------|
| `DEBUG_CODESIGN` | Enable debug output for signing identities | Set to `true` to see available certificates in CI logs |

---

## Step-by-Step Secret Setup

### 1. Encode the .p12 Certificate

```bash
# macOS/Linux
base64 -i /path/to/certificate.p12 | pbcopy

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\certificate.p12")) | Set-Clipboard
```

Paste the result into the `APPLE_P12_BASE64` GitHub secret.

### 2. Encode the .p8 API Key

```bash
# macOS/Linux
base64 -i /path/to/AuthKey_ABC123DEFG.p8 | pbcopy

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\AuthKey_ABC123DEFG.p8")) | Set-Clipboard
```

Paste the result into the `APPLE_API_KEY_PRIVATE_BASE64` GitHub secret.

### 3. Get Your Signing Identity Name

On the Mac where you installed the certificate:

```bash
security find-identity -v -p codesigning
```

**Example output:**
```
1) ABC123DEF456... "Developer ID Application: Your Company Name (TEAM123456)"
```

Copy the **full quoted string** including quotes into `MAC_SIGNING_IDENTITY`:
```
Developer ID Application: Your Company Name (TEAM123456)
```

### 4. Generate Keychain Password

```bash
openssl rand -base64 32
```

Use the output for `KEYCHAIN_PASSWORD`. This is only used in CI and doesn't need to match any existing password.

---

## Verification

### Debug Mode

To verify that certificates are being imported correctly, set the `DEBUG_CODESIGN` secret to `true`. This will output available signing identities in the workflow logs:

```
Available signing identities:
  1) ABC123DEF... "Developer ID Application: Your Company Name (TEAM123456)"
```

**Important:** Remove or set to `false` after debugging to avoid leaking certificate information.

### Testing the Workflow

1. **Trigger a manual workflow run:**
   - Go to **Actions** → **Build & Package macOS** → **Run workflow**
   - Select your branch and click **Run workflow**

2. **Check the workflow logs:**
   - Look for "Creating temporary keychain..." in the import step
   - Look for "Certificate imported successfully"
   - Look for "Notarizing..." in the build output
   - Check for any errors in red

3. **Download and verify the artifacts:**
   - After the workflow completes, download the `mac-artifacts` zip
   - Extract and verify the .dmg and .pkg are signed:
   
   ```bash
   # Check .app signature
   codesign -dvv SYNC\ Desktop.app
   
   # Check .dmg signature  
   codesign -dvv SYNC.Desktop-*.dmg
   
   # Check .pkg signature
   pkgutil --check-signature SYNC.Desktop-*.pkg
   
   # Verify notarization
   spctl -a -vvv -t install SYNC\ Desktop.app
   ```

---

## Troubleshooting

### "Certificate imported successfully" but signing fails

**Possible causes:**
- `MAC_SIGNING_IDENTITY` doesn't exactly match the certificate name
- Certificate has expired
- Certificate is not a "Developer ID Application" certificate

**Solution:**
1. Enable `DEBUG_CODESIGN` secret
2. Run the workflow and check the debug output
3. Copy the exact certificate name (including quotes) to `MAC_SIGNING_IDENTITY`

### "security: SecKeychainItemImport: The user name or passphrase you entered is not correct"

**Cause:** `P12_PASSWORD` is incorrect

**Solution:** Re-export the certificate with a new password and update the secret.

### Notarization fails or times out

**Possible causes:**
- Invalid `APPLE_API_KEY_ID` or `APPLE_API_KEY_ISSUER_ID`
- Corrupted or incorrect `APPLE_API_KEY_PRIVATE_BASE64`
- API key doesn't have the right permissions

**Solution:**
1. Verify the API key is still valid in App Store Connect
2. Re-download the .p8 file if possible (or create a new key)
3. Re-encode and update `APPLE_API_KEY_PRIVATE_BASE64`
4. Ensure the API key has "Developer" role or higher

### Unsigned builds despite secrets being set

**Cause:** One or more secrets are empty or contain only whitespace

**Solution:** Verify all required secrets are set and contain valid values.

---

## Security Best Practices

1. **Never commit .p12 or .p8 files to the repository**
2. **Rotate certificates and API keys periodically**
3. **Use strong passwords for .p12 files**
4. **Limit who has access to repository secrets**
5. **Remove DEBUG_CODESIGN after troubleshooting**
6. **Use separate API keys for different projects**
7. **Revoke old certificates and API keys when no longer needed**

---

## Workflow Behavior

### With Signing Configured

1. Temporary keychain is created
2. Certificate is imported and unlocked
3. electron-builder signs the app with `CSC_NAME`
4. .dmg and .pkg are created and signed
5. App is notarized with Apple
6. For **release events**: .dmg and .pkg are uploaded as separate release assets
7. For **workflow_dispatch**: artifacts are bundled into `mac-artifacts-{sha}.zip`

### Without Signing Configured

1. Signing steps are skipped
2. electron-builder builds unsigned .app
3. .dmg and .pkg are created but unsigned
4. Artifacts are uploaded as usual (unsigned)

---

## Release Artifacts

### Release Event (e.g., GitHub Release)

When a release is published, the workflow uploads two separate assets:

- `SYNC.Desktop-{version}-x64.dmg` (or arm64)
- `SYNC.Desktop-{version}-x64.pkg` (or arm64)

These are attached directly to the release and signed/notarized if credentials are configured.

### Manual Workflow Run

For `workflow_dispatch` triggers, artifacts are bundled into a single zip:

- `mac-artifacts-{sha}.zip` containing both .dmg and .pkg

Download from the workflow **Artifacts** section.

---

## Reference

- [Apple Developer Documentation - Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [App Store Connect API Keys](https://developer.apple.com/documentation/appstoreconnectapi/creating_api_keys_for_app_store_connect_api)

---

## Questions?

If you encounter issues not covered in this guide, check:
1. GitHub Actions workflow logs for detailed error messages
2. The `scripts/notarize.js` file for notarization logic
3. electron-builder documentation for CSC_NAME and signing options
