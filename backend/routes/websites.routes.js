const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../auth/auth.middleware');
const db = require('../database/db');
const config = require('../config/app.config');
const { findAvailablePort } = require('../config/ports.config');
const processService = require('../services/process.service');
const logService = require('../services/log.service');

// Helper to copy template directory contents recursively
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

/**
 * List all websites
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    await processService.refreshAllStatuses();
    const websites = await db.all(`
      SELECT w.*, d.domain as custom_domain
      FROM websites w
      LEFT JOIN domains d ON w.id = d.website_id AND d.is_primary = 1
      ORDER BY w.created_at DESC
    `);
    return res.json(websites);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new website
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, type, domain, entry_file, autostart } = req.body;

    if (!name || !/^[a-zA-Z0-9._-]+$/.test(name)) {
      return res.status(400).json({ error: 'Valid site name required (letters, numbers, dot, dash)' });
    }

    if (!['html', 'node', 'python', 'php'].includes(type)) {
      return res.status(400).json({ error: 'Type must be html, node, python, or php' });
    }

    const existing = await db.get('SELECT id FROM websites WHERE name = ?', [name]);
    if (existing) {
      return res.status(400).json({ error: 'A website with this name already exists' });
    }

    // Allocate Port
    const usedPortsRows = await db.all('SELECT port FROM websites WHERE port IS NOT NULL');
    const usedPorts = usedPortsRows.map((r) => r.port);
    const port = await findAvailablePort(usedPorts);

    // Setup Document Root Directory
    const siteRoot = path.join(config.STORAGE_DIR, name);
    if (!fs.existsSync(siteRoot)) {
      fs.mkdirSync(siteRoot, { recursive: true });
    }

    // Copy Starter Template
    const templatePath = path.join(config.TEMPLATES_DIR, type);
    if (fs.existsSync(templatePath)) {
      copyDirRecursive(templatePath, siteRoot);
    }

    let defaultEntry = entry_file;
    if (!defaultEntry) {
      if (type === 'node') defaultEntry = 'server.js';
      else if (type === 'python') defaultEntry = 'app.py';
      else if (type === 'php') defaultEntry = 'public/index.php';
      else defaultEntry = 'public/index.html';
    }

    // Insert Website record
    const result = await db.run(
      `INSERT INTO websites (name, type, domain, root_path, entry_file, port, status, autostart)
       VALUES (?, ?, ?, ?, ?, ?, 'stopped', ?)`,
      [name, type, domain || name, siteRoot, defaultEntry, port, autostart !== false ? 1 : 0]
    );

    const siteId = result.lastID;

    // Insert Domain record
    if (domain || name) {
      await db.run(
        'INSERT INTO domains (domain, website_id, is_primary) VALUES (?, ?, 1)',
        [domain || name, siteId]
      );
    }

    // Auto-start immediately
    let startResult = null;
    try {
      startResult = await processService.startWebsite(siteId);
    } catch (startErr) {
      console.warn(`[Websites] Warning: Could not autostart ${name}:`, startErr.message);
    }

    const site = await db.get('SELECT * FROM websites WHERE id = ?', [siteId]);
    return res.status(201).json({ success: true, website: site, startResult });
  } catch (err) {
    console.error('[Websites] Create error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get website details
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!site) return res.status(404).json({ error: 'Website not found' });
    const domains = await db.all('SELECT * FROM domains WHERE website_id = ?', [site.id]);
    return res.json({ website: site, domains });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Update website settings
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { domain, entry_file, autostart, env_vars } = req.body;
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!site) return res.status(404).json({ error: 'Website not found' });

    await db.run(
      `UPDATE websites
       SET domain = COALESCE(?, domain),
           entry_file = COALESCE(?, entry_file),
           autostart = COALESCE(?, autostart),
           env_vars = COALESCE(?, env_vars),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [domain, entry_file, autostart, env_vars ? JSON.stringify(env_vars) : null, site.id]
    );

    const updated = await db.get('SELECT * FROM websites WHERE id = ?', [site.id]);
    return res.json({ success: true, website: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a website
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!site) return res.status(404).json({ error: 'Website not found' });

    // Stop process if running
    try {
      await processService.stopWebsite(site.id);
    } catch (e) {
      // ignore
    }

    // Delete files in storage
    if (fs.existsSync(site.root_path)) {
      await fs.promises.rm(site.root_path, { recursive: true, force: true });
    }

    // Delete DB records
    await db.run('DELETE FROM domains WHERE website_id = ?', [site.id]);
    await db.run('DELETE FROM websites WHERE id = ?', [site.id]);

    return res.json({ success: true, message: `Website ${site.name} deleted` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Start website
 */
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const result = await processService.startWebsite(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Stop website
 */
router.post('/:id/stop', requireAuth, async (req, res) => {
  try {
    const result = await processService.stopWebsite(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Restart website
 */
router.post('/:id/restart', requireAuth, async (req, res) => {
  try {
    const result = await processService.restartWebsite(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get website logs
 */
router.get('/:id/logs', requireAuth, async (req, res) => {
  try {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!site) return res.status(404).json({ error: 'Website not found' });

    const { accessLog, errorLog } = processService.getWebsiteLogPaths(site.name);
    const access = await logService.readLogTail(accessLog, 50);
    const error = await logService.readLogTail(errorLog, 50);

    return res.json({
      accessLogs: access.lines,
      errorLogs: error.lines
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
