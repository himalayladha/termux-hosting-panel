const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/app.config');

/**
 * Scan filesystem for SQLite databases (.db, .sqlite, .sqlite3)
 */
async function discoverDatabases() {
  const dbs = [];

  // 1. Add panel.db
  if (fs.existsSync(config.DB_PATH)) {
    const stat = fs.statSync(config.DB_PATH);
    dbs.push({
      id: 'panel_db',
      name: 'panel.db (System)',
      path: config.DB_PATH,
      size: stat.size,
      isSystem: true,
      modifiedAt: stat.mtime.toISOString()
    });
  }

  // 2. Search in storage/websites
  if (fs.existsSync(config.STORAGE_DIR)) {
    const siteDirs = fs.readdirSync(config.STORAGE_DIR, { withFileTypes: true });
    for (const siteDir of siteDirs) {
      if (siteDir.isDirectory()) {
        const sitePath = path.join(config.STORAGE_DIR, siteDir.name);
        scanDirForDatabases(sitePath, siteDir.name, dbs);
      }
    }
  }

  return dbs;
}

function scanDirForDatabases(dirPath, siteName, resultList) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        scanDirForDatabases(fullPath, siteName, resultList);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.db', '.sqlite', '.sqlite3'].includes(ext)) {
          const stat = fs.statSync(fullPath);
          resultList.push({
            id: Buffer.from(fullPath).toString('base64url'),
            name: `${siteName} / ${entry.name}`,
            path: fullPath,
            size: stat.size,
            isSystem: false,
            modifiedAt: stat.mtime.toISOString()
          });
        }
      }
    }
  } catch (err) {
    // Ignore unreadable dirs
  }
}

/**
 * Get an isolated SQLite connection for a specific DB file
 */
function openDb(dbPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(dbPath)) {
      return reject(new Error('Database file does not exist'));
    }
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

/**
 * List tables and views in a database
 */
async function listTables(dbPath) {
  const db = await openDb(dbPath);
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      [],
      (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

/**
 * Get table schema information (columns, types, pk)
 */
async function getTableSchema(dbPath, tableName) {
  // Sanitize tableName
  const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  const db = await openDb(dbPath);
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info("${cleanName}")`, [], (err, rows) => {
      db.close();
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Query table rows with pagination
 */
async function getTableData(dbPath, tableName, page = 1, limit = 50) {
  const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  const offset = (Math.max(1, page) - 1) * limit;
  const db = await openDb(dbPath);

  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as total FROM "${cleanName}"`, [], (countErr, countRow) => {
      if (countErr) {
        db.close();
        return reject(countErr);
      }

      const totalRows = countRow ? countRow.total : 0;

      db.all(`SELECT * FROM "${cleanName}" LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
        db.close();
        if (err) reject(err);
        else {
          resolve({
            rows: rows || [],
            total: totalRows,
            page,
            limit,
            totalPages: Math.ceil(totalRows / limit)
          });
        }
      });
    });
  });
}

/**
 * Execute custom SQL query
 */
async function executeSql(dbPath, sqlQuery) {
  const trimmed = sqlQuery.trim();
  const isSelect = /^SELECT\b/i.test(trimmed) || /^PRAGMA\b/i.test(trimmed) || /^EXPLAIN\b/i.test(trimmed);

  const db = await openDb(dbPath);
  return new Promise((resolve, reject) => {
    if (isSelect) {
      db.all(trimmed, [], (err, rows) => {
        db.close();
        if (err) reject(err);
        else {
          resolve({
            type: 'select',
            rows: rows || [],
            rowCount: (rows || []).length
          });
        }
      });
    } else {
      db.run(trimmed, [], function (err) {
        db.close();
        if (err) reject(err);
        else {
          resolve({
            type: 'mutation',
            changes: this.changes,
            lastID: this.lastID
          });
        }
      });
    }
  });
}

module.exports = {
  discoverDatabases,
  listTables,
  getTableSchema,
  getTableData,
  executeSql
};
