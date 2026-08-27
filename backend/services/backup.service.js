const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('../config/app.config');
const db = require('../database/db');
const { formatBytes } = require('./system.service');

// Ensure backup dir exists
if (!fs.existsSync(config.BACKUP_DIR)) {
  fs.mkdirSync(config.BACKUP_DIR, { recursive: true });
}

/**
 * List existing backups
 */
async function listBackups() {
  if (!fs.existsSync(config.BACKUP_DIR)) {
    return [];
  }

  const entries = await fs.promises.readdir(config.BACKUP_DIR, { withFileTypes: true });
  const backups = [];

  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith('.tar.gz') || entry.name.endsWith('.zip'))) {
      const fullPath = path.join(config.BACKUP_DIR, entry.name);
      const stat = await fs.promises.stat(fullPath);
      backups.push({
        filename: entry.name,
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        createdAt: stat.mtime.toISOString(),
        path: fullPath
      });
    }
  }

  // Newest first
  backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return backups;
}

/**
 * Create a new backup
 * @param {'full'|'websites'|'databases'} type
 */
async function createBackup(type = 'full') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${type}-${timestamp}.tar.gz`;
  const targetFile = path.join(config.BACKUP_DIR, filename);

  let sourcePaths = [];
  if (type === 'full') {
    sourcePaths = [config.STORAGE_DIR, config.DATA_DIR, config.CONFIG_DIR];
  } else if (type === 'websites') {
    sourcePaths = [config.STORAGE_DIR];
  } else if (type === 'databases') {
    sourcePaths = [config.DATA_DIR];
  }

  // Filter existing dirs
  const validSources = sourcePaths.filter((p) => fs.existsSync(p));
  if (validSources.length === 0) {
    throw new Error('No valid directories found to back up');
  }

  const tarArgs = validSources.map((p) => `"${p}"`).join(' ');
  await execPromise(`tar -czf "${targetFile}" ${tarArgs}`);

  const stat = await fs.promises.stat(targetFile);
  return {
    filename,
    size: stat.size,
    sizeFormatted: formatBytes(stat.size),
    createdAt: new Date().toISOString()
  };
}

/**
 * Delete a backup archive
 */
async function deleteBackup(filename) {
  // Sanitize filename against traversal
  const cleanName = path.basename(filename);
  const target = path.join(config.BACKUP_DIR, cleanName);

  if (fs.existsSync(target)) {
    await fs.promises.unlink(target);
    return { success: true };
  }
  throw new Error('Backup file not found');
}

/**
 * Prune backups older than retentionDays (Default: 7 days)
 */
async function pruneBackups(retentionDays = 7) {
  const backups = await listBackups();
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const b of backups) {
    const fileTime = new Date(b.createdAt).getTime();
    if (fileTime < cutoffTime) {
      try {
        await deleteBackup(b.filename);
        deletedCount++;
      } catch (_) {}
    }
  }

  return { pruned: deletedCount, remaining: backups.length - deletedCount };
}

/**
 * Dispatch a backup archive directly to Telegram Bot as a Document
 */
async function sendBackupToTelegram(filename) {
  const cleanName = path.basename(filename);
  const filePath = path.join(config.BACKUP_DIR, cleanName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file not found: ${cleanName}`);
  }

  // Fetch Telegram credentials from settings
  const botTokenRow = await db.get("SELECT value FROM settings WHERE key = 'telegram_bot_token'");
  const chatIdRow = await db.get("SELECT value FROM settings WHERE key = 'telegram_chat_id'");

  const botToken = botTokenRow ? botTokenRow.value : '';
  const chatId = chatIdRow ? chatIdRow.value : '';

  if (!botToken || !chatId) {
    throw new Error('Telegram Bot Token or Chat ID not configured in Settings');
  }

  const stat = await fs.promises.stat(filePath);
  const boundary = `----WebKitFormBoundary${Date.now().toString(16)}`;

  // Construct Multipart Body
  const preHeader =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="chat_id"\r\n\r\n` +
    `${chatId}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="caption"\r\n\r\n` +
    `📦 TermuxPanel Cloud Backup: ${cleanName} (${formatBytes(stat.size)})\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="document"; filename="${cleanName}"\r\n` +
    `Content-Type: application/gzip\r\n\r\n`;

  const postFooter = `\r\n--${boundary}--\r\n`;

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${botToken}/sendDocument`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': Buffer.byteLength(preHeader) + stat.size + Buffer.byteLength(postFooter)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.ok) {
            resolve({ success: true, message: `Backup dispatched to Telegram successfully!` });
          } else {
            reject(new Error(`Telegram API Error: ${parsed.description || 'Upload failed'}`));
          }
        } catch (e) {
          reject(new Error(`Telegram response parse error: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('error', (err) => reject(err));

    req.write(preHeader);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(req, { end: false });
    fileStream.on('end', () => {
      req.write(postFooter);
      req.end();
    });
  });
}

/**
 * Execute automated scheduled cloud backup & retention pruning
 */
async function runScheduledAutoBackup() {
  try {
    const newBackup = await createBackup('full');
    await pruneBackups(7);

    // Try cloud push to Telegram if configured
    try {
      await sendBackupToTelegram(newBackup.filename);
    } catch (_) {
      // Telegram not configured or offline - local backup was still created successfully
    }
    return { success: true, backup: newBackup };
  } catch (err) {
    console.error('[Backup] Scheduled backup failed:', err.message);
    throw err;
  }
}

module.exports = {
  listBackups,
  createBackup,
  deleteBackup,
  pruneBackups,
  sendBackupToTelegram,
  runScheduledAutoBackup
};
