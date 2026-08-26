#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================================
# TermuxPanel - 24/7 Continuous Operation Watchdog & Self-Healing Monitor
# Runs periodically (via crond/service) to ensure zero downtime.
# ==============================================================================

PANEL_DIR="$HOME/termux-panel"
if [ ! -d "$PANEL_DIR" ]; then
  PANEL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

LOG_FILE="$PANEL_DIR/logs/watchdog.log"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

log_msg() {
  echo "[$TIMESTAMP] $1" >> "$LOG_FILE"
}

# 1. Ensure Android CPU Wake-Lock is always active
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock
fi

# 2. Check & resurrect TermuxPanel backend server (127.0.0.1:9000)
if ! pgrep -f "node.*server.js" > /dev/null; then
  log_msg "[ALERT] TermuxPanel backend was down! Restarting..."
  cd "$PANEL_DIR/backend" || exit 1
  nohup node server.js >> "$PANEL_DIR/logs/panel.log" 2>&1 &
  log_msg "[INFO] Backend restarted with PID $!"
fi

# 3. Check & resurrect Cloudflare Tunnel (cloudflared)
TOKEN_FILE="$PANEL_DIR/config/cloudflare-token"
if [ -f "$TOKEN_FILE" ] && command -v cloudflared >/dev/null 2>&1; then
  if ! pgrep -x "cloudflared" > /dev/null; then
    log_msg "[ALERT] Cloudflare Tunnel was down! Restarting tunnel..."
    nohup cloudflared tunnel run --token-file "$TOKEN_FILE" >> "$PANEL_DIR/logs/cloudflared.log" 2>&1 &
    log_msg "[INFO] Cloudflare Tunnel restarted with PID $!"
  fi
fi

# 4. Check & resurrect Cron Daemon (crond)
if command -v crond >/dev/null 2>&1; then
  if ! pgrep -x "crond" > /dev/null; then
    log_msg "[ALERT] Cron daemon was down! Restarting..."
    crond
  fi
fi

# Keep watchdog log bounded to 500 lines to prevent unbounded growth
if [ -f "$LOG_FILE" ]; then
  LINE_COUNT=$(wc -l < "$LOG_FILE")
  if [ "$LINE_COUNT" -gt 500 ]; then
    tail -n 300 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
  fi
fi
