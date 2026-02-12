#!/bin/bash

# SYNC Desktop Installer for macOS
# This script downloads and installs SYNC Desktop, bypassing Gatekeeper

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║           SYNC Desktop Installer for macOS                ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    echo -e "${GREEN}✓${NC} Detected Apple Silicon (M1/M2/M3)"
    DMG_NAME="SYNC.Desktop-2.0.0-arm64.dmg"
else
    echo -e "${GREEN}✓${NC} Detected Intel Mac"
    DMG_NAME="SYNC.Desktop-2.0.0.dmg"
fi

DOWNLOAD_URL="https://github.com/frogody/sync.desktop/releases/download/v2.0.0/${DMG_NAME}"
DOWNLOAD_PATH="/tmp/${DMG_NAME}"
MOUNT_POINT="/Volumes/SYNC Desktop 2.0.0"
APP_NAME="SYNC Desktop.app"
INSTALL_PATH="/Applications/${APP_NAME}"

# Check if already installed
if [ -d "$INSTALL_PATH" ]; then
    echo -e "${YELLOW}!${NC} SYNC Desktop is already installed."
    read -p "Do you want to reinstall? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 0
    fi
    echo -e "${CYAN}→${NC} Removing existing installation..."
    rm -rf "$INSTALL_PATH"
fi

# Download
echo ""
echo -e "${CYAN}→${NC} Downloading SYNC Desktop..."
curl -L -# -o "$DOWNLOAD_PATH" "$DOWNLOAD_URL"
echo -e "${GREEN}✓${NC} Download complete"

# Remove quarantine attribute from DMG
echo -e "${CYAN}→${NC} Preparing installer..."
xattr -cr "$DOWNLOAD_PATH" 2>/dev/null || true

# Mount DMG
echo -e "${CYAN}→${NC} Mounting disk image..."
hdiutil attach "$DOWNLOAD_PATH" -nobrowse -quiet

# Find the actual mount point (it might have a slightly different name)
ACTUAL_MOUNT=$(ls -d /Volumes/SYNC* 2>/dev/null | head -1)
if [ -z "$ACTUAL_MOUNT" ]; then
    echo -e "${RED}✗${NC} Failed to mount disk image"
    exit 1
fi

# Copy app to Applications
echo -e "${CYAN}→${NC} Installing to Applications..."
cp -R "${ACTUAL_MOUNT}/${APP_NAME}" /Applications/

# Remove quarantine from installed app
echo -e "${CYAN}→${NC} Configuring permissions..."
xattr -cr "/Applications/${APP_NAME}" 2>/dev/null || true

# Unmount DMG
echo -e "${CYAN}→${NC} Cleaning up..."
hdiutil detach "$ACTUAL_MOUNT" -quiet 2>/dev/null || true
rm -f "$DOWNLOAD_PATH"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           SYNC Desktop installed successfully!            ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Ask to launch
read -p "Would you like to launch SYNC Desktop now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${CYAN}→${NC} Launching SYNC Desktop..."
    open -a "SYNC Desktop"
fi

echo ""
echo -e "${CYAN}Thank you for installing SYNC Desktop!${NC}"
echo -e "Visit ${CYAN}https://app.isyncso.com${NC} to connect your account."
echo ""
