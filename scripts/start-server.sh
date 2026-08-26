#!/data/data/com.termux/files/usr/bin/sh
# ==============================================================================
# Termux:Boot Startup Handler
# Copy or symlink this file to ~/.termux/boot/start-server
# ==============================================================================

# 1. Acquire Android Wake Lock to prevent CPU sleep
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

# 2. Source termux environment
if [ -f "$PREFIX/etc/profile.d/start-services.sh" ]; then
  . "$PREFIX/etc/profile.d/start-services.sh"
fi

# 3. Start crond
if command -v crond >/dev/null 2>&1; then
  pgrep -x crond >/dev/null || crond
fi

# 4. Start TermuxPanel
PANEL_DIR="$HOME/termux-panel"
if [ -d "$PANEL_DIR/backend" ]; then
  cd "$PANEL_DIR/backend" || exit 1

  # Check if termux-services is used
  if command -v sv >/dev/null 2>&1 && [ -d "$PREFIX/var/service/termux-panel" ]; then
    sv up termux-panel
  else
    nohup node server.js > "$PANEL_DIR/logs/panel.log" 2>&1 &
  fi

  # Start Cloudflare Tunnel if configured
  if [ -f "$PANEL_DIR/config/cloudflare-token" ]; then
    if command -v cloudflared >/dev/null 2>&1; then
      if command -v sv >/dev/null 2>&1 && [ -d "$PREFIX/var/service/cloudflared" ]; then
        sv up cloudflared
      else
        nohup cloudflared tunnel run --token-file "$PANEL_DIR/config/cloudflare-token" > "$PANEL_DIR/logs/cloudflared.log" 2>&1 &
      fi
    fi
  fi
fi
