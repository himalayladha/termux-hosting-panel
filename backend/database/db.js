const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const config = require('../config/app.config');

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

let SQL = null;
let dbInstance = null;
let saveTimeout = null;

/**
 * Save database to disk
 */
function persistDb() {
  if (dbInstance && config.DB_PATH) {
    try {
      const data = dbInstance.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(config.DB_PATH, buffer);
    } catch (err) {
      console.error('[Database] Failed to persist SQLite to disk:', err.message);
    }
  }
}

/**
 * Schedule a debounced save to reduce flash writes
 */
function schedulePersist() {
  persistDb();
}

/**
 * Initialize SQL.js and load DB from file
 */
async function getDb() {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (!dbInstance) {
    if (fs.existsSync(config.DB_PATH)) {
      try {
        const fileBuffer = fs.readFileSync(config.DB_PATH);
        dbInstance = new SQL.Database(fileBuffer);
      } catch (err) {
        console.error('[Database] Error reading existing DB, initializing new:', err.message);
        dbInstance = new SQL.Database();
      }
    } else {
      dbInstance = new SQL.Database();
      persistDb();
    }
  }

  return dbInstance;
}

/**
 * Helper to normalize query parameters
 */
function normalizeParams(params) {
  if (!params) return [];
  if (Array.isArray(params)) return params;
  return [params];
}

/**
 * Execute an INSERT, UPDATE, DELETE query
 */
async function run(sql, params = []) {
  const db = await getDb();
  const normParams = normalizeParams(params);

  try {
    if (normParams.length > 0) {
      db.run(sql, normParams);
    } else {
      db.run(sql);
    }

    // Retrieve lastID and changes
    let lastID = 0;
    let changes = 0;
    try {
      const res = db.exec('SELECT last_insert_rowid() as lastID, changes() as changes');
      if (res && res.length > 0 && res[0].values && res[0].values.length > 0) {
        lastID = res[0].values[0][0] || 0;
        changes = res[0].values[0][1] || 0;
      }
    } catch (_) {}

    schedulePersist();
    return { lastID, changes };
  } catch (err) {
    throw err;
  }
}

/**
 * Fetch a single row
 */
async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Fetch all matching rows as array of objects
 */
async function all(sql, params = []) {
  const db = await getDb();
  const normParams = normalizeParams(params);

  try {
    const stmt = db.prepare(sql);
    if (normParams.length > 0) {
      stmt.bind(normParams);
    }

    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (err) {
    throw err;
  }
}

/**
 * Run database schema initialization
 */
async function initDb() {
  await getDb();

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Split schema statements by semicolon
  const statements = schemaSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await run(statement);
  }

  // Auto-migrate domains table columns if missing
  try {
    const domainCols = await all("PRAGMA table_info('domains')");
    const colNames = domainCols.map((c) => c.name);
    if (!colNames.includes('ssl_enabled')) {
      await run('ALTER TABLE domains ADD COLUMN ssl_enabled INTEGER DEFAULT 1');
    }
    if (!colNames.includes('cname_target')) {
      await run('ALTER TABLE domains ADD COLUMN cname_target TEXT');
    }
  } catch (_) {}

  // Insert default settings if not set
  const panelPortSetting = await get('SELECT value FROM settings WHERE key = ?', ['panel_port']);
  if (!panelPortSetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['panel_port', String(config.PORT)]);
  }

  const hostnameSetting = await get('SELECT value FROM settings WHERE key = ?', ['panel_hostname']);
  if (!hostnameSetting) {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', ['panel_hostname', 'panel.local']);
  }

  persistDb();
  console.log('[Database] Pure SQLite schema verified and ready at', config.DB_PATH);
}

module.exports = {
  getDb,
  run,
  get,
  all,
  initDb,
  persistDb
};
