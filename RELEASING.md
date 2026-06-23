# Releasing SYNC Desktop

This documents the macOS release pipeline and the **two credential-gated steps**
that only a maintainer with Apple Developer access can perform.

## Current state

- **Signing** works: builds are signed with `Developer ID Application: Gody
  Duinsbergen (FY5J7KSYHJ)`. Signature is valid, so **electron auto-update works**
  for existing users.
- **Notarization** is **not yet configured**. Freshly downloaded `.dmg`s trip
  Gatekeeper ("Apple cannot check it for malware") on first open. Workarounds
  until notarization is set up: right-click → Open once, or use the one-line
  installer (`install-macos.command`), which removes the quarantine flag.
- **CI** (`.github/workflows/build-macos.yml`) builds and validates on every run,
  but **skips packaging** until the signing secrets below are present.

---

## Step 1 — Notarize the current v2.5.1 build (no rebuild needed)

The signed `.dmg`s already exist in `release/`. You just need Apple credentials.

### One-time: get an App Store Connect API key (recommended)

1. App Store Connect → Users and Access → **Integrations / Keys** → generate a key
   with the **Developer** role.
2. Download `AuthKey_XXXXXXXXXX.p8` (you can only download it once). Note the
   **Key ID** and the **Issuer ID** (UUID at the top of the page).

### Notarize + staple + re-upload

```bash
cd /Users/godyduinsbergen/sync.desktop

# Store the key in the keychain once (so the raw secret isn't typed again):
xcrun notarytool store-credentials sync-notary \
  --key /path/to/AuthKey_XXXXXXXXXX.p8 \
  --key-id  XXXXXXXXXX \
  --issuer  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

for f in release/SYNC.Desktop-2.5.1-arm64.dmg release/SYNC.Desktop-2.5.1-x64.dmg; do
  xcrun notarytool submit "$f" --keychain-profile sync-notary --wait
  xcrun stapler staple "$f"
  xcrun stapler validate "$f"
done

# Replace the release assets with the stapled (notarized) versions:
gh release upload v2.5.1 \
  release/SYNC.Desktop-2.5.1-arm64.dmg \
  release/SYNC.Desktop-2.5.1-x64.dmg \
  --repo frogody/sync.desktop --clobber
```

Verify: `spctl -a -vvv -t open --context context:primary-signature release/SYNC.Desktop-2.5.1-arm64.dmg`
should report `accepted` / `source=Notarized Developer ID`.

---

## Step 2 — Add CI secrets so every future release auto-signs + notarizes

Add these under **GitHub → Settings → Secrets and variables → Actions**. Once
present, publishing a GitHub Release builds, signs, notarizes, and attaches the
`.dmg`s automatically (no manual build).

| Secret | What it is | How to get it |
|---|---|---|
| `APPLE_P12_BASE64` | base64 of your Developer ID Application cert+key | export from Keychain (below) |
| `P12_PASSWORD` | password you set on that `.p12` | you choose it at export time |
| `KEYCHAIN_PASSWORD` | any throwaway password for the CI keychain | make one up |
| `MAC_SIGNING_IDENTITY` | `Developer ID Application: Gody Duinsbergen (FY5J7KSYHJ)` | already set ✓ |
| `APPLE_TEAM_ID` | `FY5J7KSYHJ` | your team id |
| `APPLE_API_KEY_PRIVATE_BASE64` | base64 of `AuthKey_XXXX.p8` | from Step 1 |
| `APPLE_API_KEY_ID` | the key id | from Step 1 |
| `APPLE_API_KEY_ISSUER_ID` | the issuer UUID | from Step 1 |

### Export the `.p12` (signing cert + private key)

Keychain Access → **login** keychain → Certificates → right-click
`Developer ID Application: Gody Duinsbergen (FY5J7KSYHJ)` → **Export** → `.p12`
(set a password = `P12_PASSWORD`).

### Produce the base64 values

```bash
base64 -i /path/to/DeveloperID.p12              | pbcopy   # -> APPLE_P12_BASE64
base64 -i /path/to/AuthKey_XXXXXXXXXX.p8        | pbcopy   # -> APPLE_API_KEY_PRIVATE_BASE64
```

You can also set them straight from the CLI without pasting:

```bash
gh secret set APPLE_P12_BASE64            --repo frogody/sync.desktop < <(base64 -i DeveloperID.p12)
gh secret set APPLE_API_KEY_PRIVATE_BASE64 --repo frogody/sync.desktop < <(base64 -i AuthKey_XXXXXXXXXX.p8)
gh secret set P12_PASSWORD                --repo frogody/sync.desktop
gh secret set KEYCHAIN_PASSWORD           --repo frogody/sync.desktop
gh secret set APPLE_TEAM_ID               --repo frogody/sync.desktop --body FY5J7KSYHJ
gh secret set APPLE_API_KEY_ID            --repo frogody/sync.desktop
gh secret set APPLE_API_KEY_ISSUER_ID     --repo frogody/sync.desktop
```

---

## Standard release flow (once secrets are in)

1. Bump `version` in `package.json` (keep `package-lock.json` in sync:
   `npm install --package-lock-only --ignore-scripts`) and `APP_VERSION` in
   `src/shared/constants.ts`.
2. Commit, tag, and **publish a GitHub Release** for the new tag.
3. CI builds, signs, notarizes, and attaches the `.dmg` / `.zip` / `latest-mac.yml`.
4. Bump the web download links to the new version (these files):
   `src/components/hyve/DesktopDownload.jsx`, `src/pages/HyveHub.jsx`,
   `src/pages/DownloadApp.jsx` (the `VERSION` constant), and
   `src/pages/DesktopActivity.jsx`. Push to `main` → Vercel deploys.

> The one-line installer is version-agnostic and always pulls the latest release:
> `curl -fsSL https://github.com/frogody/sync.desktop/releases/latest/download/install-macos.command | bash`
