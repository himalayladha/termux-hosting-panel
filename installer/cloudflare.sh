#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# TermuxPanel - Cloudflare Tunnel Configuration Wizard
# Supports Option 1 (Semi-Automatic) & Option 2 (Fully-Automatic API)
# ==============================================================================

PANEL_DIR="$HOME/termux-panel"
if [ ! -d "$PANEL_DIR" ]; then
  PANEL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "\n${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}       CLOUDFLARE ZERO TRUST TUNNEL CONFIGURATION        ${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}"
echo -e "Choose your preferred Cloudflare setup method:\n"
echo -e "  ${BOLD}1. Semi-Automatic (Without API)${NC}"
echo -e "     - You create tunnel in Cloudflare Zero Trust Dashboard"
echo -e "     - Paste the tunnel token here (Safe & simple)\n"
echo -e "  ${BOLD}2. Fully-Automatic (Using Cloudflare API)${NC}"
echo -e "     - Enter your Cloudflare API Token + Domain"
echo -e "     - Script auto-creates Tunnel, Ingress Routes, and DNS CNAMEs\n"
echo -e "  ${BOLD}3. Skip for now (Configure later via Web Dashboard)${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════${NC}\n"

read -p "Select setup method [1-3] (Default: 1): " METHOD
METHOD=${METHOD:-1}

if [ "$METHOD" == "1" ]; then
  echo -e "\n${BLUE}▶ Semi-Automatic Setup (Paste Tunnel Token):${NC}"
  echo -e "  1. Go to ${YELLOW}https://one.dash.cloudflare.com/${NC}"
  echo -e "  2. Go to: ${BLUE}Networks > Tunnels > Create a tunnel${NC}"
  echo -e "  3. Name it (e.g. ${CYAN}android-host${NC}) and copy the token"
  echo ""
  read -p "Paste your Cloudflare Tunnel Token: " TOKEN

  if [ -n "$TOKEN" ]; then
    mkdir -p "$PANEL_DIR/config"
    echo "$TOKEN" > "$PANEL_DIR/config/cloudflare-token"
    chmod 600 "$PANEL_DIR/config/cloudflare-token" || true
    echo -e "\n${GREEN}✓ Token saved securely in $PANEL_DIR/config/cloudflare-token (chmod 600)${NC}"

    if command -v cloudflared >/dev/null 2>&1; then
      pkill -x cloudflared || true
      nohup cloudflared tunnel run --token-file "$PANEL_DIR/config/cloudflare-token" > "$PANEL_DIR/logs/cloudflared.log" 2>&1 &
      echo -e "${GREEN}✓ Cloudflare Tunnel launched in background (PID: $!)${NC}\n"
    fi
  else
    echo -e "${YELLOW}Token empty. Skipping.${NC}\n"
  fi

elif [ "$METHOD" == "2" ]; then
  echo -e "\n${BLUE}▶ Fully-Automatic Setup (Cloudflare API):${NC}"
  read -p "Enter your Cloudflare API Token: " API_TOKEN
  read -p "Enter your domain name (e.g. example.com): " DOMAIN
  read -p "Enter panel subdomain (Default: panel): " SUBDOMAIN
  SUBDOMAIN=${SUBDOMAIN:-panel}

  if [ -n "$API_TOKEN" ] && [ -n "$DOMAIN" ]; then
    echo -e "\n${BLUE}Connecting to Cloudflare API to provision Tunnel and DNS records...${NC}"
    cd "$PANEL_DIR/backend"
    
    # Run node runner for auto setup
    node -e "
      const cfService = require('./services/cloudflare.service');
      const config = require('./config/app.config');
      (async () => {
        try {
          const res = await cfService.setupTunnelViaApi({
            apiToken: '$API_TOKEN',
            domain: '$DOMAIN',
            tunnelName: 'termux-android-tunnel',
            routes: [
              { hostname: '$SUBDOMAIN.$DOMAIN', service: 'http://127.0.0.1:' + config.PORT }
            ]
          });
          console.log('\x1b[32m✓ Tunnel and DNS records configured successfully!\x1b[0m');
          console.log('\x1b[1mPanel URL: https://$SUBDOMAIN.$DOMAIN\x1b[0m');
        } catch (err) {
          console.error('\x1b[31mError during API setup:\x1b[0m', err.message);
        }
      })();
    "
  else
    echo -e "${YELLOW}API Token or domain missing. Skipping.${NC}\n"
  fi

else
  echo -e "${YELLOW}Notice: Cloudflare setup skipped. You can configure it anytime in the web dashboard or via 'tp cloudflare'.${NC}\n"
fi
