#!/bin/bash
set -euo pipefail

# Build the native SYNCWidget Swift helper app.
# Produces: native/SYNCWidget/build/SYNCWidget.app

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SWIFT_DIR="$PROJECT_DIR/native/SYNCWidget"
BUILD_DIR="$SWIFT_DIR/build"
APP_BUNDLE="$BUILD_DIR/SYNCWidget.app"

# Skip on non-macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "[build-swift] Skipping: not macOS"
    exit 0
fi

# Clean if requested
if [[ "${1:-}" == "--clean" ]]; then
    echo "[build-swift] Cleaning..."
    rm -rf "$SWIFT_DIR/.build" "$BUILD_DIR"
fi

echo "[build-swift] Building SYNCWidget..."
cd "$SWIFT_DIR"

# Build release binary
swift build -c release 2>&1 | while read -r line; do
    echo "[build-swift] $line"
done

# Find the built binary
BINARY="$SWIFT_DIR/.build/release/SYNCWidget"
if [[ ! -f "$BINARY" ]]; then
    echo "[build-swift] ERROR: Binary not found at $BINARY"
    exit 1
fi

echo "[build-swift] Binary built: $(du -h "$BINARY" | cut -f1)"

# Assemble .app bundle
echo "[build-swift] Assembling SYNCWidget.app..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Copy binary
cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/SYNCWidget"

# Copy Info.plist
cp "$SWIFT_DIR/Resources/Info.plist" "$APP_BUNDLE/Contents/Info.plist"

# Create PkgInfo
echo -n "APPL????" > "$APP_BUNDLE/Contents/PkgInfo"

echo "[build-swift] SYNCWidget.app assembled at: $APP_BUNDLE"
echo "[build-swift] Size: $(du -sh "$APP_BUNDLE" | cut -f1)"
echo "[build-swift] Done."
