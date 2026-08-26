const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/app.config');

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(config.DB_PATH, (err) => {
      if (err) {
        console.error('[Database] Failed to connect to SQLite:', err.message);
      } else {
        // Enable WAL mode for high concurrency and performance
        dbInstance.run('PRAGMA journal_mode = WAL;');
        dbInstance.run('PRAGMA foreign_keys = ON;');
      }
    });
  }
  return dbInstance;
}

/**
 * Execute a SQL query that doesn't return rows (INSERT, UPDATE, DELETE)
 */
function run(sql, params = []) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

/**
 * Fetch a single row
 */
function get(sql, params = []) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Fetch all matching rows
 */
function all(sql, params = []) {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Run database schema migrations
 */
async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Split schema statements
  const statements = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await run(statement);
  }

  // Insert default settings if not set
  const panelPortSetting = await get('SELECT value FROM settings WHERE key = ?', ['panel_port']);
  if (!panelPortSetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['panel_port', String(config.PORT)]);
  }

  const hostnameSetting = await get('SELECT value FROM settings WHERE key = ?', ['panel_hostname']);
  if (!hostnameSetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['panel_hostname', 'panel.local']);
  }

  console.log('[Database] SQLite schema verified and ready at', config.DB_PATH);
}

module.exports = {
  getDb,
  run,
  get,
  all,
  initDb
};
