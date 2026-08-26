#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# TermuxPanel - Safe Uninstaller
# ==============================================================================

PANEL_DIR="$HOME/termux-panel"
if [ ! -d "$PANEL_DIR" ]; then
  PANEL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "\n${RED}══════════════════════════════════════════════════════════${NC}"
echo -e "${RED}             TERMUXPANEL UNINSTALLATION                   ${NC}"
echo -e "${RED}══════════════════════════════════════════════════════════${NC}\n"

read -p "Are you sure you want to stop and uninstall TermuxPanel? [y/N]: " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Uninstallation cancelled."
  exit 0
fi

echo -e "\n${YELLOW}▶ Stopping running processes and services...${NC}"
pkill -f "node.*server.js" || true
pkill -x "cloudflared" || true

# Remove termux-services definitions
if [ -d "$PREFIX/var/service/termux-panel" ]; then
  rm -rf "$PREFIX/var/service/termux-panel"
fi
if [ -d "$PREFIX/var/service/cloudflared" ]; then
  rm -rf "$PREFIX/var/service/cloudflared"
fi

# Remove tp binary symlink
if [ -f "$PREFIX/bin/tp" ]; then
  rm -f "$PREFIX/bin/tp"
fi

read -p "Do you also want to permanently delete all hosted websites and databases in $PANEL_DIR? [y/N]: " delete_data
if [[ "$delete_data" == "y" || "$delete_data" == "Y" ]]; then
  rm -rf "$PANEL_DIR"
  echo -e "${GREEN}✓ TermuxPanel directory deleted.${NC}"
else
  echo -e "${YELLOW}Notice: Website files preserved at $PANEL_DIR/storage/websites/${NC}"
fi

echo -e "\n${GREEN}✓ TermuxPanel has been uninstalled.${NC}\n"
