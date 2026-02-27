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

# Compile MLX Metal shaders into mlx.metallib
# (swift build doesn't compile .metal files — we do it manually with xcrun)
METAL_SRC="$SWIFT_DIR/.build/checkouts/mlx-swift/Source/Cmlx/mlx-generated/metal"
if [[ -d "$METAL_SRC" ]] && xcrun --find metal &>/dev/null; then
    echo "[build-swift] Compiling Metal shaders..."
    AIR_DIR="$BUILD_DIR/metal-air"
    rm -rf "$AIR_DIR" && mkdir -p "$AIR_DIR"

    METAL_OK=0
    METAL_FAIL=0
    while IFS= read -r f; do
        relpath=$(echo "$f" | sed "s|$METAL_SRC/||;s|/|_|g;s|\.metal$||")
        if xcrun -sdk macosx metal -c "$f" -I "$METAL_SRC" -o "$AIR_DIR/${relpath}.air" 2>/dev/null; then
            METAL_OK=$((METAL_OK + 1))
        else
            METAL_FAIL=$((METAL_FAIL + 1))
        fi
    done < <(find "$METAL_SRC" -name "*.metal" -not -path "*/examples/*")

    echo "[build-swift] Metal shaders: $METAL_OK compiled, $METAL_FAIL failed"

    if [[ $METAL_OK -gt 0 ]]; then
        xcrun -sdk macosx metallib "$AIR_DIR"/*.air -o "$APP_BUNDLE/Contents/MacOS/mlx.metallib" 2>/dev/null
        echo "[build-swift] mlx.metallib: $(du -h "$APP_BUNDLE/Contents/MacOS/mlx.metallib" | cut -f1)"
    fi
    rm -rf "$AIR_DIR"
else
    echo "[build-swift] Skipping Metal shaders (source not found or Metal toolchain missing)"
fi

# Copy MLX model if present
MODEL_DIR="$SWIFT_DIR/Resources/model"
if [[ -f "$MODEL_DIR/config.json" ]]; then
    echo "[build-swift] Copying MLX model into app bundle..."
    cp -r "$MODEL_DIR" "$APP_BUNDLE/Contents/Resources/model"
    echo "[build-swift] Model size: $(du -sh "$APP_BUNDLE/Contents/Resources/model" | cut -f1)"
fi

# Create PkgInfo
echo -n "APPL????" > "$APP_BUNDLE/Contents/PkgInfo"

echo "[build-swift] SYNCWidget.app assembled at: $APP_BUNDLE"
echo "[build-swift] Size: $(du -sh "$APP_BUNDLE" | cut -f1)"
echo "[build-swift] Done."
