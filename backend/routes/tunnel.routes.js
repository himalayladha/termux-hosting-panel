const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const cloudflareService = require('../services/cloudflare.service');
const db = require('../database/db');
const config = require('../config/app.config');

/**
 * Get Cloudflare Tunnel Status and Routing Architecture
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const tunnelStatus = await cloudflareService.getTunnelStatus();
    const websites = await db.all('SELECT id, name, domain, port, type, status FROM websites');

    const recommendedRoutes = [
      {
        hostname: 'panel.yourdomain.com',
        service: `http://127.0.0.1:${config.PORT}`,
        description: 'TermuxPanel Web Administration Dashboard'
      },
      ...websites.map((site) => ({
        hostname: site.domain || `${site.name}.yourdomain.com`,
        service: `http://127.0.0.1:${site.port}`,
        description: `Hosted Website (${site.type.toUpperCase()})`
      }))
    ];

    return res.json({
      status: tunnelStatus,
      recommendedRoutes
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Method 1 (Semi-Automatic): Save Cloudflare Tunnel Token directly
 */
router.post('/token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const result = await cloudflareService.saveTunnelToken(token);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Method 2 (Fully-Automatic): Auto-create Tunnel, Ingress Routes & DNS CNAME records via Cloudflare API
 */
router.post('/auto-setup', requireAuth, async (req, res) => {
  try {
    const { apiToken, domain, panelSubdomain, tunnelName } = req.body;
    if (!apiToken || !domain) {
      return res.status(400).json({ error: 'Cloudflare API Token and domain are required' });
    }

    const cleanDomain = domain.trim().toLowerCase();
    const cleanSubdomain = (panelSubdomain || 'panel').trim().toLowerCase();
    const panelHostname = `${cleanSubdomain}.${cleanDomain}`;

    const websites = await db.all('SELECT id, name, domain, port, type FROM websites');

    // Build routes for panel and all websites
    const routes = [
      {
        hostname: panelHostname,
        service: `http://127.0.0.1:${config.PORT}`
      }
    ];

    for (const site of websites) {
      let siteHostname = site.domain ? site.domain.trim().toLowerCase() : `${site.name}.${cleanDomain}`;
      if (!siteHostname.includes('.')) {
        siteHostname = `${siteHostname}.${cleanDomain}`;
      }
      routes.push({
        hostname: siteHostname,
        service: `http://127.0.0.1:${site.port}`
      });
    }

    const result = await cloudflareService.setupTunnelViaApi({
      apiToken,
      domain: cleanDomain,
      tunnelName: tunnelName || 'termux-android-tunnel',
      routes
    });

    return res.json({
      success: true,
      message: 'Cloudflare Zero Trust Tunnel & DNS records automatically created and configured!',
      panelUrl: `https://${panelHostname}`,
      details: result
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
