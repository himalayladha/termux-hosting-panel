const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('../config/app.config');
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

  if (process.platform === 'win32') {
    // Windows tar support (built-in in Windows 10+)
    const tarArgs = validSources.map((p) => `"${p}"`).join(' ');
    await execPromise(`tar -czf "${targetFile}" ${tarArgs}`);
  } else {
    // Unix / Android Termux tar
    const tarArgs = validSources.map((p) => `"${p}"`).join(' ');
    await execPromise(`tar -czf "${targetFile}" ${tarArgs}`);
  }

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

module.exports = {
  listBackups,
  createBackup,
  deleteBackup
};
