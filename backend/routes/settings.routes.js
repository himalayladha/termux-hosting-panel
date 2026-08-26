const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const authService = require('../auth/auth.service');
const db = require('../database/db');
const config = require('../config/app.config');

/**
 * Get all panel settings
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const settingsRows = await db.all('SELECT key, value FROM settings');
    const settingsMap = {};
    settingsRows.forEach((r) => {
      settingsMap[r.key] = r.value;
    });

    return res.json({
      settings: settingsMap,
      version: config.APP_VERSION,
      port: config.PORT,
      host: config.HOST,
      rootDir: config.ROOT_DIR
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Change admin password
 */
router.post('/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.clearCookie('tp_session');
    return res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Save generic settings
 */
router.post('/save', requireAuth, async (req, res) => {
  try {
    const { settings } = req.body;
    if (typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object required' });
    }

    for (const [key, value] of Object.entries(settings)) {
      await db.run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
      );
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
