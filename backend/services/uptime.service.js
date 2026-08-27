const http = require('http');
const https = require('https');
const db = require('../database/db');
const processService = require('./process.service');
const hardwareService = require('./hardware.service');

// In-memory failure tracking for auto-healing: websiteId -> consecutiveFailures
const failureCounters = new Map();
let watchdogTimer = null;

const uptimeService = {
  /**
   * Ping a single website endpoint and record latency/status
   */
  async checkWebsite(website) {
    if (!website || !website.port) return null;

    const startTime = Date.now();
    const port = website.port;

    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/`, { timeout: 5000 }, async (res) => {
        const latency = Date.now() - startTime;
        const statusCode = res.statusCode;
        const isUp = statusCode < 500;

        // Drain response data
        res.on('data', () => {});
        res.on('end', async () => {
          await uptimeService.recordCheck(website.id, isUp ? 'up' : 'down', statusCode, latency);
          if (isUp) {
            failureCounters.set(website.id, 0);
          } else {
            await uptimeService.handleFailure(website, `HTTP ${statusCode}`);
          }
          resolve({ websiteId: website.id, name: website.name, status: isUp ? 'up' : 'down', statusCode, latency });
        });
      });

      req.on('timeout', async () => {
        req.destroy();
        const latency = Date.now() - startTime;
        await uptimeService.recordCheck(website.id, 'down', 504, latency, 'Connection timeout (5s)');
        await uptimeService.handleFailure(website, 'Connection timeout (5s)');
        resolve({ websiteId: website.id, name: website.name, status: 'down', statusCode: 504, latency });
      });

      req.on('error', async (err) => {
        const latency = Date.now() - startTime;
        await uptimeService.recordCheck(website.id, 'down', 0, latency, err.message);
        await uptimeService.handleFailure(website, err.message);
        resolve({ websiteId: website.id, name: website.name, status: 'down', statusCode: 0, latency });
      });
    });
  },

  /**
   * Record check in SQLite
   */
  async recordCheck(websiteId, status, statusCode, latencyMs, errorMessage = null) {
    try {
      await db.run(
        `INSERT INTO uptime_checks (website_id, status, status_code, latency_ms, error_message)
         VALUES (?, ?, ?, ?, ?)`,
        [websiteId, status, statusCode || 0, latencyMs || 0, errorMessage]
      );
    } catch (_) {}
  },

  /**
   * Handle website failure with Auto-Healing & Alerting
   */
  async handleFailure(website, reason) {
    const current = (failureCounters.get(website.id) || 0) + 1;
    failureCounters.set(website.id, current);

    console.warn(`[Uptime] Website "${website.name}" health check failed (${current}/3): ${reason}`);

    // Auto-Healer: If 3 consecutive failures occur, trigger automated restart
    if (current >= 3 && website.status === 'running') {
      console.log(`[Auto-Healer] ⚡ Automatically restarting unresponsive website: "${website.name}"`);
      failureCounters.set(website.id, 0); // reset counter

      try {
        await processService.restartWebsite(website.id);
        const msg = `🚨 [TermuxPanel Auto-Healer]\nWebsite "${website.name}" was unresponsive (${reason}).\n✓ Automatically restarted and recovered process!`;
        await hardwareService.sendNotification(msg);
      } catch (restartErr) {
        console.error(`[Auto-Healer] Failed to restart "${website.name}":`, restartErr.message);
      }
    }
  },

  /**
   * Run health checks for all running websites
   */
  async checkAllWebsites() {
    try {
      const websites = await db.all("SELECT * FROM websites WHERE status = 'running'");
      const results = [];
      for (const site of websites) {
        const res = await this.checkWebsite(site);
        if (res) results.push(res);
      }
      return results;
    } catch (err) {
      console.error('[Uptime] Check all websites failed:', err.message);
      return [];
    }
  },

  /**
   * Get Uptime statistics and history for a website or all websites
   */
  async getUptimeStats(websiteId = null, range = '24h') {
    let intervalModifier = "-1 day";
    if (range === '7d') intervalModifier = "-7 days";
    else if (range === '30d') intervalModifier = "-30 days";

    let whereClause = `WHERE datetime(checked_at) >= datetime('now', '${intervalModifier}')`;
    const params = [];

    if (websiteId) {
      whereClause += ` AND website_id = ?`;
      params.push(websiteId);
    }

    const overall = await db.get(
      `SELECT
         COUNT(*) as total_checks,
         SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) as up_checks,
         COALESCE(AVG(latency_ms), 0) as avg_latency_ms
       FROM uptime_checks
       ${whereClause}`,
      params
    );

    const total = overall ? overall.total_checks : 0;
    const up = overall ? overall.up_checks : 0;
    const uptimePercent = total > 0 ? parseFloat(((up / total) * 100).toFixed(2)) : 100.0;

    // Recent 30 checks
    const recentChecks = await db.all(
      `SELECT
         u.id, u.website_id, w.name as website_name, u.status, u.status_code, u.latency_ms, u.error_message, u.checked_at
       FROM uptime_checks u
       JOIN websites w ON u.website_id = w.id
       ${whereClause.replace(/created_at/g, 'checked_at')}
       ORDER BY u.checked_at DESC
       LIMIT 30`,
      params
    );

    return {
      range,
      uptimePercent,
      totalChecks: total,
      upChecks: up,
      downChecks: total - up,
      avgLatencyMs: overall ? Math.round(overall.avg_latency_ms) : 0,
      recentChecks
    };
  },

  /**
   * Start recurring background Uptime Watchdog daemon
   */
  startWatchdog(intervalMs = 60000) {
    if (watchdogTimer) clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      uptimeService.checkAllWebsites();
    }, intervalMs);

    // Run initial check after 10 seconds
    setTimeout(() => {
      uptimeService.checkAllWebsites();
    }, 10000);
  }
};

module.exports = uptimeService;
