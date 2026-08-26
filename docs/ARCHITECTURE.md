# TermuxPanel Architecture & Internal Design

TermuxPanel is designed specifically around Android's Linux environment (Termux). It treats Android as an edge micro-server while respecting mobile resource, battery, and process constraints.

---

## 1. Separation of Concerns: Control Plane vs Application Plane

```
                          INTERNET (HTTPS)
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │   Cloudflare Tunnel   │
                     │ (Outbound connection) │
                     └───────────┬───────────┘
                                 │
       ┌─────────────────────────┴─────────────────────────┐
       │                                                   │
       ▼                                                   ▼
┌───────────────────────────────┐     ┌─────────────────────────────────┐
│     CONTROL PLANE (PORT 9000) │     │    APPLICATION PLANE (8100+)    │
│  - Express Admin Server       │     │  - example.com   (HTML)  :8100  │
│  - SQLite Database (panel.db) │     │  - api.domain    (Node)  :8101  │
│  - Auth & Rate Limiting       │     │  - blog.domain   (PHP)   :8102  │
│  - Process Engine Supervisor  │     │  - ai.domain     (Python):8103  │
│  - Sandboxed File Manager     │     └─────────────────────────────────┘
│  - SQLite DB Manager & Cron   │
└───────────────────────────────┘
```

The control plane (`server.js` on `127.0.0.1:9000`) is never used to directly serve hosted website traffic. It acts purely as the administrative supervisor. Each hosted application runs in its own isolated process with dedicated port binding and log streams.

---

## 2. Directory Layout & Roles

```
~/termux-panel/
│
├── backend/                  # Control Plane server logic
│   ├── server.js             # Express entry point
│   ├── auth/                 # Bcrypt password hashing & session management
│   ├── database/             # SQLite database layer & schema migrations
│   ├── services/             # Process supervisor, file manager, system metrics
│   └── routes/               # REST API endpoints
│
├── frontend/                 # Zero-dependency vanilla HTML5/CSS3/JS Web UI
│   ├── css/                  # Responsive dark mode stylesheets
│   └── js/                   # Modular SPA controllers
│
├── storage/
│   └── websites/             # Document roots for hosted sites
│       ├── mysite/
│       │   └── public/
│       └── api-service/
│
├── data/
│   ├── panel.db              # SQLite metadata store
│   └── backups/              # Generated tar.gz backup archives
│
├── logs/
│   ├── panel.log             # Panel system log
│   ├── cloudflared.log       # Cloudflare Tunnel logs
│   └── websites/             # Per-website access and error logs
│
├── config/
│   ├── cloudflare-token      # Secure tunnel token (chmod 600)
│   └── panel.env             # Local environment configuration
│
└── templates/                # Starters for HTML, Node.js, Python, PHP
```

---

## 3. Sandboxed File Security Model

Termux runs with standard single-user permissions on Android. To ensure safety:
- File Manager operations strictly check `path.resolve(websiteRoot, subPath)`.
- Traversal attempts (`../../etc/hosts` or `/data/data/...`) are rejected with `403 Forbidden` / `Access Denied`.
- File edits and listings are confined to the respective website directory.

---

## 4. Boot Sequence & Daemon Management

```
Android Boot
    │
    ▼
Termux:Boot (~/.termux/boot/start-server)
    │
    ├─► termux-wake-lock (prevents CPU sleep when screen is off)
    ├─► crond (starts cron daemon)
    ├─► termux-services (or background daemon)
    │     ├─► TermuxPanel (Node server :9000)
    │     │     └─► Autostarts enabled websites (:8100..:8999)
    │     └─► Cloudflared Tunnel (--token-file config/cloudflare-token)
```
