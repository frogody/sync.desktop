# SYNC Desktop — macOS Signing & Notarization: Complete Setup Guide

A start-to-finish walkthrough for getting SYNC Desktop **notarized** so fresh
downloads install without the Gatekeeper warning, plus automating it in CI.

Repo facts this guide is written against (already in place):

- App: **SYNC Desktop** · bundle id `com.isyncso.sync-desktop`
- Signing identity: **Developer ID Application: Gody Duinsbergen (FY5J7KSYHJ)**
- Team ID: **FY5J7KSYHJ**
- `electron-builder.yml`: `hardenedRuntime: true`, `entitlements.mac.plist`,
  `gatekeeperAssess: false`, a built-in `notarize:` block, **and** an
  `afterSign: scripts/notarize.js` hook (see §6 — you have two notarizers).
- CI: `.github/workflows/build-macos.yml` — builds on every run, packages only
  when signing secrets exist.

---

## 0. TL;DR — which path do I want?

| Goal | Do this | Time |
|---|---|---|
| Stop the "Apple cannot check it for malware" warning on the **v2.5.1 build that's already published** | **Approach A** (§4) — notarize the existing DMGs, no rebuild | ~15 min |
| Make **every future release** sign + notarize automatically | **Approach B** (§5) — add 8 CI secrets | ~30 min one-time |
| Best outcome | Do **A now**, then **B** | — |

> Existing users are unaffected either way: electron auto-update validates the
> **signature** (already valid), not notarization. This is purely about *fresh*
> downloads from the website.

---

## 1. Background (60 seconds, so the commands make sense)

- **Code signing** — stamps the app with your Developer ID so macOS knows who
  built it and that it wasn't tampered with. ✅ Already happening.
- **Notarization** — you upload the signed app to Apple; Apple scans it for
  malware and issues a "ticket". ❌ Not happening yet.
- **Stapling** — attaches that ticket to the `.dmg` so Gatekeeper can verify it
  even offline. Done right after notarization.
- **Gatekeeper** — the macOS check on first launch. Signed **and** notarized →
  opens clean. Signed but **not** notarized → "Apple cannot check it for
  malware" until the user right-click→Opens or strips quarantine.

Notarization requires hardened runtime + a secure timestamp + entitlements —
all already configured here, so submissions will pass.

---

## 2. Preflight checks (run these first)

```bash
cd /Users/godyduinsbergen/sync.desktop

# 1) Signing identity present? (expect: Developer ID Application: Gody Duinsbergen (FY5J7KSYHJ))
security find-identity -v -p codesigning | grep "Developer ID Application"

# 2) notarytool available? (expect a path under Xcode)
xcrun --find notarytool

# 3) gh CLI authenticated to the right account? (expect: frogody)
gh auth status

# 4) The signed DMGs you'll notarize exist?
ls -lh release/SYNC.Desktop-2.5.1-*.dmg
```

You also need an **active Apple Developer Program membership** and to have
accepted any pending agreements at <https://appstoreconnect.apple.com>
(Business / Paid Apps agreements block notarization if unsigned).

---

## 3. Get a credential (one-time) — pick ONE

`notarytool` (and electron-builder) accept either an **App Store Connect API
key** (recommended — works locally *and* in CI) or an **Apple ID + app-specific
password**.

### Option 1 — App Store Connect API key (.p8)  ⭐ recommended

1. Go to <https://appstoreconnect.apple.com/access/integrations/api>
   (Users and Access → **Integrations** tab → **Team Keys**).
2. Click **+** (Generate API Key). Name it e.g. `sync-desktop-notary`.
3. **Access role: Developer** is sufficient for notarization.
4. Click **Generate**, then **Download** `AuthKey_XXXXXXXXXX.p8`.
   ⚠️ You can only download it **once** — save it somewhere safe.
