const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const packagesService = require('../services/packages.service');

/**
 * List dependencies and installed packages for a website
 */
router.get('/:websiteId', requireAuth, async (req, res) => {
  try {
    const data = await packagesService.listPackages(req.params.websiteId);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Install a package for a website
 */
router.post('/:websiteId/install', requireAuth, async (req, res) => {
  try {
    const { packageName, isDev } = req.body;
    if (!packageName) return res.status(400).json({ error: 'Package name is required' });

    const result = await packagesService.installPackage(req.params.websiteId, packageName, !!isDev);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Uninstall a package from a website
 */
router.post('/:websiteId/uninstall', requireAuth, async (req, res) => {
  try {
    const { packageName } = req.body;
    if (!packageName) return res.status(400).json({ error: 'Package name is required' });

    const result = await packagesService.uninstallPackage(req.params.websiteId, packageName);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Update all packages for a website
 */
router.post('/:websiteId/update-all', requireAuth, async (req, res) => {
  try {
    const result = await packagesService.updateAllPackages(req.params.websiteId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
