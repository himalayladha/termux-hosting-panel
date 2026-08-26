#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# TermuxPanel - One-Tap Idempotent Server Setup & Installer
# ==============================================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

clear || true

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    TERMUXPANEL                           ║${NC}"
echo -e "${CYAN}║           Android One-Tap Server Installer               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}\n"

PANEL_DIR="$HOME/termux-panel"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# If running directly from git clone outside ~/termux-panel, copy or link
if [ "$CURRENT_DIR" != "$PANEL_DIR" ]; then
  echo -e "${BLUE}[1/8] Syncing TermuxPanel codebase to $PANEL_DIR...${NC}"
  mkdir -p "$PANEL_DIR"
  cp -ru "$CURRENT_DIR"/* "$PANEL_DIR/" || cp -r "$CURRENT_DIR"/* "$PANEL_DIR/"
else
  echo -e "${BLUE}[1/8] Verifying directory structure...${NC}"
fi

cd "$PANEL_DIR"

# Step 2: Dependencies
echo -e "\n${BLUE}[2/8] Installing and verifying runtime dependencies...${NC}"
bash "$PANEL_DIR/installer/dependencies.sh"

# Step 3: Security & Directories
echo -e "\n${BLUE}[3/8] Applying security hardening and permissions...${NC}"
bash "$PANEL_DIR/installer/security.sh"

# Step 4: Backend NPM Dependencies
echo -e "\n${BLUE}[4/8] Installing backend dependencies...${NC}"
cd "$PANEL_DIR/backend"
if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
  npm install --production --no-audit --no-fund
  echo -e "  ${GREEN}✓ Backend dependencies installed successfully!${NC}"
else
  echo -e "  ${GREEN}✓ Backend dependencies already up-to-date.${NC}"
fi

# Step 5: Boot & Services Integration
echo -e "\n${BLUE}[5/8] Configuring Termux:Boot and termux-services...${NC}"

# Termux:Boot integration
BOOT_DIR="$HOME/.termux/boot"
if [ -d "$HOME/.termux" ] || [ -n "$TERMUX_VERSION" ]; then
  mkdir -p "$BOOT_DIR"
  cp "$PANEL_DIR/scripts/start-server.sh" "$BOOT_DIR/start-server"
  chmod +x "$BOOT_DIR/start-server"
  echo -e "  ${GREEN}✓ Termux:Boot startup script installed in $BOOT_DIR/start-server${NC}"
fi

# Termux-services integration
if [ -n "$PREFIX" ] && [ -d "$PREFIX/var/service" ]; then
  # termux-panel service
  mkdir -p "$PREFIX/var/service/termux-panel"
  cp "$PANEL_DIR/scripts/service-panel.run" "$PREFIX/var/service/termux-panel/run"
  chmod +x "$PREFIX/var/service/termux-panel/run"

  # cloudflared service
  mkdir -p "$PREFIX/var/service/cloudflared"
  cp "$PANEL_DIR/scripts/service-cloudflared.run" "$PREFIX/var/service/cloudflared/run"
  chmod +x "$PREFIX/var/service/cloudflared/run"
  echo -e "  ${GREEN}✓ termux-services daemons configured for TermuxPanel and Cloudflare Tunnel${NC}"
fi

# Step 6: Install 'tp' CLI helper
echo -e "\n${BLUE}[6/8] Installing 'tp' management CLI...${NC}"
BIN_DIR="$PREFIX/bin"
[ -z "$PREFIX" ] && BIN_DIR="/usr/local/bin"

if [ -d "$BIN_DIR" ]; then
  cp "$PANEL_DIR/scripts/tp" "$BIN_DIR/tp"
  chmod +x "$BIN_DIR/tp"
  echo -e "  ${GREEN}✓ 'tp' command is now available system-wide (run 'tp' anytime!)${NC}"
fi

# Step 7: Cloudflare Wizard
echo -e "\n${BLUE}[7/8] Cloudflare Zero Trust Setup...${NC}"
if [ ! -f "$PANEL_DIR/config/cloudflare-token" ]; then
  bash "$PANEL_DIR/installer/cloudflare.sh"
else
  echo -e "  ${GREEN}✓ Cloudflare Tunnel token already configured in config/cloudflare-token${NC}"
fi

# Step 8: Start Server & Self-Test
echo -e "\n${BLUE}[8/8] Starting TermuxPanel server...${NC}"
cd "$PANEL_DIR/backend"
pkill -f "node.*server.js" || true
sleep 1

# Start in background
nohup node server.js > "$PANEL_DIR/logs/panel.log" 2>&1 &
SERVER_PID=$!
sleep 2

# Verify local listening
if curl -s "http://127.0.0.1:9000/api/auth/status" > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓ Server successfully launched and responding on http://127.0.0.1:9000${NC}"
else
  echo -e "  ${YELLOW}Notice: Server started with PID $SERVER_PID. Check $PANEL_DIR/logs/panel.log for details.${NC}"
fi

echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║               TERMUXPANEL SETUP COMPLETE!                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo -e "\n${BOLD}Access your control panel:${NC}"
echo -e "  Local Dashboard:    ${CYAN}http://127.0.0.1:9000${NC}"
echo -e "  Terminal Manager:   ${YELLOW}tp${NC} (Type ${YELLOW}tp${NC} anywhere in Termux)"
echo -e "  Hosted Sites Dir:   ${CYAN}~/termux-panel/storage/websites/${NC}\n"
