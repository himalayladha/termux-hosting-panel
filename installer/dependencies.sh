#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# TermuxPanel - Dependency Installer (Idempotent)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "\n${BLUE}▶ Checking and installing required packages...${NC}"

# Detect package manager
if command -v pkg >/dev/null 2>&1; then
  PKG_CMD="pkg install -y"
  pkg update -y || true
elif command -v apt-get >/dev/null 2>&1; then
  PKG_CMD="apt-get install -y"
  apt-get update -y || true
else
  echo -e "${YELLOW}Warning: Unknown package manager. Please ensure Node, Python, PHP, SQLite are installed.${NC}"
  PKG_CMD=""
fi

if [ -n "$PKG_CMD" ]; then
  # Core Packages
  PACKAGES=(nodejs python php sqlite cronie openssh tar curl wget)
  
  if [ -n "$TERMUX_VERSION" ] || [ -d "/data/data/com.termux" ]; then
    PACKAGES+=(termux-services termux-api proot)
  fi

  for pkg_name in "${PACKAGES[@]}"; do
    echo -e "  Checking ${pkg_name}..."
    $PKG_CMD "$pkg_name" || echo -e "  ${YELLOW}Notice: Could not install $pkg_name via package manager, continuing...${NC}"
  done
fi

# Install / verify cloudflared binary on very first setup
echo -e "\n${BLUE}▶ Checking and installing Cloudflare Tunnel (cloudflared)...${NC}"
if ! command -v cloudflared >/dev/null 2>&1; then
  echo -e "  Attempting native installation of cloudflared via package manager..."
  
  # Method 1: pkg install cloudflared
  if command -v pkg >/dev/null 2>&1; then
    pkg install -y cloudflared 2>/dev/null || (pkg install -y tur-repo 2>/dev/null && pkg install -y cloudflared 2>/dev/null) || true
  fi

  # Method 2: Direct architecture binary download from Cloudflare Official Releases
  if ! command -v cloudflared >/dev/null 2>&1; then
    ARCH=$(uname -m)
    echo -e "  Downloading official cloudflared binary for architecture: $ARCH..."
    CLOUDFLARED_URL=""

    case "$ARCH" in
      aarch64|arm64)
        CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
        ;;
      armv7l|arm|armhf)
        CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm"
        ;;
      x86_64|amd64)
        CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        ;;
      i686|386)
        CLOUDFLARED_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-386"
        ;;
    esac

    if [ -n "$CLOUDFLARED_URL" ]; then
      BIN_DEST="$PREFIX/bin/cloudflared"
      [ -z "$PREFIX" ] && BIN_DEST="/usr/local/bin/cloudflared"
      
      echo -e "  Downloading binary from $CLOUDFLARED_URL..."
      curl -fsSL "$CLOUDFLARED_URL" -o "$BIN_DEST" || wget -q "$CLOUDFLARED_URL" -O "$BIN_DEST" || true
      if [ -f "$BIN_DEST" ]; then
        chmod +x "$BIN_DEST"
        echo -e "  ${GREEN}✓ cloudflared installed successfully at $BIN_DEST!${NC}"
      fi
    fi
  fi
fi

# Final cloudflared check
if command -v cloudflared >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓ cloudflared is ready:${NC} $(cloudflared --version 2>/dev/null || echo 'Installed')"
else
  echo -e "  ${YELLOW}Notice: cloudflared could not be auto-installed. You can install it anytime using: pkg install cloudflared${NC}"
fi

echo -e "\n${GREEN}✓ Dependencies verification complete!${NC}\n"
