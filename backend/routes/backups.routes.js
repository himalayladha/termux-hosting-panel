const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../auth/auth.middleware');
const backupService = require('../services/backup.service');
const config = require('../config/app.config');

/**
 * List all available backups
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const backups = await backupService.listBackups();
    return res.json(backups);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new backup
 */
router.post('/create', requireAuth, async (req, res) => {
  try {
    const { type } = req.body;
    const backup = await backupService.createBackup(type || 'full');
    return res.status(201).json(backup);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Send backup archive to Telegram Cloud
 */
router.post('/send-telegram', requireAuth, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename is required' });
    const result = await backupService.sendBackupToTelegram(filename);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Prune old backups
 */
router.post('/prune', requireAuth, async (req, res) => {
  try {
    const retentionDays = req.body.retentionDays ? parseInt(req.body.retentionDays, 10) : 7;
    const result = await backupService.pruneBackups(retentionDays);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Run full auto-backup & cloud sync cycle
 */
router.post('/auto-backup', requireAuth, async (req, res) => {
  try {
    const result = await backupService.runScheduledAutoBackup();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Download a backup archive
 */
router.get('/download/:filename', requireAuth, (req, res) => {
  try {
    const cleanName = path.basename(req.params.filename);
    const target = path.join(config.BACKUP_DIR, cleanName);

    if (!fs.existsSync(target)) {
      return res.status(404).json({ error: 'Backup archive not found' });
    }

    return res.download(target);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a backup archive
 */
router.delete('/:filename', requireAuth, async (req, res) => {
  try {
    const result = await backupService.deleteBackup(req.params.filename);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
