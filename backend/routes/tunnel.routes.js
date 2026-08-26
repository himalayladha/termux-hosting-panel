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
    const tunnelConf = cloudflareService.getTunnelConfig();

    // 1. Check if Cloudflare API has remote ingress hostnames configured and auto-sync to domains table
    try {
      const remoteRules = await cloudflareService.getRemoteTunnelIngress();
      if (remoteRules && remoteRules.length > 0) {
        const websites = await db.all('SELECT id, name, domain, port, type FROM websites');
        for (const rule of remoteRules) {
          const cleanHostname = rule.hostname.trim().toLowerCase();
          const isPanel = rule.service.includes('9000');
          let mappedSiteId = 0;

          if (!isPanel) {
            const portMatch = rule.service.match(/:(\d+)/);
            if (portMatch) {
              const portNum = parseInt(portMatch[1], 10);
              const matchedSite = websites.find((w) => w.port === portNum);
              if (matchedSite) mappedSiteId = matchedSite.id;
            }
          }

          // Auto-insert into domains if not already tracked
          const exists = await db.get('SELECT id FROM domains WHERE domain = ?', [cleanHostname]);
          if (!exists) {
            await db.run(
              'INSERT INTO domains (domain, website_id, ssl_enabled, cname_target) VALUES (?, ?, 1, ?)',
              [cleanHostname, mappedSiteId, tunnelConf.cnameTarget || '<YOUR_TUNNEL_ID>.cfargotunnel.com']
            );
          }
        }
      }
    } catch (_) {}

    // Fetch all connected domains with their mapped websites
    const domains = await db.all(`
      SELECT d.id, d.domain, d.website_id, d.ssl_enabled, d.cname_target,
             w.name AS website_name, w.port AS website_port, w.type AS website_type, w.status AS website_status
      FROM domains d
      LEFT JOIN websites w ON d.website_id = w.id
      ORDER BY d.id ASC
    `);

    // Fetch all websites
    const websites = await db.all('SELECT id, name, domain, port, type, status FROM websites ORDER BY id ASC');

    const mappedDomainSet = new Set();
    const dynamicRoutes = [];

    // 2. Add all active connected domains from database
    for (const d of domains) {
      mappedDomainSet.add(d.domain);
      const isPanel = !d.website_id || parseInt(d.website_id, 10) === 0;
      const targetPort = isPanel ? config.PORT : (d.website_port || 8100);
      const targetDesc = isPanel
        ? 'TermuxPanel Web Administration Dashboard'
        : `Hosted Website: ${d.website_name || 'App'} (${(d.website_type || 'html').toUpperCase()})`;
      const rawTarget = d.cname_target || tunnelConf.cnameTarget || '<YOUR_TUNNEL_ID>.cfargotunnel.com';

      dynamicRoutes.push({
        hostname: d.domain,
        tunnelUrl: `https://${d.domain}`,
        rawTarget,
        type: d.ssl_enabled ? 'HTTPS (Auto SSL)' : 'HTTP',
        service: `http://127.0.0.1:${targetPort}`,
        description: targetDesc,
        status: tunnelStatus.isRunning ? 'Active & Routing' : 'Tunnel Ready',
        isLive: true,
        isPanel
      });
    }

    // 3. Add any hosted websites that do not have a custom domain mapped yet
    for (const site of websites) {
      if (site.domain && !mappedDomainSet.has(site.domain)) {
        dynamicRoutes.push({
          hostname: site.domain,
          tunnelUrl: `https://${site.domain}`,
          rawTarget: tunnelConf.cnameTarget || '<YOUR_TUNNEL_ID>.cfargotunnel.com',
          type: 'HTTP',
          service: `http://127.0.0.1:${site.port}`,
          description: `Hosted Website: ${site.name} (${site.type.toUpperCase()})`,
          status: 'Local Domain',
          isLive: false,
          isPanel: false
        });
        mappedDomainSet.add(site.domain);
      } else if (!site.domain) {
        const hasMapped = domains.some((d) => d.website_id === site.id);
        if (!hasMapped) {
          dynamicRoutes.push({
            hostname: site.name,
            tunnelUrl: `http://localhost:${site.port}`,
            rawTarget: tunnelConf.cnameTarget || '<YOUR_TUNNEL_ID>.cfargotunnel.com',
            type: 'Local Port',
            service: `http://127.0.0.1:${site.port}`,
            description: `Website: ${site.name} (${site.type.toUpperCase()} • Unmapped)`,
            status: 'Local Only',
            isLive: false,
            isPanel: false
          });
        }
      }
    }

    // 4. If no panel domain is mapped yet, show local panel binding
    const hasPanelDomain = domains.some((d) => !d.website_id || parseInt(d.website_id, 10) === 0);
    if (!hasPanelDomain) {
      dynamicRoutes.unshift({
        hostname: `localhost:${config.PORT} (TermuxPanel)`,
        tunnelUrl: `http://localhost:${config.PORT}`,
        rawTarget: tunnelConf.cnameTarget || '<YOUR_TUNNEL_ID>.cfargotunnel.com',
        type: 'Local Host',
        service: `http://127.0.0.1:${config.PORT}`,
        description: 'TermuxPanel Control Plane',
        status: 'Local Only',
        isLive: false,
        isPanel: true
      });
    }

    return res.json({
      status: tunnelStatus,
      recommendedRoutes: dynamicRoutes
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

    const cnameTarget = result.cnameTarget || `${result.tunnelId}.cfargotunnel.com`;

    // Persist panel domain in domains table
    const existingPanelDomain = await db.get('SELECT id FROM domains WHERE domain = ?', [panelHostname]);
    if (!existingPanelDomain) {
      await db.run(
        'INSERT INTO domains (domain, website_id, ssl_enabled, cname_target) VALUES (?, 0, 1, ?)',
        [panelHostname, cnameTarget]
      );
    }

    // Persist website domains
    for (const site of websites) {
      let siteHostname = site.domain ? site.domain.trim().toLowerCase() : `${site.name}.${cleanDomain}`;
      if (!siteHostname.includes('.')) {
        siteHostname = `${siteHostname}.${cleanDomain}`;
      }
      const existingSiteDom = await db.get('SELECT id FROM domains WHERE domain = ?', [siteHostname]);
      if (!existingSiteDom) {
        await db.run(
          'INSERT INTO domains (domain, website_id, ssl_enabled, cname_target) VALUES (?, ?, 1, ?)',
          [siteHostname, site.id, cnameTarget]
        );
      }
      await db.run('UPDATE websites SET domain = ? WHERE id = ?', [siteHostname, site.id]);
    }

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

/**
 * Restart Cloudflare Tunnel process
 */
router.post('/restart', requireAuth, async (req, res) => {
  try {
    const result = await cloudflareService.restartTunnel();
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Stop Cloudflare Tunnel process
 */
router.post('/stop', requireAuth, async (req, res) => {
  try {
    const result = await cloudflareService.stopTunnel();
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Start Cloudflare Tunnel process
 */
router.post('/start', requireAuth, async (req, res) => {
  try {
    const result = await cloudflareService.startTunnel();
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Disconnect and delete Cloudflare Tunnel token
 */
router.delete('/token', requireAuth, async (req, res) => {
  try {
    const result = await cloudflareService.deleteTunnelToken();
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Get Cloudflare Tunnel runtime logs
 */
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const result = await cloudflareService.getTunnelLogs(req.query.limit || 100);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
