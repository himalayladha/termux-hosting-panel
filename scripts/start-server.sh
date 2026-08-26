#!/data/data/com.termux/files/usr/bin/sh
# ==============================================================================
# Termux:Boot Startup Handler - 24/7 Server Autostart
# Copy or symlink this file to ~/.termux/boot/start-server
# ==============================================================================

# 1. Acquire Android Wake Lock immediately to prevent CPU sleep
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

# 4. Start TermuxPanel Backend
PANEL_DIR="$HOME/termux-panel"
if [ -d "$PANEL_DIR/backend" ]; then
  cd "$PANEL_DIR/backend" || exit 1

  if ! pgrep -f "server.js" > /dev/null; then
    nohup node server.js > "$PANEL_DIR/logs/panel.log" 2>&1 &
  fi

  # 5. Start Cloudflare Tunnel
  if [ -f "$PANEL_DIR/config/cloudflare-token" ]; then
    if command -v cloudflared >/dev/null 2>&1; then
      if ! pgrep -x "cloudflared" > /dev/null; then
        CF_TOKEN=$(cat "$PANEL_DIR/config/cloudflare-token")
        nohup cloudflared tunnel run --token "$CF_TOKEN" > "$PANEL_DIR/logs/cloudflared.log" 2>&1 &
      fi
    fi
  fi

  # 6. Ensure watchdog is present in crontab for continuous 24/7 self-healing
  if command -v crontab >/dev/null 2>&1; then
    WATCHDOG_CMD="* * * * * bash $PANEL_DIR/scripts/watchdog.sh"
    (crontab -l 2>/dev/null | grep -v "watchdog.sh"; echo "$WATCHDOG_CMD") | crontab -
  fi
fi
