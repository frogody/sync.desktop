#!/bin/bash
#
# Notarize + staple the already-built v<package.json version> DMGs in release/
# and re-upload them to the matching GitHub Release.
#
# Prereq (one-time): store an Apple credential as a keychain profile, e.g.
#   xcrun notarytool store-credentials sync-notary \
#     --key ~/.appstoreconnect/private_keys/AuthKey_XXXX.p8 --key-id XXXX --issuer <uuid>
#
# Usage:
#   scripts/notarize-existing.sh [keychain-profile]      # default profile: sync-notary
#
# See docs/NOTARIZATION_AND_SIGNING_GUIDE.md for the full walkthrough.
#
set -euo pipefail

PROFILE="${1:-sync-notary}"
cd "$(dirname "$0")/.."

VER="$(node -p "require('./package.json').version")"
echo "SYNC Desktop v${VER} — notarizing with keychain profile '${PROFILE}'"

for arch in arm64 x64; do
  DMG="release/SYNC.Desktop-${VER}-${arch}.dmg"
  if [ ! -f "$DMG" ]; then
    echo "ERROR: $DMG not found (build it first, or check the version)." >&2
    exit 1
  fi
  echo "==> Submitting $DMG (this can take a few minutes)…"
  xcrun notarytool submit "$DMG" --keychain-profile "$PROFILE" --wait
  echo "==> Stapling…"
  xcrun stapler staple "$DMG"
  xcrun stapler validate "$DMG"
done

echo "==> Re-uploading notarized DMGs to release v${VER}…"
gh release upload "v${VER}" \
  "release/SYNC.Desktop-${VER}-arm64.dmg" \
  "release/SYNC.Desktop-${VER}-x64.dmg" \
  --repo frogody/sync.desktop --clobber

echo "Done — v${VER} notarized, stapled, and re-uploaded."
echo "Verify: spctl -a -t open --context context:primary-signature -vvv release/SYNC.Desktop-${VER}-arm64.dmg"