5. Record two values from that page:
   - **Key ID** — the 10-char code (e.g. `ABCD1234EF`), also in the filename.
   - **Issuer ID** — the UUID at the top of the Keys list
     (e.g. `69a6de70-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
6. (Recommended) put the key where Apple tools auto-discover it:
   ```bash
   mkdir -p ~/.appstoreconnect/private_keys
   mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/private_keys/
   ```

### Option 2 — Apple ID + app-specific password

1. Go to <https://appleid.apple.com> → **Sign-In and Security** →
   **App-Specific Passwords** → **+** → name it `notarytool` → copy the
   generated `xxxx-xxxx-xxxx-xxxx` password.
2. Your Team ID is **FY5J7KSYHJ**.

---

## 4. Approach A — Notarize the already-published v2.5.1 build (no rebuild)

The signed `.dmg`s already sit in `release/`. You only add Apple's ticket.

### A1 — Store credentials in your keychain (so you never re-type the secret)

**With an API key (Option 1):**
```bash
xcrun notarytool store-credentials sync-notary \
  --key   ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8 \
  --key-id  XXXXXXXXXX \
  --issuer  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Or with Apple ID (Option 2):**
```bash
xcrun notarytool store-credentials sync-notary \
  --apple-id "you@example.com" \
  --team-id  FY5J7KSYHJ \
  --password "xxxx-xxxx-xxxx-xxxx"
```

This writes a keychain profile named `sync-notary`; every later command just
references `--keychain-profile sync-notary`.

### A2 — Submit, wait, staple, validate (both architectures)

```bash
cd /Users/godyduinsbergen/sync.desktop

for f in release/SYNC.Desktop-2.5.1-arm64.dmg release/SYNC.Desktop-2.5.1-x64.dmg; do
  echo "==> $f"
  xcrun notarytool submit "$f" --keychain-profile sync-notary --wait   # ~2–8 min each
  xcrun stapler staple "$f"
  xcrun stapler validate "$f"
done
```

What you should see:
- `notarytool submit … --wait` prints a submission id and ends with
  `status: Accepted`.
- `stapler staple` → `The staple and validate action worked!`

**If status is `Invalid`**, read exactly why:
```bash
xcrun notarytool log <submission-id> --keychain-profile sync-notary
```
(Common cause: an unsigned helper binary — unlikely here since electron-builder
signs everything with hardened runtime.)

### A3 — Verify Gatekeeper now accepts it

```bash
spctl -a -t open --context context:primary-signature -vvv release/SYNC.Desktop-2.5.1-arm64.dmg
# expect: source=Notarized Developer ID … accepted
```

### A4 — Replace the published assets with the stapled (notarized) DMGs

```bash
gh release upload v2.5.1 \
  release/SYNC.Desktop-2.5.1-arm64.dmg \
  release/SYNC.Desktop-2.5.1-x64.dmg \
  --repo frogody/sync.desktop --clobber
```

### A5 — Final external check (what a real downloader gets)

```bash
cd "$(mktemp -d)"
curl -fLO https://github.com/frogody/sync.desktop/releases/download/v2.5.1/SYNC.Desktop-2.5.1-arm64.dmg
spctl -a -t open --context context:primary-signature -vvv SYNC.Desktop-2.5.1-arm64.dmg   # expect: accepted
```

> **About the `.zip` / auto-update:** the auto-updater uses the `.zip` +
> `latest-mac.yml` and only needs a valid **signature** (already true), so you
> don't have to notarize the zip. If you want belt-and-suspenders, rebuild via
> Approach B so electron-builder produces notarized zip+dmg together and
> regenerates `latest-mac.yml`.

---

## 5. Approach B — Automate signing + notarization in CI

After this, **publishing a GitHub Release** auto-builds, signs, notarizes, and
attaches the artifacts. No local builds.

### B1 — Export the Developer ID Application certificate as a `.p12`

This bundles the cert **and its private key** (CI needs both).

1. Open **Keychain Access** → left sidebar **login** keychain → **Certificates**.
2. Find **Developer ID Application: Gody Duinsbergen (FY5J7KSYHJ)**. Click the
   ▸ disclosure triangle — you must see a **private key** nested under it. (No
   private key = you can't sign; you'd need to re-create the cert.)
3. Right-click the certificate → **Export "Developer ID Application…"** →
   format **Personal Information Exchange (.p12)** → save as `DeveloperID.p12`.
4. Set an export password when prompted — **this becomes `P12_PASSWORD`**.

### B2 — Base64-encode the secrets

```bash
base64 -i DeveloperID.p12                              # value for APPLE_P12_BASE64
base64 -i ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8   # value for APPLE_API_KEY_PRIVATE_BASE64
```

### B3 — Add the 8 repository secrets

Settings → **Secrets and variables → Actions** (or the CLI below):

| Secret | Value / source |
|---|---|
| `APPLE_P12_BASE64` | output of `base64 -i DeveloperID.p12` |
| `P12_PASSWORD` | the password you set in B1 |
| `KEYCHAIN_PASSWORD` | any throwaway string (CI's temp keychain) |
| `MAC_SIGNING_IDENTITY` | `Developer ID Application: Gody Duinsbergen (FY5J7KSYHJ)` *(already set ✓)* |
| `APPLE_TEAM_ID` | `FY5J7KSYHJ` |
| `APPLE_API_KEY_PRIVATE_BASE64` | output of `base64 -i AuthKey_XXXX.p8` |
| `APPLE_API_KEY_ID` | the 10-char Key ID |
| `APPLE_API_KEY_ISSUER_ID` | the Issuer UUID |

CLI (reads files directly so secrets never touch your clipboard/history):
```bash
R=frogody/sync.desktop
gh secret set APPLE_P12_BASE64             --repo $R < <(base64 -i DeveloperID.p12)
gh secret set APPLE_API_KEY_PRIVATE_BASE64 --repo $R < <(base64 -i ~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8)
gh secret set P12_PASSWORD                 --repo $R          # prompts
gh secret set KEYCHAIN_PASSWORD            --repo $R          # prompts (type anything)
gh secret set MAC_SIGNING_IDENTITY         --repo $R --body "Developer ID Application: Gody Duinsbergen (FY5J7KSYHJ)"
gh secret set APPLE_TEAM_ID                --repo $R --body "FY5J7KSYHJ"
gh secret set APPLE_API_KEY_ID             --repo $R          # prompts
gh secret set APPLE_API_KEY_ISSUER_ID      --repo $R          # prompts

gh secret list --repo $R     # confirm all 8 are present
```

### B4 — How the workflow uses them (no edits needed)

- The job computes `HAS_SIGNING` / `HAS_NOTARIZE` flags from the secrets (the
  `secrets` context can't be used in `if:` directly).
- "Import macOS signing identity…" decodes `APPLE_P12_BASE64` into a temporary
  keychain using `P12_PASSWORD` / `KEYCHAIN_PASSWORD`.
- "Reconstruct App Store Connect API key…" writes the `.p8` from
  `APPLE_API_KEY_PRIVATE_BASE64` and exports `APPLE_API_KEY` (path).
- "Package macOS app" runs `electron-builder`, which signs with
  `MAC_SIGNING_IDENTITY` and notarizes via the API key
  (`APPLE_API_KEY` / `APPLE_API_KEY_ID` / `APPLE_API_ISSUER`).

### B5 — Test it

1. **Dry run (build only):** Actions → *Build & Package macOS* → **Run workflow**
   on `main`. With secrets present it now also signs + notarizes a build.
2. **Real release:** bump the version (see §7), then **publish a GitHub
   Release** for the tag. Watch the run; the signed/notarized `.dmg`, `.zip`,
   `.blockmap`, `latest-mac.yml`, and `install-macos.command` attach
   automatically.

### B6 — Verify the attached artifact

```bash
cd "$(mktemp -d)"
gh release download vX.Y.Z --repo frogody/sync.desktop --pattern "*arm64.dmg"
spctl -a -t open --context context:primary-signature -vvv SYNC.Desktop-*-arm64.dmg   # accepted / Notarized
```

---

## 6. Recommended cleanup — you currently have TWO notarizers

`electron-builder.yml` declares **both**:
- a built-in `notarize:` block (uses the App Store Connect **API key**), and
- `afterSign: scripts/notarize.js` (uses **Apple ID + app-specific password**).

In CI they don't collide (the script self-skips when `APPLE_ID` is unset, so
only the built-in path runs). But a **local** rebuild with `APPLE_ID` set would
notarize twice (slow, wasteful). Standardize on one:

**Recommended:** keep the built-in `notarize:` (API key) and drop the hook —
edit `electron-builder.yml`:
```yaml
# afterSign: scripts/notarize.js        # ← remove or comment out
```
Then you can delete `scripts/notarize.js`. (Optional, but tidy. Ask me and I'll
do it.)

---

## 7. Standard release flow going forward

```bash
cd /Users/godyduinsbergen/sync.desktop

# 1) Bump versions (keep the lockfile in sync, or npm ci fails in CI)
npm version X.Y.Z --no-git-tag-version          # updates package.json + package-lock.json
#   then set APP_VERSION in src/shared/constants.ts to 'X.Y.Z'

git add -A && git commit -m "chore(release): X.Y.Z" && git push origin main

# 2) Tag + publish a GitHub Release (this triggers CI signing/notarizing)
gh release create vX.Y.Z --repo frogody/sync.desktop --generate-notes --title "vX.Y.Z"

# 3) Point the website at the new version, then push (Vercel auto-deploys):
#    app.isyncso/src/components/hyve/DesktopDownload.jsx   (href + "vX.Y.Z" label)
#    app.isyncso/src/pages/HyveHub.jsx                     (href)
#    app.isyncso/src/pages/DownloadApp.jsx                 (const VERSION)
#    app.isyncso/src/pages/DesktopActivity.jsx             (DOWNLOAD_URL_* / INSTALL_SCRIPT_URL)
```

The one-line installer is version-agnostic and always pulls the latest release,
so it never needs bumping:
```
curl -fsSL https://github.com/frogody/sync.desktop/releases/latest/download/install-macos.command | bash
```

---

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `error: The specified item could not be found in the keychain` | Re-run `notarytool store-credentials sync-notary …`; reference the exact profile name. |
| Submission `status: Invalid` | `xcrun notarytool log <id> --keychain-profile sync-notary` — it names the offending binary / missing hardened-runtime flag. |
| `You must first sign the relevant agreements` | Accept pending agreements in App Store Connect → Agreements, Tax, and Banking. |
| `spctl … rejected` even after stapling | You're testing a quarantined copy; re-download fresh, or `xattr -dr com.apple.quarantine <app>` then re-test. |
| CI skips packaging (warning "signing secrets not set") | A secret name is wrong/missing — `gh secret list`; `HAS_SIGNING` needs both `APPLE_P12_BASE64` and `MAC_SIGNING_IDENTITY`. |
| CI "Import signing identity" fails | `.p12` exported without its private key, or `P12_PASSWORD` mismatch — re-export per B1. |
| electron-builder "API key not found" | Ensure `APPLE_API_KEY_PRIVATE_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_KEY_ISSUER_ID` are all set. |
| `npm ci` fails in CI | Already handled (Python 3.11 pinned; lockfile synced). Keep `package-lock.json` in sync on every version bump. |

---

## 9. Security & hygiene

- **Never commit** `DeveloperID.p12`, `AuthKey_*.p8`, or any password. `.env` is
  already gitignored; keep credentials out of the repo entirely.
- Treat the `.p8` like a password — anyone with it can notarize as your team.
  Revoke/rotate at App Store Connect → Integrations if leaked.
- The base64 blobs live only in GitHub Actions secrets (encrypted, not printed
  in logs).

---

## Appendix — one-shot notarize script for the current build

Save as `scripts/notarize-existing.sh`, `chmod +x`, run after §3/§A1:

```bash
#!/bin/bash
set -euo pipefail
PROFILE="${1:-sync-notary}"
VER="$(node -p "require('./package.json').version")"
for arch in arm64 x64; do
  DMG="release/SYNC.Desktop-${VER}-${arch}.dmg"
  [ -f "$DMG" ] || { echo "missing $DMG"; exit 1; }
  echo "==> notarizing $DMG"
  xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
done
gh release upload "v${VER}" release/SYNC.Desktop-${VER}-arm64.dmg release/SYNC.Desktop-${VER}-x64.dmg \
  --repo frogody/sync.desktop --clobber
echo "Done — v${VER} notarized + re-uploaded."
```
