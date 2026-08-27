const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const uptimeService = require('../services/uptime.service');

/**
 * Get Uptime Stats & Health History
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const websiteId = req.query.websiteId ? parseInt(req.query.websiteId, 10) : null;
    const range = req.query.range || '24h';
    const stats = await uptimeService.getUptimeStats(websiteId, range);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger immediate health check for all websites
 */
router.post('/check-now', requireAuth, async (req, res) => {
  try {
    const results = await uptimeService.checkAllWebsites();
    return res.json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
