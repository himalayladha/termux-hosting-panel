const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const analyticsService = require('../services/analytics.service');

/**
 * Get Analytics Summary (Total Hits, Unique Visitors, Bandwidth, Latency, Status breakdown)
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const websiteId = req.query.websiteId ? parseInt(req.query.websiteId, 10) : null;
    const range = req.query.range || '24h';
    const summary = await analyticsService.getSummary(websiteId, range);
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get Top Visited Paths
 */
router.get('/top-paths', requireAuth, async (req, res) => {
  try {
    const websiteId = req.query.websiteId ? parseInt(req.query.websiteId, 10) : null;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
    const range = req.query.range || '24h';
    const paths = await analyticsService.getTopPaths(websiteId, limit, range);
    return res.json(paths);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get Hourly Traffic Trends (Chart data)
 */
router.get('/hourly', requireAuth, async (req, res) => {
  try {
    const websiteId = req.query.websiteId ? parseInt(req.query.websiteId, 10) : null;
    const hours = req.query.hours ? parseInt(req.query.hours, 10) : 24;
    const trend = await analyticsService.getHourlyTrend(websiteId, hours);
    return res.json(trend);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get Real-time Live Traffic Gauge (RPS & Active Visitors)
 */
router.get('/live', requireAuth, (req, res) => {
  try {
    const live = analyticsService.getLiveRps();
    return res.json(live);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
