Apple API Key Reconstruction for Notarization
==============================================

During the CI build process, the Apple App Store Connect API private key (.p8 file)
is reconstructed in /tmp/ from the base64-encoded secret APPLE_API_KEY_PRIVATE_BASE64.

How it works:
1. The base64-encoded .p8 key is stored as a GitHub secret (APPLE_API_KEY_PRIVATE_BASE64)
2. During the workflow, the "Prepare Apple API key for notarization" step:
   - Decodes the base64 string back to binary
   - Writes it to /tmp/AuthKey_<KEY_ID>.p8
   - Sets file permissions to 600 (read/write for owner only)
3. Electron-builder uses this reconstructed key file during notarization via the 
   APPLE_API_KEY_PATH environment variable

The .p8 file is never committed to the repository - it only exists temporarily in
the CI runner's /tmp directory during the build process.

Required secrets for notarization:
- APPLE_API_KEY_PRIVATE_BASE64: Base64-encoded .p8 file
- APPLE_API_KEY_ID: The key ID (10-character alphanumeric, e.g., "ABC123DEFG")
- APPLE_API_KEY_ISSUER_ID: The issuer ID (UUID format from App Store Connect)
- APPLE_TEAM_ID: (optional) Your Apple Developer Team ID

To obtain these values:
1. Log in to https://appstoreconnect.apple.com/access/api
2. Create a new API key with "App Manager" or "Developer" role
3. Download the AuthKey_XXXXXXXXXX.p8 file (can only download once!)
4. Note the Key ID and Issuer ID shown on the page
5. Base64-encode the .p8 file:
   openssl base64 -in /path/to/AuthKey_XXXXXXXXXX.p8 -A | pbcopy
6. Store the values in GitHub repository secrets

Security note: The .p8 file is sensitive and should be treated like a password.
Never commit it to source control or share it publicly.
