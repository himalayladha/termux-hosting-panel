# TermuxPanel 📱⚡

> **A lightweight, full-featured hosting control panel & web engine designed specifically for Android + Termux with Cloudflare Tunnel zero-trust remote administration.**

---

## Features

- 📊 **Server Dashboard**: Real-time CPU, RAM, Storage disk space, Uptime, and application health meters.
- 🌐 **Multi-Runtime Hosting Engine**:
  - **Static HTML/CSS/JS**: Embedded static server.
  - **Node.js**: Direct child process supervision with auto-restart and stdout/stderr logging.
  - **Python**: Flask / FastAPI / WSGI app supervision.
  - **PHP**: Per-site PHP server runtime.
- 🔒 **Zero-Trust Network Model**: Binds strictly to `127.0.0.1`. All public HTTPS traffic is proxied through a single remotely managed **Cloudflare Tunnel** (`android-host`). No open ports or router port-forwarding needed.
- 📁 **Sandboxed File Manager**: Traversal-safe file browser, in-browser code editor, file uploader, downloader, and directory manager.
- 🗄️ **SQLite Database Explorer**: In-panel database inspection, table browsing, pagination, SQL query executor, and DB export.
- ⏱️ **Cron Jobs**: Visual scheduler with common presets (every minute, hourly, daily, custom) synchronized with `crond`.
- 📜 **Log Viewer**: Stream and search panel logs, cloudflared logs, and per-website access and error logs.
- 💾 **Backup Engine**: One-click full or partial `.tar.gz` archive creation and download.
- 🚀 **Termux:Boot & Wake Lock**: Automatic background startup on Android device boot with CPU wake lock integration.
- ⚡ **`tp` Terminal CLI**: Fast command-line helper for status, restarts, logs, backups, and interactive menus.

---

## 🚀 One-Tap Installation

Inside Termux on your Android device:

```bash
# Clone the repository
git clone https://github.com/himalayladha/termux-hosting-panel.git ~/termux-panel
cd ~/termux-panel

# Run the installer
bash installer/install.sh
```

The idempotent installer will:
1. Check your Android/Termux environment.
2. Install dependencies (`nodejs`, `python`, `php`, `sqlite`, `cronie`, `openssh`, `cloudflared`).
3. Set up directories and security permissions (`chmod 600` on secrets).
4. Bootstrap SQLite database (`data/panel.db`).
5. Configure Termux:Boot (`~/.termux/boot/start-server`).
6. Install the `tp` terminal CLI.
7. Launch TermuxPanel at `http://127.0.0.1:9000`.

---

## ☁️ Cloudflare Zero Trust Setup

To access your panel and websites securely from anywhere over HTTPS:

1. Open [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) > **Networks** > **Tunnels**.
2. Create a tunnel named `android-host`.
3. Copy your tunnel token and run:
   ```bash
   tp cloudflare
   ```
4. Add your Public Hostname routes in the Cloudflare dashboard:
   - `panel.yourdomain.com` ➔ `HTTP 127.0.0.1:9000` (Control Panel)
   - `example.com` ➔ `HTTP 127.0.0.1:8100` (Hosted Website)
   - `api.yourdomain.com` ➔ `HTTP 127.0.0.1:8101` (Node/Python API)

See [docs/CLOUDFLARE_GUIDE.md](docs/CLOUDFLARE_GUIDE.md) for full instructions.

---

## 💻 Terminal Management CLI (`tp`)

Manage your server directly from the Termux terminal at any time:

```bash
tp           # Open interactive TUI management menu
tp status    # Check panel, cloudflare, and cron status
tp start     # Start panel server and tunnel
tp stop      # Stop panel and running processes
tp restart   # Restart server
tp logs      # Tail live server logs
tp backup    # Create a full backup archive
```

---

## 🔋 24/7 Continuous Operation & Worldwide Remote Access

TermuxPanel is engineered to stay online **24/7/365** as a lightweight home or mobile microserver:
- **`termux-wake-lock`**: Automatically prevents Android CPU sleep when the screen is locked.
- **Auto-Healing Watchdog**: A background monitor (`scripts/watchdog.sh`) runs every minute via `crond` to automatically resurrect any dead processes.
- **Cloudflare Zero Trust Tunnel**: Handles dynamic IP changes and mobile network handoffs (Wi-Fi to 4G/5G) with automatic reconnects.
- **Termux:Boot Integration**: Automatically boots TermuxPanel and all active websites on Android device reboot.

👉 Read the full **[24/7 Android Survival Guide](docs/ANDROID_247_GUIDE.md)** for device-specific battery optimization settings (Samsung, Xiaomi, Pixel, OnePlus).

---

## 📂 Project Structure

```
~/termux-panel/
├── backend/             # Express server, SQLite DB, process supervisor, APIs
├── frontend/            # Vanilla HTML5/CSS3/JS responsive web dashboard
├── storage/websites/    # Hosted website document roots
├── data/                # SQLite database (panel.db) and backup archives
├── logs/                # System, Cloudflare, and website log files
├── config/              # Cloudflare token and environment variables
├── templates/           # Starter templates for HTML, Node, Python, PHP
├── installer/           # Idempotent setup and security scripts
├── scripts/             # 'tp' CLI and Termux:Boot scripts
└── docs/                # Architecture and Cloudflare setup documentation
```

---

## 🛡️ Security

- **Localhost Binding**: Panel and hosted apps bind exclusively to `127.0.0.1`.
- **Path Traversal Protection**: File operations verify normalized roots to prevent directory escapes (`../../`).
- **Password Hashing**: Strong Bcrypt hashing with random salt rounds.
- **Brute Force Protection**: Express rate limiting on authentication routes.
- **Secure File Permissions**: Token files and configuration restricted with `chmod 600` / `700`.

---

## 📄 License
MIT License. Built for the Termux community.
