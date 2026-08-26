const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../auth/auth.middleware');
const dbService = require('../services/database.service');
const db = require('../database/db');
const config = require('../config/app.config');

// Helper to decode dbId or return path
function resolveDbPath(encodedId) {
  if (!encodedId) throw new Error('Database ID is required');
  if (encodedId === 'panel_db') {
    return config.DB_PATH;
  }
  const decoded = Buffer.from(encodedId, 'base64url').toString('utf8');
  if (!fs.existsSync(decoded)) {
    throw new Error('Database file not found');
  }
  return decoded;
}

/**
 * List all discovered databases
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const dbs = await dbService.discoverDatabases();
    return res.json(dbs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get available starter database templates
 */
router.get('/templates', requireAuth, (req, res) => {
  const templates = [
    { id: 'blank', name: 'Empty Database', description: 'Clean blank SQLite database with no initial tables' },
    { id: 'auth_users', name: 'User Authentication', description: 'Includes users, sessions, and password management tables' },
    { id: 'key_value', name: 'Key-Value Store', description: 'Includes simple key-value store for app settings or caching' },
    { id: 'blog_cms', name: 'Blog & Content CMS', description: 'Includes posts, categories, and comments tables' },
    { id: 'ecommerce', name: 'E-Commerce / Store', description: 'Includes products, customers, and orders tables' }
  ];
  return res.json(templates);
});

/**
 * Create a new SQLite database
 */
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { websiteId, dbName, template } = req.body;
    if (!dbName || !/^[a-zA-Z0-9._-]+$/.test(dbName)) {
      return res.status(400).json({ error: 'Valid database filename required (e.g. app.db)' });
    }

    const cleanName = dbName.toLowerCase().endsWith('.db') || dbName.toLowerCase().endsWith('.sqlite') || dbName.toLowerCase().endsWith('.sqlite3')
      ? dbName
      : `${dbName}.db`;

    let targetDir = config.DATA_DIR;

    if (websiteId) {
      const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
      if (!site) {
        return res.status(404).json({ error: 'Selected website not found' });
      }
      targetDir = site.root_path;
    }

    const fullDbPath = path.join(targetDir, cleanName);
    const result = await dbService.createDatabase(fullDbPath, template || 'blank');

    return res.status(201).json({
      success: true,
      message: `Database ${cleanName} created successfully!`,
      path: fullDbPath,
      dbId: Buffer.from(fullDbPath).toString('base64url'),
      template: template || 'blank'
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Delete a database file (Protected against system database deletion)
 */
router.post('/delete', requireAuth, async (req, res) => {
  try {
    const { dbId } = req.body;
    if (!dbId || dbId === 'panel_db') {
      return res.status(403).json({ error: 'System database (panel.db) is locked and cannot be deleted.' });
    }

    const dbPath = resolveDbPath(dbId);
    if (path.resolve(dbPath) === path.resolve(config.DB_PATH)) {
      return res.status(403).json({ error: 'System database (panel.db) is locked and cannot be deleted.' });
    }

    const result = await dbService.deleteDatabase(dbPath);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * List tables in a specific database
 */
router.get('/tables', requireAuth, async (req, res) => {
  try {
    const dbPath = resolveDbPath(req.query.dbId);
    const tables = await dbService.listTables(dbPath);
    return res.json(tables);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Get table schema
 */
router.get('/schema', requireAuth, async (req, res) => {
  try {
    const dbPath = resolveDbPath(req.query.dbId);
    const tableName = req.query.table;
    if (!tableName) return res.status(400).json({ error: 'Table name required' });

    const schema = await dbService.getTableSchema(dbPath, tableName);
    return res.json(schema);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Get table rows / data with pagination
 */
router.get('/data', requireAuth, async (req, res) => {
  try {
    const dbPath = resolveDbPath(req.query.dbId);
    const tableName = req.query.table;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;

    if (!tableName) return res.status(400).json({ error: 'Table name required' });

    const data = await dbService.getTableData(dbPath, tableName, page, limit);
    return res.json(data);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Run custom SQL query
 */
router.post('/query', requireAuth, async (req, res) => {
  try {
    const { dbId, query } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'SQL query required' });
    }

    const dbPath = resolveDbPath(dbId);
    const result = await dbService.executeSql(dbPath, query);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Export database file
 */
router.get('/export', requireAuth, (req, res) => {
  try {
    const dbPath = resolveDbPath(req.query.dbId);
    return res.download(dbPath);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
