#!/bin/bash
#
# SYNC Desktop — one-line macOS installer.
#
#   curl -fsSL https://github.com/frogody/sync.desktop/releases/latest/download/install-macos.command | bash
#
# Version-agnostic and non-interactive (safe under `curl | bash`): always
# installs the *latest* published release, picking the build that matches your
# Mac's architecture (Apple Silicon or Intel). Safe to re-run to upgrade.
#
set -euo pipefail

REPO="frogody/sync.desktop"
API="https://api.github.com/repos/${REPO}/releases/latest"

echo ""
echo "Installing SYNC Desktop…"

# --- Detect architecture -----------------------------------------------------
ARCH="x64"
if [ "$(uname -m)" = "arm64" ]; then ARCH="arm64"; fi
echo "  • Mac architecture: ${ARCH}"

# --- Resolve the matching .dmg from the latest release -----------------------
echo "  • Looking up the latest release…"
DMG_URL="$(curl -fsSL "$API" | grep -o "https://[^\"']*-${ARCH}\.dmg" | head -n1)"
if [ -z "${DMG_URL:-}" ]; then
  echo "ERROR: could not find a ${ARCH} .dmg in the latest release." >&2
  exit 1
fi
echo "  • Downloading: ${DMG_URL##*/}"

# --- Download ----------------------------------------------------------------
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
DMG="${WORKDIR}/SYNC-Desktop.dmg"
curl -fsSL -o "$DMG" "$DMG_URL"

# --- Mount, copy to /Applications, unmount -----------------------------------
echo "  • Mounting disk image…"
MOUNT="$(hdiutil attach "$DMG" -nobrowse -noautoopen | grep -o '/Volumes/.*' | head -n1)"
if [ -z "${MOUNT:-}" ]; then
  echo "ERROR: failed to mount the disk image." >&2
  exit 1
fi

APP_SRC="$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -n1)"
if [ -z "${APP_SRC:-}" ]; then
  echo "ERROR: no .app found inside the disk image." >&2
  hdiutil detach "$MOUNT" -quiet || true
  exit 1
fi

APP_DEST="/Applications/$(basename "$APP_SRC")"
echo "  • Installing to ${APP_DEST}…"
rm -rf "$APP_DEST"
cp -R "$APP_SRC" /Applications/
hdiutil detach "$MOUNT" -quiet || true

# --- De-quarantine so it opens without the Gatekeeper prompt -----------------
xattr -dr com.apple.quarantine "$APP_DEST" 2>/dev/null || true

echo "  • Launching…"
open "$APP_DEST"
echo "Done — SYNC Desktop is installed. Sign in at https://app.isyncso.com"
echo ""
