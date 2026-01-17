# macOS Code Signing & Notarization Setup

This document explains how to configure GitHub Actions secrets for code signing and notarizing the SYNC Desktop macOS builds.

## Overview

The `build-macos.yml` workflow supports optional code signing and notarization. If the required secrets are not configured, the workflow will still run and produce unsigned builds.

## Required Secrets for Code Signing

To enable code signing, configure these GitHub repository secrets:

### 1. Certificate Secrets

| Secret | Description | How to Obtain |
|--------|-------------|---------------|
| `APPLE_P12_BASE64` | Base64-encoded .p12 certificate file | Export your "Developer ID Application" certificate from Keychain Access as .p12, then encode: `base64 -i certificate.p12 | pbcopy` |
| `P12_PASSWORD` | Password for the .p12 certificate | The password you set when exporting the certificate |
| `KEYCHAIN_PASSWORD` | Password for temporary build keychain | Any secure random password (e.g., generate with `openssl rand -base64 32`) |
| `MAC_SIGNING_IDENTITY` | Certificate identity name | Full name from certificate (e.g., "Developer ID Application: Your Company Name (TEAM_ID)") |

### 2. Notarization Secrets (Optional but Recommended)

| Secret | Description | How to Obtain |
|--------|-------------|---------------|
| `APPLE_API_KEY_ID` | App Store Connect API Key ID | Create an API key in App Store Connect → Users and Access → Keys |
| `APPLE_API_KEY_ISSUER_ID` | App Store Connect Issuer ID | Found in App Store Connect → Users and Access → Keys (above the keys list) |
| `APPLE_API_KEY_PRIVATE_BASE64` | Base64-encoded .p8 API key file | Download .p8 file from App Store Connect, then encode: `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy` |

### 3. Debug Secret (Optional)

| Secret | Description |
|--------|-------------|
| `DEBUG_CODESIGN` | Set to `'true'` to list available signing identities in workflow logs (helps troubleshoot signing issues) |

## Step-by-Step Setup Guide

### Step 1: Obtain a Developer ID Certificate

1. Log in to [Apple Developer](https://developer.apple.com)
2. Go to Certificates, Identifiers & Profiles
3. Create a new "Developer ID Application" certificate
4. Download and install the certificate in Keychain Access

### Step 2: Export Certificate as .p12

1. Open Keychain Access on your Mac
2. Select "My Certificates" in the left sidebar
3. Find your "Developer ID Application" certificate
4. Right-click → Export "Developer ID Application: ..."
5. Save as .p12 file with a secure password

### Step 3: Encode Certificate to Base64

```bash
# Encode the .p12 file
base64 -i /path/to/certificate.p12 | pbcopy

# The base64 string is now in your clipboard
# Paste it as the APPLE_P12_BASE64 secret in GitHub
```

### Step 4: Create App Store Connect API Key

1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Go to Users and Access → Keys
3. Click the "+" button to create a new key
4. Select "Developer" access and give it a name (e.g., "GitHub Actions Notarization")
5. Download the .p8 file (you can only download it once!)
6. Note the Key ID and Issuer ID

### Step 5: Encode API Key to Base64

```bash
# Encode the .p8 file
base64 -i /path/to/AuthKey_XXXXXXXXXX.p8 | pbcopy

# The base64 string is now in your clipboard
# Paste it as the APPLE_API_KEY_PRIVATE_BASE64 secret in GitHub
```

### Step 6: Configure GitHub Secrets

1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret" for each secret
4. Add all the secrets from the tables above

### Step 7: Get Your Certificate Identity Name

```bash
# List all Developer ID certificates
security find-identity -v -p codesigning

# Output example:
#   1) 1234567890ABCDEF "Developer ID Application: Your Company Name (ABC123XYZ)"
#
# Copy the full name in quotes (including the Team ID in parentheses)
# This is your MAC_SIGNING_IDENTITY
```

## Verification

After configuring the secrets:

1. Trigger a manual workflow run (Actions → Build & Package macOS → Run workflow)
2. Check the workflow logs for:
   - "Creating temporary keychain..." (indicates certificate import started)
   - "Certificate import complete" (indicates success)
   - "Decoding Apple API private key..." (indicates notarization key configured)

3. If you set `DEBUG_CODESIGN='true'`, you'll see available signing identities listed

4. The built .dmg and .pkg files will be signed and notarized

## Troubleshooting

### "No identity found" error

- Verify `MAC_SIGNING_IDENTITY` exactly matches the certificate name
- Enable debug mode with `DEBUG_CODESIGN='true'` to see available identities
- Check that the .p12 was imported correctly

### "User interaction is not allowed" error

- Ensure the partition list is set correctly (this is handled automatically by the workflow)
- Verify the keychain password is correct

### Notarization fails

- Verify all three API key secrets are set correctly
- Ensure the API key has "Developer" access in App Store Connect
- Check that the .p8 file was encoded correctly

### Build succeeds but produces unsigned app

- This is expected if secrets are not configured
- The workflow will skip signing steps and produce unsigned builds

## Security Notes

- **Never commit** .p12 or .p8 files to the repository
- **Never commit** passwords or secret values
- Store all sensitive data as GitHub repository secrets
- The .p12 file is deleted immediately after import in the workflow
- The temporary keychain is created in `$RUNNER_TEMP` and automatically cleaned up

## References

- [Apple Code Signing Guide](https://developer.apple.com/support/code-signing/)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
