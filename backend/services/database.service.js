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

// Pre-built Starter Schema Presets
const STARTER_SCHEMAS = {
  blank: '',
  auth_users: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `,
  key_value: `
    CREATE TABLE IF NOT EXISTS key_value_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      type TEXT DEFAULT 'string',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `,
  blog_cms: `
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );
  `,
  ecommerce: `
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      price REAL NOT NULL,
      stock_quantity INTEGER DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `
};

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
 * Create a new SQLite database with optional starter schema template
 */
async function createDatabase(fullDbPath, templateType = 'blank') {
  if (fs.existsSync(fullDbPath)) {
    throw new Error('A database file already exists at this path');
  }

  const parentDir = path.dirname(fullDbPath);
  if (!fs.existsSync(parentDir)) {
    await fs.promises.mkdir(parentDir, { recursive: true });
  }

  const sqlEngine = await getSqlEngine();
  const db = new sqlEngine.Database();

  const schema = STARTER_SCHEMAS[templateType] || '';
  if (schema.trim()) {
    // Split and run statements
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      db.run(stmt);
    }
  }

  const data = db.export();
  fs.writeFileSync(fullDbPath, Buffer.from(data));
  db.close();

  return {
    success: true,
    path: fullDbPath,
    template: templateType
  };
}

/**
 * Delete a database file
 */
async function deleteDatabase(fullDbPath) {
  if (fullDbPath === config.DB_PATH) {
    throw new Error('Cannot delete system panel.db');
  }
  if (!fs.existsSync(fullDbPath)) {
    throw new Error('Database file not found');
  }
  await fs.promises.unlink(fullDbPath);
  return { success: true };
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
  STARTER_SCHEMAS,
  discoverDatabases,
  createDatabase,
  deleteDatabase,
  listTables,
  getTableSchema,
  getTableData,
  executeSql
};
