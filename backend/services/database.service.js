const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const config = require('../config/app.config');

let SQL = null;

async function getSqlEngine() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

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
 * Open SQLite database from path using sql.js
 */
async function openDb(dbPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error('Database file does not exist');
  }

  const sqlEngine = await getSqlEngine();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new sqlEngine.Database(fileBuffer);
  return db;
}

/**
 * Helper to query all rows as objects from a sql.js instance
 */
function queryAllFromDb(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/**
 * List tables and views in a database
 */
async function listTables(dbPath) {
  const db = await openDb(dbPath);
  try {
    const rows = queryAllFromDb(
      db,
      `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
    );
    return rows;
  } finally {
    db.close();
  }
}

/**
 * Get table schema information (columns, types, pk)
 */
async function getTableSchema(dbPath, tableName) {
  const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  const db = await openDb(dbPath);
  try {
    const rows = queryAllFromDb(db, `PRAGMA table_info("${cleanName}")`);
    return rows;
  } finally {
    db.close();
  }
}

/**
 * Query table rows with pagination
 */
async function getTableData(dbPath, tableName, page = 1, limit = 50) {
  const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  const offset = (Math.max(1, page) - 1) * limit;
  const db = await openDb(dbPath);

  try {
    const countRows = queryAllFromDb(db, `SELECT COUNT(*) as total FROM "${cleanName}"`);
    const totalRows = countRows.length > 0 ? countRows[0].total : 0;

    const rows = queryAllFromDb(db, `SELECT * FROM "${cleanName}" LIMIT ? OFFSET ?`, [limit, offset]);

    return {
      rows: rows || [],
      total: totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit)
    };
  } finally {
    db.close();
  }
}

/**
 * Execute custom SQL query
 */
async function executeSql(dbPath, sqlQuery) {
  const trimmed = sqlQuery.trim();
  const isSelect = /^SELECT\b/i.test(trimmed) || /^PRAGMA\b/i.test(trimmed) || /^EXPLAIN\b/i.test(trimmed);

  const db = await openDb(dbPath);
  try {
    if (isSelect) {
      const rows = queryAllFromDb(db, trimmed);
      return {
        type: 'select',
        rows: rows || [],
        rowCount: (rows || []).length
      };
    } else {
      db.run(trimmed);
      let changes = 0;
      let lastID = 0;
      try {
        const info = queryAllFromDb(db, 'SELECT last_insert_rowid() as lastID, changes() as changes');
        if (info.length > 0) {
          lastID = info[0].lastID || 0;
          changes = info[0].changes || 0;
        }
      } catch (_) {}

      // Save changes back to file
      const data = db.export();
      fs.writeFileSync(dbPath, Buffer.from(data));

      return {
        type: 'mutation',
        changes,
        lastID
      };
    }
  } finally {
    db.close();
  }
}

module.exports = {
  discoverDatabases,
  listTables,
  getTableSchema,
  getTableData,
  executeSql
};
