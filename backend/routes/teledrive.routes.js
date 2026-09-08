const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('../auth/auth.middleware');
const teledriveService = require('../services/teledrive.service');
const config = require('../config/app.config');

// Temporary upload directory for TeleDrive
const tmpDir = path.join(config.DATA_DIR, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max per file
});

/**
 * Get Telegram connection configuration
 */
router.get('/config', requireAuth, async (req, res) => {
  try {
    const cfg = await teledriveService.getConfig();
    return res.json(cfg);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Save Telegram configuration
 */
router.post('/config', requireAuth, async (req, res) => {
  try {
    const { botToken, chatId, channelUsername, enabled } = req.body;
    const cfg = await teledriveService.saveConfig({ botToken, chatId, channelUsername, enabled });
    return res.json({ success: true, config: cfg });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Test Telegram connection
 */
router.post('/test', requireAuth, async (req, res) => {
  try {
    const { botToken, chatId } = req.body;
    const result = await teledriveService.testConnection(botToken, chatId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Get TeleDrive overall storage metrics
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await teledriveService.getDriveStats();
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * List files stored in TeleDrive
 */
router.get('/files', requireAuth, async (req, res) => {
  try {
    const { category, search, limit, offset } = req.query;
    const result = await teledriveService.listFiles({ category, search, limit, offset });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Upload a file directly to Telegram Cloud
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { category, caption } = req.body;
    const filePath = req.file.path;
    const fileName = req.file.originalname || path.basename(filePath);
    const mimeType = req.file.mimetype || 'application/octet-stream';

    const result = await teledriveService.uploadFile({
      filePath,
      fileName,
      category: category || 'general',
      caption: caption || '',
      mimeType
    });

    // Clean up temporary local file
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (_) {}
    }

    return res.status(201).json({ success: true, file: result });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {}
    }
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Stream/Download a file from Telegram Cloud to client
 */
router.get('/download/:fileId', requireAuth, async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const downloadUrl = await teledriveService.getDownloadUrl(fileId);
    return res.redirect(downloadUrl);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a file from TeleDrive
 */
router.delete('/files/:id', requireAuth, async (req, res) => {
  try {
    const result = await teledriveService.deleteFile(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 1-Click Export a website to Telegram Cloud
 */
router.post('/export-website', requireAuth, async (req, res) => {
  try {
    const { websiteId } = req.body;
    if (!websiteId) {
      return res.status(400).json({ error: 'Website ID is required' });
    }

    const result = await teledriveService.exportWebsiteToTelegram(websiteId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 1-Click Deploy a static website from a Telegram Cloud .zip archive
 */
router.post('/deploy-website', requireAuth, async (req, res) => {
  try {
    const { fileId, siteName, domain } = req.body;
    if (!fileId || !siteName) {
      return res.status(400).json({ error: 'Telegram fileId and target siteName are required' });
    }

    const result = await teledriveService.deployWebsiteFromTelegram({ fileId, siteName, domain });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Sync a .tar.gz backup to Telegram Cloud with 7-day auto-pruning
 */
router.post('/backup-sync', requireAuth, async (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Backup filename is required' });
    }

    const result = await teledriveService.syncBackupToTelegram(filename);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
