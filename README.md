# TermuxPanel 📱⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Android](https://img.shields.io/badge/Android-7.0%2B-brightgreen.svg)](https://www.android.com/)
[![Termux](https://img.shields.io/badge/Platform-Termux-black.svg)](https://termux.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Zero%20Trust%20Tunnel-orange.svg)](https://www.cloudflare.com/)
[![Database](https://img.shields.io/badge/Database-SQLite3-blue.svg)](https://www.sqlite.org/)

> **A lightweight, production-grade web hosting control panel and multi-runtime application supervisor engineered specifically for Android devices via Termux. Expose your hosted websites to the global internet over HTTPS with Cloudflare Zero Trust Tunnels — zero router port-forwarding, zero dynamic DNS, and zero exposed public IPs required.**

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Minimum Hardware & OS Requirements](#-minimum-hardware--os-requirements)
- [How It Works (Networking & Architecture Concept)](#-how-it-works-networking--architecture-concept)
- [Quick Start: One-Tap Installation](#-quick-start-one-tap-installation)
- [Cloudflare Zero Trust Setup Guide](#-cloudflare-zero-trust-setup-guide)
  - [Method 1: Semi-Automatic (Paste Token)](#-method-1-semi-automatic-setup-recommended-for-beginners)
  - [Method 2: Fully-Automatic (Cloudflare API)](#-method-2-fully-automatic-setup-using-cloudflare-api)
  - [Cloudflare Access Zero Trust Security](#-optional-extra-security-cloudflare-access-zero-trust-layer)
- [Panel Modules & Feature Guide](#-panel-modules--feature-guide)
  - [1. Real-time Dashboard](#1-real-time-dashboard)
  - [2. Multi-Runtime Website & App Engine](#2-multi-runtime-website--app-engine)
  - [3. Sandboxed File Manager & In-Browser Code Editor](#3-sandboxed-file-manager--in-browser-code-editor)
  - [4. SQLite Database Explorer & SQL Query Runner](#4-sqlite-database-explorer--sql-query-runner)
  - [5. Scheduled Cron Job Manager](#5-scheduled-cron-job-manager)
  - [6. Multi-Source Log Viewer](#6-multi-source-log-viewer)
  - [7. Backup & Restore Engine](#7-backup--restore-engine)
- [Terminal CLI (`tp`) Reference](#-terminal-cli-tp-reference)
- [24/7 Continuous Operation & Android Background Survival](#-247-continuous-operation--android-background-survival)
- [Directory Structure](#-directory-structure)
- [Security & Sandboxing Model](#-security--sandboxing-model)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)
- [License](#-license)

---

## 🌟 Overview

TermuxPanel transforms any Android smartphone, tablet, or Android TV box into a standalone micro-server. Traditional web hosting on residential or mobile connections is notoriously difficult due to **CGNAT (Carrier-Grade NAT)**, dynamic IP churn, and firewall restrictions. 

TermuxPanel solves this elegantly by separating the **Control Plane** (`127.0.0.1:9000`) from the **Application Plane** (`127.0.0.1:8100–8999`) and bridging them to Cloudflare's global edge network via an outbound-only encrypted **Cloudflare Tunnel**.

---

## 🚀 Key Features

- 📊 **Live System Metrics**: Monitor real-time CPU utilization, RAM usage, storage disk space, uptime, and app health.
- 🌐 **Multi-Runtime Hosting Engine**:
  - **Static HTML/CSS/JS**: Embedded high-performance static HTTP server.
  - **Node.js**: Full child process supervisor (`node server.js`) with crash recovery and log capture.
  - **Python**: Support for WSGI/ASGI apps (**Flask**, **FastAPI**, **Django**) with virtualenv support.
  - **PHP**: Per-website PHP CLI server runtime.
- 🔒 **Zero-Trust Network Model**: Binds strictly to `127.0.0.1`. All external HTTPS traffic is routed through a single remotely managed Cloudflare Tunnel (`android-host`). No open router ports.
- 📁 **Sandboxed File Manager**: Path-traversal proof file explorer, in-browser code editor, file uploader, downloader, and directory manager.
- 🗄️ **SQLite Database Explorer**: In-panel database inspection, table browsing, schema viewer, paginated rows, and custom SQL runner.
- ⏱️ **Cron Jobs**: Visual scheduler with presets (every minute, hourly, daily, weekly) synchronized with system `crond`.
- 📜 **Log Viewer**: Stream and search panel logs, cloudflared tunnel logs, and website access/error logs with search filters.
- 💾 **Backup Engine**: One-click creation of `.tar.gz` archives for full server, websites, or databases with download and deletion support.
- 🚀 **Termux:Boot & Wake Lock**: Automatic background startup on Android device boot with CPU wake lock integration.
- ⚡ **`tp` Terminal CLI**: Fast command-line helper for status, restarts, logs, backups, and interactive menus.
- 🔋 **Auto-Healing Watchdog**: Background watchdog daemon (`scripts/watchdog.sh`) resurrects dead processes every minute.

---

## 📱 Minimum Hardware & OS Requirements

| Component | Minimum Specification | Recommended Specification |
|---|---|---|
| **Android Version** | **Android 7.0 (Nougat)** or higher | **Android 10.0+** |
| **RAM** | **2 GB** | **3 GB – 4 GB+** |
| **Free Storage** | **1 GB** | **4 GB+** (for website storage, database files & backups) |
| **Processor Architecture** | **ARM64 (`aarch64`)**, ARMv7 (`arm`), or `x86_64` | **ARM64** |
| **Termux App** | [Termux from F-Droid](https://f-droid.org/packages/com.termux/) *(⚠️ Do **NOT** use Google Play version)* | F-Droid release |
| **Autostart App** | [Termux:Boot from F-Droid](https://f-droid.org/packages/com.termux.boot/) (Optional, for auto-boot) | F-Droid release |
| **Internet** | Any active Wi-Fi or 4G/5G connection | Stable Wi-Fi / Hotspot |

---

## 🧠 How It Works (Networking & Architecture Concept)

### ❌ Does it need Port Forwarding or a Static IP?
**NO.** You do **NOT** need:
- ❌ Port Forwarding on your Wi-Fi router.
- ❌ A Static Public IP from your ISP or telecom carrier.
- ❌ Dynamic DNS (DDNS) services like No-IP or DuckDNS.
- ❌ Any open inbound ports on your Android phone.

---

### 🌐 The Cloudflare Tunnel Concept: Outbound-Only Magic

Most mobile networks and home ISPs use **CGNAT (Carrier-Grade NAT)** or dynamic IPs that block incoming connections, preventing you from hosting traditional servers on a phone.

TermuxPanel solves this using a **Remotely Managed Cloudflare Zero Trust Tunnel**:

```
 ┌─────────────────────────────────────────────────────────┐
 │               VISITOR ANYWHERE IN THE WORLD             │
 └────────────────────────────┬────────────────────────────┘
                              │
                              ▼ (Public HTTPS Request)
 ┌─────────────────────────────────────────────────────────┐
 │               CLOUDFLARE GLOBAL EDGE WAF                │
 │                 panel.yourdomain.com                    │
 │                  app.yourdomain.com                     │
 └────────────────────────────┬────────────────────────────┘
                              │
                              │ ◄── Outbound-Only Encrypted Tunnel (TLS / QUIC)
                              │     (Initiated by your phone to Cloudflare)
                              ▼
 ┌─────────────────────────────────────────────────────────┐
 │                     ANDROID PHONE                       │
 │                                                         │
 │  ┌───────────────────────────────────────────────────┐  │
 │  │              cloudflared daemon                   │  │
 │  └──────────┬─────────────────────────────┬──────────┘  │
 │             │ (Routes locally)            │             │
 │             ▼                             ▼             │
 │  ┌───────────────────────┐   ┌───────────────────────┐  │
 │  │   CONTROL PLANE       │   │   APPLICATION PLANE   │  │
 │  │   TermuxPanel Admin   │   │   Hosted Websites     │  │
 │  │   (127.0.0.1:9000)    │   │   - HTML   (:8100)    │  │
 │  │   - Express Backend   │   │   - Node   (:8101)    │  │
 │  │   - SQLite (panel.db) │   │   - PHP    (:8102)    │  │
 │  │   - Responsive UI     │   │   - Python (:8103)    │  │
 │  └───────────────────────┘   └───────────────────────┘  │
 └─────────────────────────────────────────────────────────┘
```

1. **Outbound Connection**: When TermuxPanel starts, the lightweight `cloudflared` daemon on your phone establishes an **outbound-only connection** to Cloudflare's closest edge server.
2. **Reverse Proxy & Free SSL**: When a visitor enters `https://panel.yourdomain.com` or `https://yoursite.com`, Cloudflare terminates the HTTPS connection, provides free SSL, filters malicious traffic, and relays the request down through your phone's existing outbound tunnel.
3. **Local Dispatch**: `cloudflared` receives the request inside your phone and passes it locally to `127.0.0.1:9000` (for the panel) or `127.0.0.1:8100` (for your websites).
4. **Network Flexibility**: Because the connection is outbound, your server **remains online even if your phone's IP changes**, or if your phone switches between Wi-Fi and 4G/5G mobile data.

---

## ⚡ Quick Start: One-Tap Installation

### Step 1: Install Termux from F-Droid
1. Download and install [Termux from F-Droid](https://f-droid.org/packages/com.termux/).
2. Open Termux and run:
   ```bash
   pkg update && pkg upgrade -y
   pkg install -y git
   ```

### Step 2: Clone and Run Installer
```bash
# Clone the repository
git clone https://github.com/himalayladha/termux-hosting-panel.git ~/termux-panel
cd ~/termux-panel

# Run the idempotent installer
bash installer/install.sh
```

### What the Installer Does Automatically:
1. Verifies the Android / Termux environment and CPU architecture.
2. Installs dependencies: `nodejs`, `python`, `php`, `sqlite`, `cronie`, `openssh`, `tar`, `curl`, `wget`, `termux-services`, and `cloudflared`.
3. Sets up folder structures and hardens directory permissions (`chmod 700` on data and `chmod 600` on secret files).
4. Installs Node.js backend packages.
5. Bootstraps the SQLite database (`data/panel.db`) with WAL mode.
6. Configures `Termux:Boot` autostart and acquires `termux-wake-lock`.
7. Registers the **24/7 self-healing watchdog monitor** in `crontab`.
8. Symlinks the `tp` management command to `$PREFIX/bin/tp`.
9. Launches TermuxPanel on `http://127.0.0.1:9000`.

---

## ☁️ Cloudflare Zero Trust Setup Guide

Cloudflare Zero Trust gives your Android server an enterprise-grade HTTPS endpoint with global DDoS protection.

---

### 📋 Prerequisites
1. A **Cloudflare Account** ([Sign up free](https://dash.cloudflare.com/sign-up)).
2. A **Domain Name** active on Cloudflare (e.g., `yourdomain.com`).
3. Access to the **Cloudflare Zero Trust Dashboard** ([one.dash.cloudflare.com](https://one.dash.cloudflare.com/)).

---

### 🟢 Method 1: Semi-Automatic Setup (Recommended for Beginners)

#### Step 1: Create the Tunnel in Cloudflare
1. Go to the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. In the left sidebar, click **Networks** ➔ **Tunnels**.
3. Click the blue **Add a tunnel** (or **Create a tunnel**) button.
4. Select **Cloudflared** as the connector type and click **Next**.
5. Enter a name for your tunnel (e.g., `android-host`) and click **Save tunnel**.

#### Step 2: Copy Your Tunnel Token
1. On the "Install and run a connector" page, find the command for Linux.
2. It contains:
   ```bash
   cloudflared.exe service install eyJhIjoiYmNm... (long token string)
   ```
3. Copy **ONLY the token string** starting with `eyJh...`.

#### Step 3: Save the Token in TermuxPanel
- **Via Web Dashboard**: Open `http://127.0.0.1:9000` ➔ Click **Cloudflare Tunnel** tab ➔ Under **Option 1: Semi-Automatic**, paste your token ➔ Click **Save & Launch Tunnel**.
- **Via Termux Terminal**: Run `tp cloudflare` ➔ Select `1 (Semi-Automatic)` ➔ Paste your token.

The token is saved securely in `~/termux-panel/config/cloudflare-token` (`chmod 600`), and `cloudflared` starts immediately.

#### Step 4: Configure Public Hostname Routes
Back in your [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/):
1. Go to **Networks** ➔ **Tunnels** ➔ Click on your tunnel (`android-host`) ➔ Click **Configure**.
2. Go to the **Public Hostname** tab ➔ Click **Add a public hostname**.

##### Route 1: The Control Panel
- **Subdomain**: `panel`
- **Domain**: `yourdomain.com`
- **Path**: *(leave empty)*
- **Service Type**: `HTTP`
- **URL**: `127.0.0.1:9000`
- Click **Save hostname**.

##### Route 2: Your Hosted Website (HTML, Node, Python, or PHP)
- **Subdomain**: `@` *(or `www` / `app`)*
- **Domain**: `yourdomain.com`
- **Service Type**: `HTTP`
- **URL**: `127.0.0.1:8100` *(matches the port assigned in TermuxPanel)*
- Click **Save hostname**.

---

### ⚡ Method 2: Fully-Automatic Setup (Using Cloudflare API)

This method lets TermuxPanel talk directly to Cloudflare to automatically create the tunnel, configure routing rules, and create the DNS CNAME records in one click.

#### Step 1: Create a Cloudflare API Token
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token** ➔ Custom token ➔ **Get started**.
3. Set Token name: `TermuxPanel Tunnel Token`.
4. Under **Permissions**, add these 3 permissions:
   - **Account** ➔ **Cloudflare Tunnel** ➔ **Edit**
   - **Zone** ➔ **DNS** ➔ **Edit**
   - **Zone** ➔ **Zone** ➔ **Read**
5. Under **Account Resources**, choose **Include** ➔ **All accounts**.
6. Under **Zone Resources**, choose **Include** ➔ **All zones** (or select your specific domain).
7. Click **Continue to summary** ➔ **Create Token** ➔ Copy the API Token.

#### Step 2: Run Auto-Setup
- **In Web Dashboard**: Go to `http://127.0.0.1:9000` ➔ **Cloudflare Tunnel** ➔ **Option 2: Fully-Automatic** ➔ Enter API Token, Domain (`yourdomain.com`), and Subdomain (`panel`) ➔ Click **⚡ Run Fully-Automatic Setup**.
- **In Termux Terminal**: Run `tp cloudflare` ➔ Select `2 (Fully-Automatic)` ➔ Enter token and domain.

TermuxPanel will automatically provision the tunnel, create DNS CNAME records, upload ingress mappings, and start `cloudflared`!

---

### 🛡️ Optional Extra Security: Cloudflare Access (Zero Trust Layer)
To require email PIN or Google/GitHub login before anyone can even see the login screen:
1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) ➔ **Access** ➔ **Applications** ➔ **Add an application**.
2. Select **Self-hosted** ➔ Domain: `panel.yourdomain.com`.
3. Under **Policies**, add a rule allowing only your email address (`you@gmail.com`).
4. Click **Save application**.

---

## 🖥️ Panel Modules & Feature Guide

### 1. Real-time Dashboard
- **CPU & RAM Meters**: Live utilization percentages calculated from `/proc/stat` and `/proc/meminfo`.
- **Disk Storage**: Visual progress bar of available vs used flash storage on your Android device.
- **System Uptime**: Formatted uptime tracker (`4d 17h 32m`).
- **Running Applications Card**: Real-time status list of active web services with one-click management.

---

### 2. Multi-Runtime Website & App Engine
Click **+ Create Website** to deploy an application:

| Type | How It Runs | Default Entry | Port Allocation |
|---|---|---|---|
| **HTML** | Embedded Node HTTP static server | `public/index.html` | Auto (`8100–8999`) |
| **Node.js** | Child process (`node server.js`) with PID & log capture | `server.js` | Auto (`8100–8999`) |
| **Python** | Python process (Flask / FastAPI / uvicorn) | `app.py` | Auto (`8100–8999`) |
| **PHP** | PHP CLI server (`php -S 127.0.0.1:<port> -t public`) | `public/index.php` | Auto (`8100–8999`) |

- **Lifecycle Controls**: Start, Stop, and Restart any website with one click.
- **Port Manager**: Automatically allocates conflict-free ports from `8100` to `8999`.
- **Autostart Toggle**: Automatically resurrects selected websites when the phone reboots.

---

### 3. Sandboxed File Manager & In-Browser Code Editor
- **Strict Security Sandboxing**: Normalized path verification ensures all file requests strictly reside within `storage/websites/<name>/`. Path traversal attempts (`../../`) are blocked.
- **In-Browser Code Editor**: Edit HTML, JavaScript, Python, PHP, CSS, and JSON files directly from your phone or remote browser.
- **File Upload & Download**: Drag-and-drop file uploader with chunked handling and instant archive downloads.
- **Folder Management**: Create folders, rename files, and delete items.

---

### 4. SQLite Database Explorer & SQL Query Runner
- **Auto-Discovery**: Automatically discovers all `.db`, `.sqlite`, and `.sqlite3` files in your storage and website directories.
- **Visual Table Browser**: View all tables, row counts, and column schemas (Data Types, Nullability, Primary Keys).
- **Paginated Row Viewer**: Clean table viewer with pagination support for tables with thousands of records.
- **Custom SQL Query Runner**: Execute custom SQL statements (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE`) directly from the UI.
- **One-Click Export**: Download the entire raw `.db` database file to your local computer.

---

### 5. Scheduled Cron Job Manager
- **Visual Scheduler**: Create scheduled jobs with standard expressions (`* * * * *`) or choose presets (Every Minute, Hourly, Daily at Midnight, Weekly on Sunday).
- **System Sync**: Synchronizes all enabled tasks directly with Termux's background `crond` daemon.
- **On-Demand Execution**: Click **▶ Run Now** to test and trigger any cron job instantly with exit status reporting.

---

### 6. Multi-Source Log Viewer
- **Unified Log Explorer**: Read and search across:
  - `logs/panel.log` (System and API logs)
  - `logs/cloudflared.log` (Cloudflare Tunnel logs)
  - `logs/websites/<name>/access.log` (Web traffic access logs)
  - `logs/websites/<name>/error.log` (Application crash & stderr logs)
- **Live Search & Filter**: Real-time keyword filtering to isolate errors quickly.
- **Log Clear**: Safely purge log files when they grow too large.

---

### 7. Backup & Restore Engine
- **Backup Scopes**:
  - **Full Server**: Websites storage + SQLite databases + configuration files.
  - **Websites Storage Only**: All document roots in `storage/websites/`.
  - **Databases & Config Only**: `data/panel.db` and app configuration.
- **Format**: Compressed `.tar.gz` archive with timestamps.
- **Download & Delete**: Download backup archives directly to your PC for off-device redundancy.

---

## 💻 Terminal CLI (`tp`) Reference

TermuxPanel includes a dedicated bash CLI tool (`tp`) symlinked directly into your path:

```bash
# Open the interactive Terminal Management Menu
tp
```

```
╔══════════════════════════════════════════╗
║             TERMUXPANEL                  ║
║     Android Hosting Control Plane        ║
╚══════════════════════════════════════════╝

  1. Open Panel URL (http://127.0.0.1:9000)
  2. Server Status
  3. Start Server
  4. Stop Server
  5. Restart Server
  6. View Live Logs
  7. Configure Cloudflare Tunnel
  8. Create Backup
  9. Run Self Health Check
  0. Exit
```

### Direct CLI Commands:
```bash
tp status      # Check if Panel, Cloudflare Tunnel, and Cron are running
tp start       # Start TermuxPanel and Cloudflare Tunnel in background
tp stop        # Gracefully stop all panel and tunnel processes
tp restart     # Restart the server and tunnel daemons
tp logs        # Live tail the last 30 lines of panel.log
tp cloudflare  # Launch the Cloudflare Tunnel setup wizard
tp backup      # Generate an immediate full server backup archive
```

---

## 🔋 24/7 Continuous Operation & Android Background Survival

To ensure your Android micro-server runs **24/7/365** without being killed when the screen turns off:

### 1. Android Wake Lock (`termux-wake-lock`)
TermuxPanel automatically acquires a CPU wake-lock. This keeps the phone CPU running while allowing the screen to turn off completely.

### 2. Disable Android Battery Optimization (Mandatory)
- **Stock Android / Pixel**: Settings ➔ Apps ➔ Termux ➔ Battery ➔ Set to **Unrestricted**.
- **Samsung (One UI)**: Settings ➔ Apps ➔ Termux ➔ Battery ➔ **Unrestricted**. Also add Termux to **Never sleeping apps**.
- **Xiaomi / Redmi (MIUI / HyperOS)**: Settings ➔ Apps ➔ Manage Apps ➔ Termux ➔ Enable **Autostart** & set Battery Saver to **No restrictions**. Lock Termux in recent apps 🔒.
- **OnePlus / Realme / Oppo**: Settings ➔ Battery ➔ Optimize battery use ➔ Set Termux to **Don't optimize**.

### 3. Automated Self-Healing Watchdog (`scripts/watchdog.sh`)
TermuxPanel installs a cron watchdog that checks your services every minute. If Android's memory manager ever kills Node.js or Cloudflare Tunnel, the watchdog **automatically resurrects them within 60 seconds**.

👉 Read the full **[24/7 Android Survival Guide](docs/ANDROID_247_GUIDE.md)** for detailed OEM instructions.

---

## 📂 Directory Structure

```
~/termux-panel/
│
├── backend/                  # Control Plane Express Server
│   ├── auth/                 # Bcrypt authentication & session middleware
│   ├── config/               # App configuration & dynamic port allocator
│   ├── database/             # SQLite connection & schema migrations
│   ├── routes/               # REST API endpoints (Websites, Files, DB, Cron, Logs, Backups)
│   ├── services/             # Process supervisor, file manager, system metrics
│   ├── test/                 # Automated verification test suite
│   └── server.js             # Express server entry point (127.0.0.1:9000)
│
├── frontend/                 # Responsive Vanilla HTML5/CSS3/JS Web UI
│   ├── css/                  # Dark modern theme stylesheets
│   ├── js/                   # Modular SPA controllers
│   └── index.html            # Main administration dashboard
│
├── storage/
│   └── websites/             # Document roots for hosted websites
│       ├── mysite.com/       # Example static or dynamic website
│       └── api.domain.com/   # Example API service
│
├── data/
│   ├── panel.db              # SQLite system database
│   └── backups/              # Generated tar.gz backup archives
│
├── logs/
│   ├── panel.log             # Panel system log
│   ├── cloudflared.log       # Cloudflare Tunnel daemon log
│   ├── watchdog.log          # 24/7 watchdog monitor log
│   └── websites/             # Per-website access and error logs
│
├── config/
│   ├── cloudflare-token      # Secure tunnel token file (chmod 600)
│   └── panel.env             # Local environment variables
│
├── templates/                # Starter boilerplate templates
│   ├── html/                 # Static HTML/CSS starter
│   ├── node/                 # Express starter
│   ├── python/               # Python starter
│   └── php/                  # PHP starter
│
├── installer/                # Idempotent installation & setup scripts
│   ├── install.sh            # One-tap master installer
│   ├── dependencies.sh       # Termux package installer
│   ├── security.sh           # Security & permission hardening
│   ├── cloudflare.sh         # Interactive Cloudflare wizard
│   └── uninstall.sh          # Safe uninstaller
│
├── scripts/                  # Management and daemon scripts
│   ├── tp                    # Terminal CLI management command
│   ├── watchdog.sh           # 24/7 self-healing monitor
│   ├── start-server.sh       # Termux:Boot autostart script
│   ├── service-panel.run     # termux-services panel daemon
│   └── service-cloudflared.run # termux-services cloudflared daemon
│
├── docs/                     # Detailed architectural documentation
│   ├── CLOUDFLARE_GUIDE.md   # Cloudflare Zero Trust setup manual
│   ├── ANDROID_247_GUIDE.md  # 24/7 Android optimization guide
│   └── ARCHITECTURE.md       # Internal architecture deep dive
│
├── LICENSE                   # MIT License
└── README.md                 # Complete documentation
```

---

## 🛡️ Security & Sandboxing Model

- **Localhost Binding**: All internal services bind exclusively to `127.0.0.1`. No ports are directly reachable on your local Wi-Fi or public IP.
- **Path Traversal Protection**: The File Manager normalizes all file paths and verifies that they resolve inside `storage/websites/<name>/`. Attempts to access `../../etc/passwd` or `/data/data/...` are immediately blocked.
- **Password Hashing**: Passwords are encrypted using Bcrypt with 10 salt rounds.
- **Brute Force Protection**: Express rate limiting restricts excessive authentication attempts.
- **Secure File Permissions**: Tunnel tokens and environment secrets are hardened with `chmod 600`.
- **Zero Inbound Attack Surface**: Cloudflare Tunnel uses outbound-only connections, completely shielding your home IP and mobile network from port scans and DDoS attacks.

---

## ❓ Troubleshooting & FAQs

### Q1: I see "Error 1033 (Cloudflare Tunnel Error)" in my browser.
- **Cause**: `cloudflared` is not running on your phone, or the phone lost internet connectivity.
- **Fix**: Open Termux and run `tp status`. If stopped, run `tp start`. Ensure `termux-wake-lock` is enabled.

### Q2: I get "HTTP 502 Bad Gateway" when visiting my website.
- **Cause**: The hosted website (HTML, Node, Python, or PHP) is stopped or the port in Cloudflare does not match the port in TermuxPanel.
- **Fix**: Check the **Websites** tab in TermuxPanel. Make sure the website status is **RUNNING**. Verify that the port in your Cloudflare Public Hostname route matches the port shown in TermuxPanel (e.g. `8100`).

### Q3: How do I make my website run on `mysite.com` instead of a subdomain?
- **Fix**: In your Cloudflare Zero Trust Dashboard under your tunnel's Public Hostname settings, leave the **Subdomain** field blank (or type `@`) and select `mysite.com` as the **Domain**. Set Service to `HTTP 127.0.0.1:8100`.

### Q4: Termux stops running after 10–15 minutes when the screen is locked.
- **Cause**: Android's battery optimizer put the app to sleep.
- **Fix**: Open Android **Settings > Apps > Termux > Battery** and select **Unrestricted**. Read the [24/7 Android Survival Guide](docs/ANDROID_247_GUIDE.md) for brand-specific steps.

### Q5: Can I host WordPress or Laravel?
- **Yes**: You can place PHP projects into `storage/websites/<site>/public/`. For SQLite-compatible CMSs (like Grav, Kirby, Pico, or WordPress with SQLite Integration plugin), it works out of the box.

---

## 📄 License

This project is open-source and licensed under the **[MIT License](LICENSE)**. Built with ❤️ for the Termux and self-hosting community.
