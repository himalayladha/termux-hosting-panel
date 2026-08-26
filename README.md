# TermuxPanel 📱⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Android](https://img.shields.io/badge/Android-7.0%2B-brightgreen.svg)](https://www.android.com/)
[![Termux](https://img.shields.io/badge/Platform-Termux-black.svg)](https://termux.dev/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Zero%20Trust%20Tunnel-orange.svg)](https://www.cloudflare.com/)
[![Database](https://img.shields.io/badge/Database-SQLite3-blue.svg)](https://www.sqlite.org/)

> **A complete, beginner-friendly web hosting control panel that turns any Android phone or tablet into a secure, self-hosted web server.**
> Host your HTML, Node.js, Python, and PHP applications, manage SQLite databases, edit files in your browser, and access your server from anywhere in the world over HTTPS using Cloudflare Zero Trust — **no router port-forwarding, no static IP, and zero advanced server knowledge required.**

---

## 📖 Zero-Assumption Table of Contents

1. [What is TermuxPanel?](#1-what-is-termuxpanel)
2. [How Does It Connect to the Internet? (No Port Forwarding)](#2-how-does-it-connect-to-the-internet-no-port-forwarding)
3. [What You Need Before Starting](#3-what-you-need-before-starting)
4. [Step-by-Step Installation Guide](#4-step-by-step-installation-guide)
5. [First-Time Setup: Creating Your Admin Account](#5-first-time-setup-creating-your-admin-account)
6. [Cloudflare Zero Trust Setup (Access from Anywhere)](#6-cloudflare-zero-trust-setup-access-from-anywhere)
   - [Option A: Semi-Automatic Setup (Copy & Paste Token)](#option-a-semi-automatic-setup-copy--paste-token---easiest)
   - [Option B: Fully-Automatic Setup (Using Cloudflare API)](#option-b-fully-automatic-setup-using-cloudflare-api)
   - [Adding Extra Security: Password Protect Before Login (Cloudflare Access)](#adding-extra-security-password-protect-before-login-cloudflare-access)
7. [How to Deploy Websites & Apps (Step-by-Step)](#7-how-to-deploy-websites--apps-step-by-step)
   - [Deploying a Static HTML/CSS/JS Website](#deploying-a-static-htmlcssjs-website)
   - [Deploying a Node.js Application](#deploying-a-nodejs-application)
   - [Deploying a Python App (Flask / FastAPI)](#deploying-a-python-app-flask--fastapi)
   - [Deploying a PHP Application](#deploying-a-php-application)
8. [How to Use the Panel Features](#8-how-to-use-the-panel-features)
   - [File Manager & Code Editor](#file-manager--in-browser-code-editor)
   - [SQLite Database Explorer & SQL Query Runner](#sqlite-database-explorer--sql-query-runner)
   - [Automated Cron Jobs](#automated-cron-jobs)
   - [Viewing Live Server Logs](#viewing-live-server-logs)
   - [Creating & Downloading Backups](#creating--downloading-backups)
9. [Terminal CLI (`tp`) - Control via Phone Terminal](#9-terminal-cli-tp---control-via-phone-terminal)
10. [How to Keep It Running 24/7 (Prevent Android from Killing It)](#10-how-to-keep-it-running-247-prevent-android-from-killing-it)
11. [Understanding the Project Folder Structure](#11-understanding-the-project-folder-structure)
12. [Troubleshooting & Common Errors Solved](#12-troubleshooting--common-errors-solved)
13. [License](#13-license)

---

## 1. What is TermuxPanel? (Explained in Plain English)

Normally, if you want to host a website, you have to pay a hosting company every month. 

**TermuxPanel lets you use your Android smartphone as your hosting server for free.**

- You get a **modern web dashboard** that looks and feels like cPanel / aaPanel.
- You can create websites, edit code files in your browser, upload files, manage databases, and view server performance (CPU, RAM, and Storage).
- It runs inside **Termux**, which is a free Linux environment application for Android.
- It connects to **Cloudflare**, which gives your website a fast, free, secure HTTPS address (`https://yourdomain.com`) that anyone in the world can visit on their computer or phone.

---

## 2. How Does It Connect to the Internet? (No Port Forwarding)

### The Problem with Traditional Hosting on Phones
Normally, hosting a server at home requires:
- Opening ports on your home Wi-Fi router ("Port Forwarding").
- Buying an expensive "Static IP address" from your Internet provider.
- Dealing with mobile networks (4G/5G) that block incoming traffic using **CGNAT**.

### How TermuxPanel Solves This (The Cloudflare Tunnel Solution)
TermuxPanel uses **Cloudflare Zero Trust Tunnel**:

```
 ┌─────────────────────────────────────────────────────────┐
 │               VISITOR ANYWHERE IN THE WORLD             │
 └────────────────────────────┬────────────────────────────┘
                              │
                              ▼ (Visits https://panel.yourdomain.com)
 ┌─────────────────────────────────────────────────────────┐
 │               CLOUDFLARE GLOBAL NETWORK                 │
 │     - Free SSL Certificate (Green Padlock 🔒)           │
 │     - DDoS Attack Protection                            │
 └────────────────────────────┬────────────────────────────┘
                              │
                              │ ◄── Outbound-Only Encrypted Tunnel
                              │     (Initiated by your phone to Cloudflare)
                              ▼
 ┌─────────────────────────────────────────────────────────┐
 │                     YOUR ANDROID PHONE                  │
 │                                                         │
 │  ┌───────────────────────────────────────────────────┐  │
 │  │              cloudflared background daemon        │  │
 │  └──────────┬─────────────────────────────┬──────────┘  │
 │             │                             │             │
 │             ▼                             ▼             │
 │  ┌───────────────────────┐   ┌───────────────────────┐  │
 │  │   TermuxPanel Admin   │   │   Hosted Websites     │  │
 │  │   (127.0.0.1:9000)    │   │   (:8100, :8101...)   │  │
 │  └───────────────────────┘   └───────────────────────┘  │
 └─────────────────────────────────────────────────────────┘
```

1. Your phone makes an **outbound** connection to Cloudflare (just like when you open a website).
2. When a visitor goes to `https://panel.yourdomain.com`, Cloudflare securely sends that request down the tunnel directly to your phone.
3. **No ports are opened on your router.**
4. **It works on home Wi-Fi, mobile hotspot, and 4G/5G mobile data.**
5. **Even if your phone's IP address changes, the connection stays alive automatically.**

---

## 3. What You Need Before Starting

You only need 3 things:

1. **An Android Phone or Tablet**:
   - Running **Android 7.0 or higher**.
   - At least **2 GB RAM** and **1 GB free storage space**.
2. **An Internet Connection**:
   - Wi-Fi or mobile data (4G / 5G).
3. **A Domain Name (For remote access)**:
   - For example: `yourname.com` (from Namecheap, GoDaddy, Cloudflare, etc.).
   - If you only want to test locally on your home Wi-Fi, you don't even need a domain!

---

## 4. Step-by-Step Installation Guide (From Scratch)

Follow these exact steps on your Android device:

### Step 1: Install Termux from F-Droid
> ⚠️ **IMPORTANT**: Do **NOT** install Termux from the Google Play Store. The Google Play Store version is deprecated and will not work.

1. Open your phone's browser and go to: **[https://f-droid.org/packages/com.termux/](https://f-droid.org/packages/com.termux/)**
2. Scroll down and tap **"Download APK"**.
3. Once downloaded, open the file and tap **Install**.
4. *(Optional but recommended)*: Also download and install **[Termux:Boot from F-Droid](https://f-droid.org/packages/com.termux.boot/)** if you want the server to start automatically when your phone reboots.

---

### Step 2: Open Termux and Run the Installer
1. Open the **Termux** app on your phone.
2. Grant storage permission by running:
   ```bash
   termux-setup-storage
   ```
   *(Tap "Allow" on the popup permission dialog).*

3. Update Termux packages and install Git (copy and paste this whole line):
   ```bash
   pkg update -y && pkg install -y git
   ```
   *(If prompted with a prompt like `[Y/n]`, press Enter).*

4. Clone the TermuxPanel repository:
   ```bash
   git clone https://github.com/himalayladha/termux-hosting-panel.git ~/termux-panel
   ```

5. Enter the directory and run the one-tap installer:
   ```bash
   cd ~/termux-panel
   bash installer/install.sh
   ```

---

### Step 3: What Happens During Installation
The installer is fully automated and idempotent. It will:
- ✅ Check your phone's processor architecture (`arm64`, `arm`, `x86_64`).
- ✅ Install `Node.js`, `Python`, `PHP`, `SQLite`, `cronie`, `openssh`, and `cloudflared`.
- ✅ Set up the SQLite database (`data/panel.db`).
- ✅ Enable the **24/7 background CPU wake-lock** so Android does not sleep.
- ✅ Register the **24/7 auto-healing watchdog monitor**.
- ✅ Install the `tp` command in your terminal.
- ✅ Start the TermuxPanel server on `http://127.0.0.1:9000`.

When finished, you will see:
```
╔══════════════════════════════════════════════════════════╗
║               TERMUXPANEL SETUP COMPLETE!                ║
╚══════════════════════════════════════════════════════════╝

Access your control panel:
  Local Dashboard:    http://127.0.0.1:9000
  Terminal Manager:   tp (Type tp anywhere in Termux)
  Hosted Sites Dir:   ~/termux-panel/storage/websites/
```

---

## 5. First-Time Setup: Creating Your Admin Account

1. On your phone, open any web browser (Chrome, Firefox, Brave).
2. Go to:
   ```
   http://127.0.0.1:9000
   ```
3. You will see the **TermuxPanel Initial Setup Screen**:
   - Enter your desired **Admin Username** (e.g. `admin`).
   - Enter your **Email** (Optional).
   - Enter a secure **Admin Password** (at least 6 characters).
4. Click **Initialize TermuxPanel**.
5. You are now logged in to your server dashboard! 🎉

---

## 6. Cloudflare Zero Trust Setup (Access from Anywhere)

To access your panel and websites from your laptop, office computer, or anywhere in the world over HTTPS (`https://panel.yourdomain.com`), choose either **Option A** or **Option B**.

---

### Option A: Semi-Automatic Setup (Copy & Paste Token - Easiest)

#### Step 1: Create a Free Cloudflare Account & Add Your Domain
1. Go to **[https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)** and create a free account.
2. Click **Add a Site** and enter your domain name (e.g. `yourdomain.com`).
3. Choose the **Free** plan.
4. Follow the instructions to change your domain's nameservers at your domain registrar (Namecheap, GoDaddy, etc.) to the Cloudflare nameservers provided.

#### Step 2: Create the Tunnel in Cloudflare Zero Trust
1. Go to the Cloudflare Zero Trust Dashboard: **[https://one.dash.cloudflare.com/](https://one.dash.cloudflare.com/)**
2. In the left navigation bar, click **Networks** ➔ **Tunnels**.
3. Click the blue **Add a tunnel** button.
4. Select **Cloudflared** and click **Next**.
5. Enter a tunnel name (e.g., `android-server`) and click **Save tunnel**.

#### Step 3: Copy Your Tunnel Token
1. You will see a page titled *"Install and run a connector"*.
2. Look under the **Linux / Docker** section.
3. You will see a command like:
   ```bash
   cloudflared.exe service install eyJhIjoiYmNm... (very long token)
   ```
4. Copy **ONLY the long token string** starting with `eyJh...` (do not copy the words before it).

#### Step 4: Paste the Token into TermuxPanel
- **In your browser**: Go to `http://127.0.0.1:9000` ➔ Click **Cloudflare Tunnel** in the left menu ➔ Under **Option 1: Semi-Automatic**, paste your token into the field ➔ Click **Save & Launch Tunnel**.
- **OR in Termux Terminal**: Type `tp cloudflare`, select `1`, and paste the token.

#### Step 5: Add Hostname Routes in Cloudflare Dashboard
Back in your [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/):
1. Under **Networks** ➔ **Tunnels**, click on your tunnel ➔ Click **Configure** (or **Edit**).
2. Click the **Public Hostname** tab ➔ Click **Add a public hostname**.

##### Route 1: For the Control Panel Dashboard
| Field | What to Type / Select |
|---|---|
| **Subdomain** | `panel` |
| **Domain** | Select `yourdomain.com` from dropdown |
| **Path** | *(Leave empty)* |
| **Service Type** | Select **`HTTP`** |
| **URL** | Type **`127.0.0.1:9000`** |
*Click **Save hostname**.*

##### Route 2: For Your Main Website
| Field | What to Type / Select |
|---|---|
| **Subdomain** | *(Leave blank for root domain, or type `www`)* |
| **Domain** | Select `yourdomain.com` |
| **Service Type** | Select **`HTTP`** |
| **URL** | Type **`127.0.0.1:8100`** *(port shown in TermuxPanel)* |
*Click **Save hostname**.*

**You're done!** Now visit `https://panel.yourdomain.com` from any device in the world. It is live with full HTTPS encryption! 🔒

---

### Option B: Fully-Automatic Setup (Using Cloudflare API)

If you prefer 1-click automatic setup where TermuxPanel creates the tunnel, ingress routing, and DNS records for you:

1. Go to **[https://dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)**.
2. Click **Create Token** ➔ Custom token ➔ **Get started**.
3. Set Token Name: `TermuxPanel Token`.
4. Add these 3 permissions:
   - **Account** ➔ **Cloudflare Tunnel** ➔ **Edit**
   - **Zone** ➔ **DNS** ➔ **Edit**
   - **Zone** ➔ **Zone** ➔ **Read**
5. Under **Account Resources**, choose **Include** ➔ **All accounts**.
6. Under **Zone Resources**, choose **Include** ➔ **All zones**.
7. Click **Continue to summary** ➔ **Create Token** ➔ Copy the token string.
8. In TermuxPanel: Open `http://127.0.0.1:9000` ➔ **Cloudflare Tunnel** ➔ **Option 2: Fully-Automatic** ➔ Paste your API Token, enter your domain (`yourdomain.com`), and click **⚡ Run Fully-Automatic Setup**.

TermuxPanel will communicate with Cloudflare and configure everything automatically in under 10 seconds!

---

### Adding Extra Security: Password Protect Before Login (Cloudflare Access)
To add a firewall policy that requires your personal Google or Email PIN before anyone can even see your login screen:
1. In [Cloudflare Zero Trust](https://one.dash.cloudflare.com/), go to **Access** ➔ **Applications** ➔ **Add an application**.
2. Choose **Self-hosted**.
3. Set Application domain: `panel.yourdomain.com`.
4. Under **Policies**, create a rule that allows only your email address (`you@gmail.com`).
5. Click **Save application**.

---

## 7. How to Deploy Websites & Apps (Step-by-Step)

In the TermuxPanel dashboard, click the **Websites** tab and click **+ Create Website**.

---

### Deploying a Static HTML/CSS/JS Website
1. In the Create Website modal:
   - **Site Name**: `my-website`
   - **Runtime**: `Static HTML / CSS / JS`
   - **Domain**: `yourdomain.com` (or leave blank)
2. Click **Create & Launch**.
3. TermuxPanel will create `~/termux-panel/storage/websites/my-website/public/` with starter `index.html` and `style.css` files, assign an automatic port (e.g. `8100`), and start serving it immediately.
4. Click **📁 Files** to edit `index.html` or upload your custom HTML files!

---

### Deploying a Node.js Application
1. In the Create Website modal:
   - **Site Name**: `my-api`
   - **Runtime**: `Node.js (Express / HTTP)`
   - **Entry File**: `server.js`
2. Click **Create & Launch**.
3. TermuxPanel creates `server.js` and `package.json`, assigns a port (e.g. `8101`), and runs `node server.js` under background process supervision.
4. If your app crashes, TermuxPanel logs the error to `logs/websites/my-api/error.log` and allows you to restart it with one click.

---

### Deploying a Python App (Flask / FastAPI)
1. In the Create Website modal:
   - **Site Name**: `python-service`
   - **Runtime**: `Python (Flask / FastAPI / WSGI)`
   - **Entry File**: `app.py`
2. Click **Create & Launch**.
3. TermuxPanel generates `app.py`, injects the assigned `PORT` environment variable, and runs the Python process supervised.

---

### Deploying a PHP Application
1. In the Create Website modal:
   - **Site Name**: `my-php-site`
   - **Runtime**: `PHP (Built-in Server)`
   - **Entry File**: `public/index.php`
2. Click **Create & Launch**.
3. Serves your PHP files out of `public/` on an isolated local port.

---

## 8. How to Use the Panel Features

### File Manager & In-Browser Code Editor
- Select your website from the dropdown to browse its files.
- Click any file (e.g. `index.html`, `server.js`, `app.py`) to open the **built-in code editor**, make edits, and click **Save Changes**.
- Use the **⬆ Upload** button to upload images, scripts, or ZIP files directly from your computer or phone.
- Use **+ Folder** or **+ File** to structure your project.

### SQLite Database Explorer & SQL Query Runner
- Click the **Databases** tab.
- TermuxPanel automatically detects any SQLite database file (`.db`, `.sqlite`) in your website folders as well as the system `panel.db`.
- Click on any table in the left sidebar to view its rows with pagination.
- Type custom SQL queries (e.g. `SELECT * FROM users;` or `CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);`) into the query runner and click **Execute SQL**.
- Click **Export .db** to download the raw database file to your computer.

### Automated Cron Jobs
- Click the **Cron Jobs** tab ➔ **+ Add Cron Job**.
- Choose a schedule preset:
  - `* * * * *` (Every Minute)
  - `0 * * * *` (Every Hour)
  - `0 0 * * *` (Daily at Midnight)
  - `0 0 * * 0` (Weekly on Sunday)
  - Or type your custom cron expression.
- Type the shell command to execute (e.g. `node /path/to/script.js` or `bash /path/to/backup.sh`).
- Click **▶ Run Now** to test execution immediately.

### Viewing Live Server Logs
- Click the **Logs** tab.
- Choose from:
  - **TermuxPanel System Log**: Server start, API requests, and authentication logs.
  - **Cloudflare Tunnel Log**: Tunnel connection state and routing logs.
  - **Website Access Log**: Live HTTP request traffic.
  - **Website Error Log**: Application crashes and stack traces.
- Use the search bar to filter logs in real time.

### Creating & Downloading Backups
- Click the **Backups** tab ➔ **+ Create Backup**.
- Select the scope:
  - **Full Server**: Backs up all website files, databases, and configuration into a compressed `.tar.gz` archive.
  - **Websites Only**: Backs up only the files in `storage/websites/`.
  - **Databases Only**: Backs up only your SQLite database files.
- Click **⬇ Download** to save the backup to your PC or external drive.

---

## 9. Terminal CLI (`tp`) - Control via Phone Terminal

You don't always need a web browser to manage your server. Open the Termux app and type:

```bash
tp
```

This launches the interactive terminal manager:

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

### Direct Terminal Shortcuts:
```bash
tp status      # Check if panel, cloudflared, and crond are running
tp start       # Start panel and tunnel daemons in the background
tp stop        # Stop all running panel and tunnel processes
tp restart     # Restart the panel server
tp logs        # Live tail the last 30 lines of the server log
tp cloudflare  # Launch the Cloudflare setup wizard
tp backup      # Generate an immediate full server backup archive
```

---

## 10. How to Keep It Running 24/7 (Prevent Android from Killing It)

Android has aggressive battery-saving features that put apps to sleep when your screen is locked. To make your server run **24/7/365 uninterrupted**:

### 1. The Automated CPU Wake-Lock
TermuxPanel automatically runs `termux-wake-lock`. This keeps the phone's CPU running in low-power mode even when your screen is completely off.

### 2. Disable Android Battery Optimization (Required)
- **Samsung**: Settings ➔ Apps ➔ Termux ➔ Battery ➔ Select **Unrestricted**. Also add Termux to **Never sleeping apps**.
- **Xiaomi / Redmi / POCO**: Settings ➔ Apps ➔ Manage Apps ➔ Termux ➔ Enable **Autostart** & set Battery Saver to **No restrictions**. Lock Termux in your recent apps drawer (Tap the 🔒 lock icon).
- **Google Pixel / Stock Android**: Settings ➔ Apps ➔ Termux ➔ App battery usage ➔ Set to **Unrestricted**.
- **OnePlus / Realme / Oppo**: Settings ➔ Battery ➔ More settings ➔ Optimize battery use ➔ Set Termux to **Don't optimize**.

### 3. Wi-Fi Sleep Policy
- Go to Android **Settings ➔ Wi-Fi ➔ Advanced** (or Network preferences) and ensure **"Keep Wi-Fi on during sleep"** is set to **Always**.

### 4. The Built-in 24/7 Auto-Healing Watchdog
TermuxPanel installs a watchdog script (`scripts/watchdog.sh`) in `crontab` that checks every minute. If Android ever stops Node.js or Cloudflare Tunnel during high memory pressure, the watchdog **automatically restarts them within 60 seconds**.

---

## 11. Understanding the Project Folder Structure

```
~/termux-panel/
│
├── backend/                  # Server engine logic
│   ├── auth/                 # Bcrypt password hashing & session management
│   ├── config/               # Ports & application constants
│   ├── database/             # SQLite connection (panel.db) & schema migrations
│   ├── routes/               # REST API endpoints (Websites, Files, Databases, Cron...)
│   ├── services/             # Process supervisor, file sandboxing, metrics
│   └── server.js             # Express entry point (127.0.0.1:9000)
│
├── frontend/                 # Zero-dependency web UI (HTML5, CSS3, JavaScript)
│   ├── css/                  # Responsive dark mode stylesheet
│   ├── js/                   # Dashboard & tab controllers
│   └── index.html            # Single page web interface
│
├── storage/
│   └── websites/             # Document roots for all your hosted sites
│       ├── mysite.com/       # Example website files (public/index.html...)
│       └── api.domain.com/   # Example API service
│
├── data/
│   ├── panel.db              # SQLite system database (tables, users, ports)
│   └── backups/              # Stored .tar.gz backup archives
│
├── logs/
│   ├── panel.log             # Panel system log
│   ├── cloudflared.log       # Cloudflare Tunnel log
│   ├── watchdog.log          # 24/7 auto-healing log
│   └── websites/             # Per-website access.log & error.log
│
├── config/
│   ├── cloudflare-token      # Secure token file (chmod 600)
│   └── panel.env             # Local configuration secrets
│
├── templates/                # Starter boilerplate for new websites
│   ├── html/                 # HTML/CSS template
│   ├── node/                 # Node.js template
│   ├── python/               # Python template
│   └── php/                  # PHP template
│
├── installer/                # Automated installation scripts
│   ├── install.sh            # One-tap master installer
│   ├── dependencies.sh       # Package installer
│   ├── security.sh           # File permission hardening
│   └── cloudflare.sh         # Interactive Cloudflare wizard
│
├── scripts/                  # CLI and background daemons
│   ├── tp                    # Terminal management tool
│   ├── watchdog.sh           # 24/7 self-healing monitor
│   └── start-server.sh       # Boot autostart script
│
├── docs/                     # Detailed technical guides
├── LICENSE                   # MIT Open Source License
└── README.md                 # This guide
```

---

## 12. Troubleshooting & Common Errors Solved

### Q1: `Error 1033: Cloudflare Tunnel error` when opening the website
- **Reason**: The `cloudflared` process on your phone is stopped or your phone lost internet connection.
- **Solution**: Open Termux and type `tp status`. If stopped, type `tp start`. Make sure your phone is connected to Wi-Fi or cellular data.

### Q2: `502 Bad Gateway` error in browser
- **Reason**: The Cloudflare Tunnel is connected, but the local website process is not running, or the port number in Cloudflare does not match the website's port.
- **Solution**: Open TermuxPanel (`http://127.0.0.1:9000`), check the **Websites** tab, and verify that your website status is green **RUNNING**. Check the port number (e.g. `8100`) and make sure your Cloudflare Public Hostname route points to `HTTP 127.0.0.1:8100`.

### Q3: `Permission denied` when running `bash installer/install.sh`
- **Reason**: Storage permission was not granted to Termux.
- **Solution**: Run `termux-setup-storage` and tap **Allow**, then run the installer command again.

### Q4: How do I change my admin password?
- **Solution**: Open TermuxPanel ➔ Go to the **Settings** tab ➔ Enter your current password and new password ➔ Click **Update Password**.

### Q5: How do I completely stop or uninstall TermuxPanel?
- **Solution**: Run:
  ```bash
  bash ~/termux-panel/installer/uninstall.sh
  ```

---

## 13. License

This project is licensed under the **[MIT License](LICENSE)**.

Built with ❤️ for the global Termux, self-hosting, and maker community.
