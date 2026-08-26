const fs = require('fs');
const path = require('path');
const config = require('../config/app.config');

/**
 * List all available log files across panel and websites
 */
async function discoverLogs() {
  const logs = [];

  // 1. Panel log
  if (fs.existsSync(config.PANEL_LOG_FILE)) {
    const stat = fs.statSync(config.PANEL_LOG_FILE);
    logs.push({
      id: 'panel_log',
      name: 'TermuxPanel System Log',
      category: 'system',
      path: config.PANEL_LOG_FILE,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  }

  // 2. Cloudflare log
  if (fs.existsSync(config.CLOUDFLARE_LOG_FILE)) {
    const stat = fs.statSync(config.CLOUDFLARE_LOG_FILE);
    logs.push({
      id: 'cloudflare_log',
      name: 'Cloudflare Tunnel Log',
      category: 'tunnel',
      path: config.CLOUDFLARE_LOG_FILE,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  }

  // 3. Website logs
  const websiteLogsDir = path.join(config.LOGS_DIR, 'websites');
  if (fs.existsSync(websiteLogsDir)) {
    const sites = fs.readdirSync(websiteLogsDir, { withFileTypes: true });
    for (const site of sites) {
      if (site.isDirectory()) {
        const siteLogDir = path.join(websiteLogsDir, site.name);
        const accessLog = path.join(siteLogDir, 'access.log');
        const errorLog = path.join(siteLogDir, 'error.log');

        if (fs.existsSync(accessLog)) {
          const stat = fs.statSync(accessLog);
          logs.push({
            id: `site_${site.name}_access`,
            name: `${site.name} (Access)`,
            category: 'website',
            path: accessLog,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString()
          });
        }

        if (fs.existsSync(errorLog)) {
          const stat = fs.statSync(errorLog);
          logs.push({
            id: `site_${site.name}_error`,
            name: `${site.name} (Error)`,
            category: 'website',
            path: errorLog,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString()
          });
        }
      }
    }
  }

  return logs;
}

/**
 * Read the last N lines of a log file with optional search query
 */
async function readLogTail(filePath, linesCount = 100, searchQuery = '') {
  if (!fs.existsSync(filePath)) {
    return { lines: [], totalLines: 0 };
  }

  const content = await fs.promises.readFile(filePath, 'utf8');
  let allLines = content.split('\n').filter((l) => l.trim().length > 0);

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    allLines = allLines.filter((line) => line.toLowerCase().includes(query));
  }

  const tail = allLines.slice(-linesCount);
  return {
    lines: tail,
    totalLines: allLines.length
  };
}

/**
 * Clear a log file
 */
async function clearLog(filePath) {
  if (fs.existsSync(filePath)) {
    await fs.promises.writeFile(filePath, '', 'utf8');
    return { success: true };
  }
  throw new Error('Log file not found');
}

module.exports = {
  discoverLogs,
  readLogTail,
  clearLog
};
