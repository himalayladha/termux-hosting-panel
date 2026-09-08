const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const emailService = require('../services/email.service');

/**
 * List all configured email forwarders
 */
router.get('/forwarders', requireAuth, async (req, res) => {
  try {
    const forwarders = await emailService.listForwarders();
    return res.json(forwarders);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Create or update a forwarder manually
 */
router.post('/forwarders', requireAuth, async (req, res) => {
  try {
    const { domain, customEmail, destinationEmail, mode, brevoConfigured } = req.body;
    const forwarder = await emailService.createForwarder({
      domain,
      customEmail,
      destinationEmail,
      mode: mode || 'manual',
      brevoConfigured: brevoConfigured || 0
    });
    return res.status(201).json(forwarder);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Delete a forwarder
 */
router.delete('/forwarders/:id', requireAuth, async (req, res) => {
  try {
    const result = await emailService.deleteForwarder(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 1-Click Automated Cloudflare Email Routing Setup via API
 */
router.post('/cloudflare-setup', requireAuth, async (req, res) => {
  try {
    const { domain, customEmail, destinationEmail, apiToken } = req.body;
    if (!domain || !customEmail || !destinationEmail) {
      return res.status(400).json({ error: 'Domain, custom email, and destination Gmail are required' });
    }

    const result = await emailService.setupCloudflareEmailRoutingApi({
      domain,
      customEmail,
      destinationEmail,
      apiToken
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 1-Click Push Brevo DKIM/DMARC DNS records to Cloudflare
 */
router.post('/cloudflare-brevo-dns', requireAuth, async (req, res) => {
  try {
    const { domain, brevoCode, dmarcEmail, apiToken } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    const result = await emailService.pushBrevoDnsToCloudflare({
      domain,
      brevoCode,
      dmarcEmail,
      apiToken
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Live DNS Propagation Inspector (MX, SPF single-rule, DKIM, DMARC)
 */
router.post('/verify-dns', requireAuth, async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });

    const verification = await emailService.verifyDnsPropagation(domain);
    return res.json(verification);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get DNS Record Templates & BIND file export for a domain
 */
router.get('/dns-templates', requireAuth, (req, res) => {
  try {
    const { domain, brevoCode, dmarcEmail } = req.query;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });

    const templates = emailService.generateDnsTemplates(domain, brevoCode, dmarcEmail);
    return res.json(templates);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
