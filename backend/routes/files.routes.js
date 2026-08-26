const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('../auth/auth.middleware');
const db = require('../database/db');
const fileService = require('../services/file.service');

// Ensure tmp upload directory exists
const tmpUploadDir = path.join(__dirname, '../../data/tmp');
if (!fs.existsSync(tmpUploadDir)) {
  fs.mkdirSync(tmpUploadDir, { recursive: true });
}

// Configure temporary upload storage
const upload = multer({
  dest: tmpUploadDir,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max upload
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
 * Delete single item
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
 * Batch delete multiple items
 */
router.post('/:websiteId/batch-delete', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const { paths } = req.body;
    if (!Array.isArray(paths) || paths.length === 0) {
      return res.status(400).json({ error: 'Array of file paths required' });
    }
    const result = await fileService.deleteMultipleItems(req.website.root_path, paths);
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
 * Multi-file and Single-file Upload with optional Auto-Extract for ZIP archives
 */
router.post('/:websiteId/upload', requireAuth, getWebsiteRoot, upload.array('files', 100), async (req, res) => {
  try {
    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const targetDir = req.body.destination || '';
    const autoExtract = req.body.autoExtract === 'true' || req.body.autoExtract === true;
    const safeDestination = fileService.resolveSafePath(req.website.root_path, targetDir);

    const uploadedFiles = [];

    for (const file of files) {
      const originalName = file.originalname || path.basename(file.path);
      const isZip = originalName.toLowerCase().endsWith('.zip');
      const finalFilePath = path.join(safeDestination.target, originalName);

      // Move uploaded file from temp to final destination
      await fs.promises.rename(file.path, finalFilePath);

      let extracted = false;
      if (isZip && autoExtract) {
        try {
          const zipRelPath = path.relative(req.website.root_path, finalFilePath).replace(/\\/g, '/');
          await fileService.extractZipArchive(req.website.root_path, zipRelPath, targetDir);
          extracted = true;
        } catch (extractErr) {
          console.warn('[Files] Auto-extract warning:', extractErr.message);
        }
      }

      uploadedFiles.push({
        filename: originalName,
        size: file.size,
        extracted
      });
    }

    return res.json({
      success: true,
      count: uploadedFiles.length,
      files: uploadedFiles
    });
  } catch (err) {
    // Cleanup remaining temp files
    if (req.files) {
      for (const f of req.files) {
        if (fs.existsSync(f.path)) {
          try { fs.unlinkSync(f.path); } catch (_) {}
        }
      }
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Extract an existing ZIP archive
 */
router.post('/:websiteId/extract', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const { path: zipRelativePath, destination: targetSubPath } = req.body;
    if (!zipRelativePath) {
      return res.status(400).json({ error: 'Zip file path required' });
    }

    const result = await fileService.extractZipArchive(
      req.website.root_path,
      zipRelativePath,
      targetSubPath || path.dirname(zipRelativePath)
    );

    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Compress selected files/folders into a ZIP archive
 */
router.post('/:websiteId/compress', requireAuth, getWebsiteRoot, async (req, res) => {
  try {
    const { paths: sourcePaths, zipName, destination } = req.body;
    if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      return res.status(400).json({ error: 'Array of paths to compress required' });
    }

    const cleanZipName = (zipName || 'archive.zip').replace(/[^a-zA-Z0-9._-]/g, '');
    const finalZipName = cleanZipName.toLowerCase().endsWith('.zip') ? cleanZipName : `${cleanZipName}.zip`;
    const targetDir = destination || '';
    const zipSubPath = path.join(targetDir, finalZipName).replace(/\\/g, '/');

    const result = await fileService.createZipArchive(req.website.root_path, sourcePaths, zipSubPath);
    return res.json(result);
  } catch (err) {
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
