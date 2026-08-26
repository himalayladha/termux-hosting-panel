#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# TermuxPanel - Security & Permission Hardening
# ==============================================================================

PANEL_DIR="$HOME/termux-panel"
if [ ! -d "$PANEL_DIR" ]; then
  PANEL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "\n${BLUE}▶ Hardening TermuxPanel security and directory permissions...${NC}"

# Ensure directories exist
mkdir -p "$PANEL_DIR/config" "$PANEL_DIR/data" "$PANEL_DIR/logs" "$PANEL_DIR/storage/websites"

# Restrict permissions on sensitive directories
chmod 700 "$PANEL_DIR/config" || true
chmod 700 "$PANEL_DIR/data" || true

# Generate random SESSION_SECRET if not present
ENV_FILE="$PANEL_DIR/config/panel.env"
if [ ! -f "$ENV_FILE" ]; then
  RAND_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
  echo "SESSION_SECRET=$RAND_SECRET" > "$ENV_FILE"
  echo "PORT=9000" >> "$ENV_FILE"
  echo "HOST=0.0.0.0" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE" || true
  echo -e "  ${GREEN}✓ Generated secure panel.env secret${NC}"
else
  # Ensure existing panel.env binds to 0.0.0.0 for LAN/Wi-Fi PC access
  sed -i 's/HOST=127.0.0.1/HOST=0.0.0.0/g' "$ENV_FILE" 2>/dev/null || true
  grep -q "HOST=" "$ENV_FILE" || echo "HOST=0.0.0.0" >> "$ENV_FILE"
fi

# Hardening Cloudflare token file if exists
if [ -f "$PANEL_DIR/config/cloudflare-token" ]; then
  chmod 600 "$PANEL_DIR/config/cloudflare-token" || true
fi

echo -e "${GREEN}✓ Security permissions configured successfully!${NC}\n"
