const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const db = require('../database/db');
const config = require('../config/app.config');
const { isPortInUse } = require('../config/ports.config');

// In-memory active process map: websiteId -> { childProcess, staticServer, startedAt, restartCount }
const activeProcesses = new Map();

/**
 * Ensure website log directory exists
 */
function getWebsiteLogPaths(websiteName) {
  const logDir = path.join(config.LOGS_DIR, 'websites', websiteName);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return {
    accessLog: path.join(logDir, 'access.log'),
    errorLog: path.join(logDir, 'error.log')
  };
}

/**
 * Append message to website log file
 */
function appendLog(filePath, message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(filePath, formatted);
  } catch (err) {
    console.error(`[ProcessManager] Failed to write log to ${filePath}:`, err.message);
  }
}

/**
 * Start an HTML website using an embedded HTTP static server
 */
function startHtmlSite(website) {
  return new Promise((resolve, reject) => {
    const publicPath = path.join(website.root_path, 'public');
    const targetDir = fs.existsSync(publicPath) ? publicPath : website.root_path;
    const { accessLog, errorLog } = getWebsiteLogPaths(website.name);

    appendLog(accessLog, `Starting HTML static server on 127.0.0.1:${website.port} serving ${targetDir}`);

    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.txt': 'text/plain',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2'
    };

    const server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      let safePath = path.normalize(path.join(targetDir, urlPath));

      // Path traversal security check
      if (!safePath.startsWith(targetDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        appendLog(errorLog, `Blocked traversal attempt: ${req.url}`);
        return;
      }

      fs.stat(safePath, (err, stats) => {
        if (err || !stats) {
          // If directory, try index.html
          safePath = path.join(safePath, 'index.html');
          if (!fs.existsSync(safePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            appendLog(accessLog, `404 Not Found: ${req.url}`);
            return;
          }
        } else if (stats.isDirectory()) {
          safePath = path.join(safePath, 'index.html');
          if (!fs.existsSync(safePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found - Missing index.html');
            return;
          }
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        fs.readFile(safePath, (readErr, content) => {
          if (readErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('500 Internal Server Error');
            appendLog(errorLog, `Error reading file ${safePath}: ${readErr.message}`);
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
            appendLog(accessLog, `${req.method} ${req.url} 200`);
          }
        });
      });
    });

    server.once('error', (err) => {
      appendLog(errorLog, `Static server error: ${err.message}`);
      reject(err);
    });

    server.listen(website.port, '127.0.0.1', () => {
      appendLog(accessLog, `Static server listening on 127.0.0.1:${website.port}`);
      activeProcesses.set(website.id, {
        staticServer: server,
        type: 'html',
        startedAt: new Date()
      });
      resolve({ pid: process.pid, port: website.port });
    });
  });
}

/**
 * Start a Node, Python, or PHP application child process
 */
function startChildProcess(website) {
  return new Promise((resolve, reject) => {
    const { accessLog, errorLog } = getWebsiteLogPaths(website.name);
    let command = '';
    let args = [];
    let cwd = website.root_path;

    // Parse custom environment variables if present
    let customEnv = {};
    if (website.env_vars) {
      try {
        customEnv = JSON.parse(website.env_vars);
      } catch (e) {
        // ignore parse error
      }
    }

    const env = {
      ...process.env,
      PORT: String(website.port),
      HOST: '127.0.0.1',
      ...customEnv
    };

    if (website.type === 'node') {
      command = 'node';
      const entry = website.entry_file || 'server.js';
      args = [entry];
    } else if (website.type === 'python') {
      command = 'python';
      const entry = website.entry_file || 'app.py';
      // Check if entry contains uvicorn / fastapi syntax
      if (entry.includes(':app') || entry.includes('main:app')) {
        args = ['-m', 'uvicorn', entry, '--host', '127.0.0.1', '--port', String(website.port)];
      } else {
        args = [entry];
      }
    } else if (website.type === 'php') {
      command = 'php';
      const publicDir = fs.existsSync(path.join(website.root_path, 'public'))
        ? 'public'
        : '.';
      args = ['-S', `127.0.0.1:${website.port}`, '-t', publicDir];
    } else {
      return reject(new Error(`Unsupported application type: ${website.type}`));
    }

    appendLog(accessLog, `Spawning [${website.type}]: ${command} ${args.join(' ')} (PORT=${website.port})`);

    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (!child.pid) {
      const err = new Error(`Failed to spawn ${website.name}`);
      appendLog(errorLog, err.message);
      return reject(err);
    }

    // Write stdout to accessLog
    child.stdout.on('data', (data) => {
      appendLog(accessLog, data.toString().trim());
    });

    // Write stderr to errorLog
    child.stderr.on('data', (data) => {
      appendLog(errorLog, data.toString().trim());
    });

    child.on('error', async (err) => {
      appendLog(errorLog, `Process error: ${err.message}`);
      await db.run('UPDATE websites SET status = "error", pid = NULL WHERE id = ?', [website.id]);
      activeProcesses.delete(website.id);
    });

    child.on('exit', async (code, signal) => {
      appendLog(accessLog, `Process exited with code ${code}, signal ${signal}`);
      await db.run('UPDATE websites SET status = "stopped", pid = NULL WHERE id = ?', [website.id]);
      activeProcesses.delete(website.id);
    });

    activeProcesses.set(website.id, {
      childProcess: child,
      type: website.type,
      startedAt: new Date()
    });

    resolve({ pid: child.pid, port: website.port });
  });
}

/**
 * Start a website by ID
 */
async function startWebsite(websiteId) {
  const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
  if (!website) {
    throw new Error('Website not found');
  }

  if (activeProcesses.has(website.id)) {
    return { success: true, message: 'Website already running', status: 'running', port: website.port };
  }

  try {
    let result;
    if (website.type === 'html') {
      result = await startHtmlSite(website);
    } else {
      result = await startChildProcess(website);
    }

    await db.run(
      'UPDATE websites SET status = "running", pid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [result.pid, website.id]
    );

    return {
      success: true,
      status: 'running',
      pid: result.pid,
      port: website.port
    };
  } catch (err) {
    await db.run(
      'UPDATE websites SET status = "error", pid = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [website.id]
    );
    throw err;
  }
}

/**
 * Stop a website by ID
 */
async function stopWebsite(websiteId) {
  const website = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
  if (!website) {
    throw new Error('Website not found');
  }

  const active = activeProcesses.get(website.id);
  const { accessLog } = getWebsiteLogPaths(website.name);

  if (active) {
    if (active.staticServer) {
      await new Promise((res) => active.staticServer.close(res));
    } else if (active.childProcess) {
      try {
        active.childProcess.kill('SIGTERM');
      } catch (e) {
        active.childProcess.kill('SIGKILL');
      }
    }
    activeProcesses.delete(website.id);
    appendLog(accessLog, `Website stopped by user`);
  }

  await db.run(
    'UPDATE websites SET status = "stopped", pid = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [website.id]
  );

  return { success: true, status: 'stopped' };
}

/**
 * Restart a website
 */
async function restartWebsite(websiteId) {
  try {
    await stopWebsite(websiteId);
  } catch (err) {
    // ignore if not running
  }
  // Short pause before starting again
  await new Promise((res) => setTimeout(res, 500));
  return startWebsite(websiteId);
}

/**
 * Check and refresh real-time process statuses
 */
async function refreshAllStatuses() {
  const websites = await db.all('SELECT * FROM websites');
  for (const site of websites) {
    const isInMemory = activeProcesses.has(site.id);
    let portActive = false;
    if (site.port) {
      portActive = await isPortInUse(site.port);
    }

    if (!isInMemory && site.status === 'running' && !portActive) {
      await db.run('UPDATE websites SET status = "stopped", pid = NULL WHERE id = ?', [site.id]);
    }
  }
}

/**
 * Autostart all enabled websites (called on panel boot)
 */
async function autostartWebsites() {
  const sitesToStart = await db.all('SELECT * FROM websites WHERE autostart = 1');
  console.log(`[ProcessManager] Autostarting ${sitesToStart.length} websites...`);

  for (const site of sitesToStart) {
    try {
      await startWebsite(site.id);
      console.log(`[ProcessManager] Started ${site.name} on :${site.port}`);
    } catch (err) {
      console.error(`[ProcessManager] Failed to autostart ${site.name}:`, err.message);
    }
  }
}

module.exports = {
  startWebsite,
  stopWebsite,
  restartWebsite,
  refreshAllStatuses,
  autostartWebsites,
  getWebsiteLogPaths
};
