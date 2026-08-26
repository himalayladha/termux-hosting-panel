const express = require('express');
const router = express.Router();
const fs = require('fs');
const { requireAuth } = require('../auth/auth.middleware');
const dbService = require('../services/database.service');

// Helper to decode dbId or return path
function resolveDbPath(encodedId) {
  if (!encodedId) throw new Error('Database ID is required');
  if (encodedId === 'panel_db') {
    const config = require('../config/app.config');
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
