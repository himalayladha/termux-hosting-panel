const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const catalogService = require('../services/catalog.service');

/**
 * List all catalog apps
 */
router.get('/', requireAuth, (req, res) => {
  try {
    const apps = catalogService.listCatalogApps();
    return res.json(apps);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 1-Click Deploy an app from catalog
 */
router.post('/deploy', requireAuth, async (req, res) => {
  try {
    const { appId, name, domain, customPort } = req.body;
    if (!appId || !name) {
      return res.status(400).json({ error: 'App ID and site name are required' });
    }

    const result = await catalogService.deployApp({ appId, name, domain, customPort });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
