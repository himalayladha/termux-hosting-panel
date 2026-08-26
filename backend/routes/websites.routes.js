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

const systemService = require('../services/system.service');

/**
 * List all websites
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    await processService.refreshAllStatuses();
    const netMetrics = systemService.getSystemMetrics ? await systemService.getSystemMetrics() : null;
    const wifiIp = netMetrics && netMetrics.network ? netMetrics.network.wifiIp : null;

    const websites = await db.all(`
      SELECT w.*, d.domain as custom_domain
      FROM websites w
      LEFT JOIN domains d ON w.id = d.website_id AND d.is_primary = 1
      ORDER BY w.created_at DESC
    `);

    const enriched = websites.map((w) => ({
      ...w,
      localUrl: `http://127.0.0.1:${w.port}`,
      wifiUrl: wifiIp ? `http://${wifiIp}:${w.port}` : null,
      wifiIp
    }));

    return res.json(enriched);
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
 * Update website settings, rename sitename & directory, update runtime or port
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, type, domain, entry_file, port, autostart, env_vars } = req.body;
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!site) return res.status(404).json({ error: 'Website not found' });

    let finalName = site.name;
    let finalRoot = site.root_path;
    let wasRunning = site.status === 'running';

    // 1. Handle Sitename Rename
    if (name && name.trim() && name.trim() !== site.name) {
      const cleanName = name.trim();
      if (!/^[a-zA-Z0-9._-]+$/.test(cleanName)) {
        return res.status(400).json({ error: 'Valid site name required (letters, numbers, dot, dash)' });
      }

      const checkName = await db.get('SELECT id FROM websites WHERE name = ? AND id != ?', [cleanName, site.id]);
      if (checkName) {
        return res.status(400).json({ error: `Website name "${cleanName}" is already in use` });
      }

      // Stop process before renaming directory
      if (wasRunning) {
        try {
          await processService.stopWebsite(site.id);
        } catch (_) {}
      }

      const oldRoot = site.root_path;
      const newRoot = path.join(config.STORAGE_DIR, cleanName);

      if (fs.existsSync(oldRoot) && oldRoot !== newRoot) {
        try {
          fs.renameSync(oldRoot, newRoot);
        } catch (renameErr) {
          return res.status(500).json({ error: `Failed to rename website directory: ${renameErr.message}` });
        }
      }

      // Rename log files if they exist
      try {
        const oldLogs = processService.getWebsiteLogPaths(site.name);
        const newLogs = processService.getWebsiteLogPaths(cleanName);
        if (fs.existsSync(oldLogs.accessLog)) fs.renameSync(oldLogs.accessLog, newLogs.accessLog);
        if (fs.existsSync(oldLogs.errorLog)) fs.renameSync(oldLogs.errorLog, newLogs.errorLog);
      } catch (_) {}

      finalName = cleanName;
      finalRoot = newRoot;
    }

    // 2. Handle Port Change
    let finalPort = site.port;
    if (port && parseInt(port, 10) !== site.port) {
      const numPort = parseInt(port, 10);
      if (numPort < 1024 || numPort > 65535) {
        return res.status(400).json({ error: 'Port must be between 1024 and 65535' });
      }
      const portCheck = await db.get('SELECT id FROM websites WHERE port = ? AND id != ?', [numPort, site.id]);
      if (portCheck) {
        return res.status(400).json({ error: `Port :${numPort} is already assigned to another website` });
      }
      finalPort = numPort;
    }

    // 3. Update Database Record
    const finalType = type && ['html', 'node', 'python', 'php'].includes(type) ? type : site.type;
    const finalDomain = domain !== undefined ? (domain ? domain.trim() : null) : site.domain;
    const finalEntry = entry_file !== undefined ? (entry_file ? entry_file.trim() : null) : site.entry_file;
    const finalAutostart = autostart !== undefined ? (autostart ? 1 : 0) : site.autostart;

    await db.run(
      `UPDATE websites
       SET name = ?,
           type = ?,
           domain = ?,
           root_path = ?,
           entry_file = ?,
           port = ?,
           autostart = ?,
           env_vars = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        finalName,
        finalType,
        finalDomain,
        finalRoot,
        finalEntry,
        finalPort,
        finalAutostart,
        env_vars ? JSON.stringify(env_vars) : null,
        site.id
      ]
    );

    // If site had a default domain mapped to its name, update domain record
    if (finalDomain) {
      const existingDom = await db.get('SELECT id FROM domains WHERE website_id = ?', [site.id]);
      if (existingDom) {
        await db.run('UPDATE domains SET domain = ? WHERE id = ?', [finalDomain, existingDom.id]);
      } else {
        await db.run('INSERT INTO domains (domain, website_id, ssl_enabled) VALUES (?, ?, 1)', [finalDomain, site.id]);
      }
    }

    // 4. Restart website process if it was running or if autostart
    if (wasRunning) {
      try {
        await processService.startWebsite(site.id);
      } catch (startErr) {
        console.warn(`[Websites] Warning restarting ${finalName}:`, startErr.message);
      }
    }

    const updated = await db.get('SELECT * FROM websites WHERE id = ?', [site.id]);
    return res.json({ success: true, website: updated, message: `Website "${finalName}" updated successfully` });
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
