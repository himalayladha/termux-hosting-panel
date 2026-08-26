const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const domainService = require('../services/domain.service');

/**
 * List all connected custom domains
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const domains = await domainService.listDomains();
    return res.json(domains);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Connect a new custom domain
 */
router.post('/connect', requireAuth, async (req, res) => {
  try {
    const { domain, websiteId, autoCloudflare, cfApiToken, cfZoneDomain } = req.body;
    const result = await domainService.connectDomain({
      domain,
      websiteId,
      autoCloudflare: autoCloudflare === true || autoCloudflare === 'true',
      cfApiToken,
      cfZoneDomain
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * All-In-One Subdomain Creator with dedicated website & database
 */
router.post('/create-subdomain', requireAuth, async (req, res) => {
  try {
    const {
      subdomainPrefix,
      rootDomain,
      appType,
      createSite,
      createDatabase,
      dbTemplate,
      autoCloudflare,
      cfApiToken
    } = req.body;

    const result = await domainService.createSubdomain({
      subdomainPrefix,
      rootDomain,
      appType: appType || 'html',
      createSite: createSite !== false && createSite !== 'false',
      createDatabase: createDatabase === true || createDatabase === 'true',
      dbTemplate: dbTemplate || 'blank',
      autoCloudflare: autoCloudflare === true || autoCloudflare === 'true',
      cfApiToken
    });

    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Update domain target website mapping
 */
router.put('/:id/target', requireAuth, async (req, res) => {
  try {
    const { websiteId } = req.body;
    const result = await domainService.updateDomainTarget(req.params.id, websiteId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Verify DNS propagation and SSL reachability
 */
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain name is required' });
    const result = await domainService.verifyDomainDns(domain);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Disconnect / delete a domain
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await domainService.deleteDomain(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
