This file documents how CI reconstructs the App Store Connect API key and how scripts/notarize.js can read it.

- CI will write the App Store Connect API key to:
  /tmp/AuthKey_<APPLE_API_KEY_ID>.p8

- scripts/notarize.js (existing) should prefer reading:
  1. Environment variable APPLE_API_KEY_PATH (set by CI)
  2. Fall back to default paths if needed

Example code for scripts/notarize.js:

  const apiKeyPath = process.env.APPLE_API_KEY_PATH || '/path/to/default/AuthKey.p8';
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  const apiKeyIssuerId = process.env.APPLE_API_KEY_ISSUER_ID;

This ensures the notarization script works both in CI and locally.
