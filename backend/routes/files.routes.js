const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('../auth/auth.middleware');
const db = require('../database/db');
const fileService = require('../services/file.service');

// Configure temporary upload storage
const upload = multer({
  dest: path.join(__dirname, '../../data/tmp'),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max upload
});

// Middleware to fetch website root
async function getWebsiteRoot(req, res, next) {
  try {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [req.params.websiteId]);
    if (!site) {
      return res.status(404).json({ error: 'Website not found' });
    }
    req.website = site;
    next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * List files in directory
 */
router.get('/:websiteId', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const subPath = req.query.path || '';
    const result = await fileService.listFiles(req.website.root_path, subPath);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Read file contents
 */
router.get('/:websiteId/read', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'File path required' });
    const result = await fileService.readFile(req.website.root_path, filePath);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Write / save file contents
 */
router.post('/:websiteId/write', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'Path and content required' });
    }
    const result = await fileService.writeFile(req.website.root_path, filePath, content);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Create folder
 */
router.post('/:websiteId/mkdir', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'Directory path required' });
    const result = await fileService.createDirectory(req.website.root_path, dirPath);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Delete item
 */
router.post('/:websiteId/delete', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const { path: itemPath } = req.body;
    if (!itemPath) return res.status(400).json({ error: 'Item path required' });
    const result = await fileService.deleteItem(req.website.root_path, itemPath);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Rename / move item
 */
router.post('/:websiteId/rename', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });
    const result = await fileService.renameItem(req.website.root_path, oldPath, newPath);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Upload file
 */
router.post('/:websiteId/upload', requireAuth, getWebsiteRoot, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const targetDir = req.body.destination || '';
    const safeDestination = fileService.resolveSafePath(req.website.root_path, targetDir);
    const finalFilePath = path.join(safeDestination.target, req.file.originalname);

    // Move uploaded file from temp to final destination
    await fs.promises.rename(req.file.path, finalFilePath);

    return res.json({
      success: true,
      filename: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    // Cleanup tmp file if failed
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {}
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Download file
 */
router.get('/:websiteId/download', requireAuth, getWebsiteRoot, (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'File path required' });

    const safe = fileService.resolveSafePath(req.website.root_path, filePath);
    if (!fs.existsSync(safe.target) || fs.statSync(safe.target).isDirectory()) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.download(safe.target);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
