CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS websites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('html', 'node', 'python', 'php')),
    domain TEXT,
    root_path TEXT NOT NULL,
    entry_file TEXT,
    port INTEGER UNIQUE,
    status TEXT DEFAULT 'stopped' CHECK(status IN ('running', 'stopped', 'error', 'restarting')),
    pid INTEGER,
    env_vars TEXT,
    autostart INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    website_id INTEGER,
    is_primary INTEGER DEFAULT 1,
    ssl_enabled INTEGER DEFAULT 1,
    cname_target TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    expression TEXT NOT NULL,
    command TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    last_run DATETIME,
    last_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    level TEXT DEFAULT 'info',
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL UNIQUE,
    token TEXT UNIQUE NOT NULL,
    branch TEXT DEFAULT 'main',
    secret TEXT,
    auto_npm INTEGER DEFAULT 1,
    auto_pip INTEGER DEFAULT 1,
    last_deployed_at DATETIME,
    last_status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    commit_hash TEXT,
    commit_message TEXT,
    author TEXT,
    status TEXT DEFAULT 'success',
    log_output TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS security_2fa (
    user_id INTEGER PRIMARY KEY,
    secret TEXT NOT NULL,
    backup_codes TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ip_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    failed_attempts INTEGER DEFAULT 1,
    banned_until DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS website_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER DEFAULT 200,
    response_time_ms INTEGER DEFAULT 0,
    bytes_sent INTEGER DEFAULT 0,
    user_agent TEXT,
    ip_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_metrics_site_date ON website_metrics(website_id, created_at);

CREATE TABLE IF NOT EXISTS uptime_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    website_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    status_code INTEGER,
    latency_ms INTEGER,
    error_message TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (website_id) REFERENCES websites(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_uptime_site_date ON uptime_checks(website_id, checked_at);

CREATE TABLE IF NOT EXISTS email_forwarders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    custom_email TEXT NOT NULL,
    destination_email TEXT NOT NULL,
    cloudflare_rule_id TEXT,
    status TEXT DEFAULT 'active',
    mode TEXT DEFAULT 'manual',
    brevo_configured INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_domain ON email_forwarders(domain);

CREATE TABLE IF NOT EXISTS telegram_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    file_size INTEGER DEFAULT 0,
    mime_type TEXT,
    category TEXT DEFAULT 'general',
    telegram_file_id TEXT,
    telegram_message_id INTEGER,
    chat_id TEXT,
    caption TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_teledrive_category ON telegram_files(category);
CREATE INDEX IF NOT EXISTS idx_teledrive_uploaded ON telegram_files(uploaded_at);

