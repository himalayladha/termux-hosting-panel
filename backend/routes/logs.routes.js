const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const logService = require('../services/log.service');

/**
 * Discover all log files
 */
router.get('/list', requireAuth, async (req, res) => {
  try {
    const logs = await logService.discoverLogs();
    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Tail log lines
 */
router.get('/tail', requireAuth, async (req, res) => {
  try {
    const filePath = req.query.path;
    const lines = parseInt(req.query.lines, 10) || 100;
    const search = req.query.search || '';

    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    const result = await logService.readLogTail(filePath, lines, search);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Clear log file
 */
router.post('/clear', requireAuth, async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: 'File path required' });
    }

    await logService.clearLog(filePath);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
