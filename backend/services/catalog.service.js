const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const config = require('../config/app.config');
const { findAvailablePort } = require('../config/ports.config');
const processService = require('./process.service');

// Helper to copy starter directory recursively
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const CATALOG_APPS = [
  {
    id: 'pocketbase',
    name: 'PocketBase Backend',
    category: 'Backend / Database',
    type: 'node',
    entry_file: 'server.js',
    icon: 'database',
    description: 'PocketBase-inspired REST & Realtime backend with embedded SQLite storage and instant collections API.',
    badge: 'POPULAR',
    color: '#38bdf8'
  },
  {
    id: 'wordpress_sqlite',
    name: 'WordPress (SQLite Edition)',
    category: 'CMS / Blog',
    type: 'php',
    entry_file: 'public/index.php',
    icon: 'file-text',
    description: 'Full PHP WordPress CMS powered by a pure SQLite file database. Zero MySQL required on Android.',
    badge: 'PHP + SQLITE',
    color: '#0284c7'
  },
  {
    id: 'sqlite_web',
    name: 'SQLite Web GUI',
    category: 'Developer Tools',
    type: 'node',
    entry_file: 'server.js',
    icon: 'table',
    description: 'Web-based visual database management tool to browse tables, run SQL queries, and edit records.',
    badge: 'TOOL',
    color: '#22c55e'
  },
  {
    id: 'astro_starter',
    name: 'Astro Jamstack Starter',
    category: 'Frontend / Jamstack',
    type: 'html',
    entry_file: 'public/index.html',
    icon: 'rocket',
    description: 'Ultra-fast static web architecture with near-zero JavaScript payload, ready for SEO and CDN delivery.',
    badge: 'STATIC',
    color: '#f97316'
  },
  {
    id: 'fastapi',
    name: 'Python FastAPI Microservice',
    category: 'API / Microservice',
    type: 'python',
    entry_file: 'app.py',
    icon: 'zap',
    description: 'High-performance Python REST API service with auto-generated interactive Swagger UI documentation.',
    badge: 'PYTHON',
    color: '#a855f7'
  }
];

const catalogService = {
  /**
   * List all available apps in the catalog
   */
  listCatalogApps() {
    return CATALOG_APPS;
  },

  /**
   * 1-Click Deploy an app from the catalog
   */
  async deployApp({ appId, name, domain = null, customPort = null }) {
    const appDef = CATALOG_APPS.find((a) => a.id === appId);
    if (!appDef) throw new Error(`App "${appId}" not found in catalog`);

    const cleanName = (name || '').trim();
    if (!cleanName || !/^[a-zA-Z0-9._-]+$/.test(cleanName)) {
      throw new Error('Valid application name is required (alphanumeric, dot, dash)');
    }

    const existing = await db.get('SELECT id FROM websites WHERE name = ?', [cleanName]);
    if (existing) {
      throw new Error(`A website or application with name "${cleanName}" already exists`);
    }

    // Allocate Port
    let port = customPort ? parseInt(customPort, 10) : null;
    if (!port) {
      const usedPortsRows = await db.all('SELECT port FROM websites WHERE port IS NOT NULL');
      const usedPorts = usedPortsRows.map((r) => r.port);
      port = await findAvailablePort(usedPorts);
    }

    // Setup Storage Directory
    const siteRoot = path.join(config.STORAGE_DIR, cleanName);
    if (!fs.existsSync(siteRoot)) {
      fs.mkdirSync(siteRoot, { recursive: true });
    }

    // Copy Starter Template
    const templatePath = path.join(config.TEMPLATES_DIR, appId);
    if (fs.existsSync(templatePath)) {
      copyDirRecursive(templatePath, siteRoot);
    } else {
      // Fallback to base runtime template
      const baseTemplate = path.join(config.TEMPLATES_DIR, appDef.type);
      if (fs.existsSync(baseTemplate)) copyDirRecursive(baseTemplate, siteRoot);
    }

    // Insert Website Record
    const result = await db.run(
      `INSERT INTO websites (name, type, domain, root_path, entry_file, port, status, autostart)
       VALUES (?, ?, ?, ?, ?, ?, 'stopped', 1)`,
      [cleanName, appDef.type, domain || cleanName, siteRoot, appDef.entry_file, port]
    );

    const siteId = result.lastID;

    // Insert Domain Record
    if (domain || cleanName) {
      await db.run(
        'INSERT INTO domains (domain, website_id, is_primary) VALUES (?, ?, 1)',
        [domain || cleanName, siteId]
      );
    }

    // Launch Process
    let startResult = null;
    try {
      startResult = await processService.startWebsite(siteId);
    } catch (startErr) {
      console.warn(`[Catalog] Warning launching ${cleanName}:`, startErr.message);
    }

    const site = await db.get('SELECT * FROM websites WHERE id = ?', [siteId]);
    return {
      success: true,
      website: site,
      appDef,
      startResult,
      message: `"${appDef.name}" successfully deployed as "${cleanName}" on port :${port}!`
    };
  }
};

module.exports = catalogService;
