const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const hardwareService = require('../services/hardware.service');
const notificationService = require('../services/notification.service');

/**
 * Get live battery, thermal, and wakelock stats
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const battery = await hardwareService.getBatteryStatus();
    const wakelock = await hardwareService.getWakeLockStatus();
    return res.json({ battery, wakelock });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Toggle CPU WakeLock
 */
router.post('/wakelock', requireAuth, async (req, res) => {
  try {
    const { enable } = req.body;
    const result = await hardwareService.setWakeLock(!!enable);
    return res.json({
      success: true,
      isEnabled: result.isEnabled,
      message: result.isEnabled ? 'CPU WakeLock enabled (Phone CPU kept awake when locked)' : 'CPU WakeLock released'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get notification settings
 */
router.get('/notifications/settings', requireAuth, async (req, res) => {
  try {
    const settings = await notificationService.getSettings();
    return res.json(settings);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Save notification settings
 */
router.post('/notifications/settings', requireAuth, async (req, res) => {
  try {
    const updated = await notificationService.saveSettings(req.body);
    return res.json({ success: true, settings: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Send test alert notification
 */
router.post('/notifications/test', requireAuth, async (req, res) => {
  try {
    const { channel, botToken, chatId, webhookUrl } = req.body;

    if (channel === 'telegram') {
      await notificationService.sendTelegram(botToken, chatId, {
        title: 'Test Notification',
        message: '✅ Telegram alert integration is working perfectly with your TermuxPanel!',
        level: 'info'
      });
      return res.json({ success: true, message: 'Test message sent to Telegram!' });
    } else if (channel === 'discord') {
      await notificationService.sendDiscord(webhookUrl, {
        title: 'Test Notification',
        message: '✅ Discord webhook integration is working perfectly with your TermuxPanel!',
        level: 'info'
      });
      return res.json({ success: true, message: 'Test message sent to Discord!' });
    } else {
      return res.status(400).json({ error: 'Specify channel: "telegram" or "discord"' });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
