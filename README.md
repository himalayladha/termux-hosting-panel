# TermuxPanel 📱⚡

> **A lightweight, full-featured hosting control panel & web engine designed specifically for Android + Termux with Cloudflare Tunnel zero-trust remote administration.**

---

## 📱 Minimum Requirements

| Component | Minimum | Recommended |
|---|---|---|
| **Android OS** | Android 7.0 (Nougat) or higher | Android 10.0+ |
| **RAM** | 2 GB | 3 GB - 4 GB+ |
| **Free Storage** | 1 GB | 4 GB+ (for website files & backups) |
| **Architecture** | ARM64 (`aarch64`), ARMv7 (`arm`), or `x86_64` | ARM64 |
| **Termux App** | [Termux from F-Droid](https://f-droid.org/packages/com.termux/) *(Do **NOT** use Google Play version)* | F-Droid release |
| **Autostart (Optional)** | [Termux:Boot from F-Droid](https://f-droid.org/packages/com.termux.boot/) | F-Droid release |
| **Internet** | Any active Wi-Fi or 4G/5G mobile connection | Stable Wi-Fi / Hotspot |

---

## 🧠 How Does It Connect? (The Concept Explained)

### ❌ Does it need Port Forwarding or a Static IP?
**NO.** You do **NOT** need:
- ❌ Port Forwarding on your Wi-Fi router.
- ❌ A Static Public IP from your ISP.
- ❌ Dynamic DNS (DDNS) services like No-IP or DuckDNS.
- ❌ Any open inbound ports on your Android phone or home network.

---

### 🌐 The Cloudflare Tunnel Concept: Outbound-Only Magic

Most mobile networks and home ISPs use **CGNAT (Carrier-Grade NAT)** or dynamic IPs that block incoming connections, preventing you from hosting traditional servers on a phone.

TermuxPanel solves this using a **Remotely Managed Cloudflare Zero Trust Tunnel**:

```
 [ Visitor Anywhere in the World ]
                 │
                 ▼  (Public HTTPS)
    ┌─────────────────────────┐
    │   CLOUDFLARE EDGE WAF   │
    │  panel.yourdomain.com   │
    └────────────┬────────────┘
                 │
                 │  ◄── Outbound Encrypted Tunnel Connection (QUIC/TLS)
                 │      (Initiated by your phone to Cloudflare)
                 │
    ┌────────────▼────────────┐
    │     ANDROID / TERMUX    │
    │   cloudflared daemon    │
    │            │            │
    │            ▼            │
    │  TermuxPanel :9000      │
    │  Websites    :8100..    │
    └─────────────────────────┘
```

1. **Outbound Connection**: When TermuxPanel starts, the lightweight `cloudflared` daemon on your phone makes an **outbound-only connection** to Cloudflare's closest global edge server.
2. **Reverse Proxy & Free SSL**: When a visitor enters `https://panel.yourdomain.com` or `https://yoursite.com` in their browser, Cloudflare terminates the HTTPS connection and routes the request down through your phone's existing outbound tunnel.
3. **Local Dispatch**: `cloudflared` receives the request inside your phone and passes it locally to `127.0.0.1:9000` (for the panel) or `127.0.0.1:8100` (for your websites).
4. **Network Flexibility**: Because the connection is outbound, your server **remains online even if your phone's IP changes**, or if your phone switches between Wi-Fi and 4G/5G mobile data.

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

## ☁️ Cloudflare Zero Trust Setup (Complete Step-by-Step Guide)

Cloudflare Zero Trust gives your Android server an enterprise-grade HTTPS endpoint with global DDoS protection without exposing your phone or home IP.

Choose **Method 1 (Semi-Automatic)** if you want to create the tunnel in Cloudflare's web dashboard, or **Method 2 (Fully-Automatic)** if you want TermuxPanel to configure everything via Cloudflare's API.

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
5. Enter a name for your tunnel (e.g., `android-host` or `termux-server`) and click **Save tunnel**.

#### Step 2: Copy Your Tunnel Token
1. On the "Install and run a connector" page, you will see installation commands for different operating systems.
2. Look for the command under the Linux/Docker tab. It will look like this:
   ```bash
   cloudflared.exe service install eyJhIjoiYmNm... (long token string)
   ```
3. Copy **ONLY the long token string** starting with `eyJh...` (do not include the words before it).

#### Step 3: Save the Token in TermuxPanel
You can enter the token using either the Web Dashboard or the Terminal:

- **Via Web Dashboard**:
  1. Open `http://127.0.0.1:9000` in your browser.
  2. Click the **Cloudflare Tunnel** tab on the left menu.
  3. Under **Option 1: Semi-Automatic**, paste your token into the **Tunnel Token** field.
  4. Click **Save & Launch Tunnel**.

- **Via Termux Terminal**:
  ```bash
  tp cloudflare
  ```
  Select **1 (Semi-Automatic)** and paste your token when prompted.

The token is saved securely in `~/termux-panel/config/cloudflare-token` (`chmod 600`), and the tunnel process starts immediately.

#### Step 4: Configure Public Hostname Routes
Back in your [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/):
1. Navigate to **Networks** ➔ **Tunnels** ➔ Click on your tunnel (`android-host`) ➔ Click **Configure** (or **Edit**).
2. Go to the **Public Hostname** tab.
3. Click **Add a public hostname**.

##### Route 1: The Control Panel
- **Subdomain**: `panel`
- **Domain**: Select `yourdomain.com` from the dropdown
- **Path**: *(leave empty)*
- **Service Type**: `HTTP`
- **URL**: `127.0.0.1:9000`
- Click **Save hostname**.

##### Route 2: Your Hosted Website (HTML, Node, Python, or PHP)
- **Subdomain**: `@` *(or leave blank for root domain, or enter `www` / `app`)*
- **Domain**: Select `yourdomain.com`
- **Service Type**: `HTTP`
- **URL**: `127.0.0.1:8100` *(matches the port assigned to the site in TermuxPanel)*
- Click **Save hostname**.

---

### ⚡ Method 2: Fully-Automatic Setup (Using Cloudflare API)

This method lets TermuxPanel talk directly to Cloudflare to automatically create the tunnel, configure routing rules, and create the DNS CNAME records in one click.

#### Step 1: Create a Cloudflare API Token
1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens).
2. Click **Create Token**.
3. Scroll down to **Custom token** and click **Get started**.
4. Set Token name to: `TermuxPanel Tunnel Token`.
5. Under **Permissions**, add these 3 permissions:
   - **Account** ➔ **Cloudflare Tunnel** ➔ **Edit**
   - **Zone** ➔ **DNS** ➔ **Edit**
   - **Zone** ➔ **Zone** ➔ **Read**
6. Under **Account Resources**, choose **Include** ➔ **All accounts**.
7. Under **Zone Resources**, choose **Include** ➔ **All zones** (or select your specific domain).
8. Click **Continue to summary** ➔ **Create Token**.
9. Copy your generated API Token.

#### Step 2: Run Auto-Setup
- **In Web Dashboard**:
  1. Go to `http://127.0.0.1:9000` ➔ **Cloudflare Tunnel** tab.
  2. Click **Option 2: Fully-Automatic (Cloudflare API)**.
  3. Enter your **Cloudflare API Token**, **Domain Name** (e.g. `yourdomain.com`), and **Panel Subdomain** (e.g. `panel`).
  4. Click **⚡ Run Fully-Automatic Setup**.

- **In Termux Terminal**:
  ```bash
  tp cloudflare
  ```
  Select **2 (Fully-Automatic)**, enter your API token and domain, and let TermuxPanel configure everything.

TermuxPanel will automatically create the tunnel, create DNS CNAME records, upload ingress mappings, save the credentials, and start the tunnel!

---

### 🌍 Step 5: Access Your Server Globally via HTTPS

Once your tunnel is running:
1. Open any browser on your laptop, another phone, or anywhere in the world.
2. Visit:
   ```
   https://panel.yourdomain.com
   ```
3. You will see your TermuxPanel login dashboard secured with valid Cloudflare SSL (Green Padlock 🔒)!
4. Visit your website at `https://yourdomain.com` or `https://app.yourdomain.com`.

---

### 🛡️ Optional Extra Layer: Cloudflare Zero Trust Access Policy
To protect your admin panel with email PIN or Google/GitHub login before anyone even sees the login screen:
1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) ➔ **Access** ➔ **Applications** ➔ **Add an application**.
2. Select **Self-hosted**.
3. Set Application name: `TermuxPanel Admin`.
4. Set Application domain: `panel.yourdomain.com`.
5. Under **Policies**, create a rule allowing only your email address (`name@example.com`).
6. Click **Save application**.
7. Now, only you can access the admin dashboard!

---

### ❓ Cloudflare Tunnel Troubleshooting

| Issue / Error | Cause | Solution |
|---|---|---|
| **Error 1033 (Tunnel error)** | `cloudflared` is not running on your phone | Run `tp start` in Termux, or check `tp status`. Ensure `termux-wake-lock` is enabled. |
| **HTTP 502 Bad Gateway** | Local port is unreachable | Ensure Service Type is set to **`HTTP`** and URL is **`127.0.0.1:9000`** (not `localhost` or `https`). |
| **DNS Resolution Error** | DNS CNAME record missing | In Cloudflare DNS, ensure a CNAME record exists for `panel` pointing to `<tunnel_id>.cfargotunnel.com` with Proxied (Orange Cloud) enabled. |
| **Tunnel disconnects on screen lock** | Android battery saver killed Termux | Follow the **[24/7 Android Survival Guide](docs/ANDROID_247_GUIDE.md)** to set Termux battery to "Unrestricted". |

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
