const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const systemService = require('../services/system.service');
const db = require('../database/db');

/**
 * Get live system metrics (CPU, RAM, Storage, Uptime)
 */
router.get('/metrics', requireAuth, async (req, res) => {
  try {
    const metrics = await systemService.getSystemMetrics();
    return res.json(metrics);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get aggregate dashboard summary (sites count, running apps, databases, cron jobs)
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const metrics = await systemService.getSystemMetrics();
    const websites = await db.all('SELECT id, name, type, port, status, created_at FROM websites');
    const runningWebsites = websites.filter((w) => w.status === 'running').length;
    const cronJobs = await db.all('SELECT id FROM cron_jobs WHERE enabled = 1');

    return res.json({
      metrics,
      websitesCount: websites.length,
      runningCount: runningWebsites,
      cronCount: cronJobs.length,
      recentWebsites: websites.slice(0, 5)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
