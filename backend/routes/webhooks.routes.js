const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const webhookService = require('../services/webhook.service');

/**
 * Public Webhook Receiver Endpoint (Triggered by GitHub / GitLab / Bitbucket push events)
 */
router.post('/deploy/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const webhook = await webhookService.getWebhookByToken(token);

    if (!webhook) {
      return res.status(404).json({ error: 'Invalid or expired webhook token' });
    }

    // Verify GitHub HMAC signature if secret is configured
    const signature = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
    if (webhook.secret) {
      const rawBody = JSON.stringify(req.body);
      const isValid = webhookService.verifySignature(rawBody, signature, webhook.secret);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    // Extract Git Push details from payload
    const event = req.headers['x-github-event'] || 'push';
    let commitHash = null;
    let commitMessage = null;
    let author = 'GitHub Webhook';

    if (event === 'ping') {
      return res.json({ success: true, message: 'GitHub Webhook ping received successfully! Connection verified.' });
    }

    if (req.body) {
      if (req.body.ref) {
        const branchName = req.body.ref.replace('refs/heads/', '');
        // If branch filter is set and push is on a different branch, ignore
        if (webhook.branch && branchName !== webhook.branch) {
          return res.json({
            success: true,
            ignored: true,
            message: `Push on branch "${branchName}" ignored. Configured deploy branch is "${webhook.branch}".`
          });
        }
      }

      if (req.body.head_commit) {
        commitHash = req.body.head_commit.id ? req.body.head_commit.id.substring(0, 7) : null;
        commitMessage = req.body.head_commit.message;
        if (req.body.head_commit.author) {
          author = req.body.head_commit.author.name || req.body.head_commit.author.username || author;
        }
      } else if (req.body.commits && req.body.commits.length > 0) {
        const latest = req.body.commits[req.body.commits.length - 1];
        commitHash = latest.id ? latest.id.substring(0, 7) : null;
        commitMessage = latest.message;
        if (latest.author) author = latest.author.name || author;
      }
    }

    // Trigger deployment asynchronously or synchronously
    const result = await webhookService.executeDeployment(webhook.website_id, {
      commitHash,
      commitMessage,
      author,
      triggeredBy: `GitHub Webhook (${event})`
    });

    return res.json({
      success: result.success,
      message: `Deployment ${result.status} for ${result.websiteName}`,
      details: result
    });
  } catch (err) {
    console.error('[Webhooks] Deploy error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Public Webhook Ping Test
 */
router.get('/deploy/:token', async (req, res) => {
  try {
    const webhook = await webhookService.getWebhookByToken(req.params.token);
    if (!webhook) {
      return res.status(404).json({ error: 'Invalid webhook token' });
    }
    return res.json({
      success: true,
      message: 'Webhook endpoint is active and ready to receive Git push events.',
      branch: webhook.branch,
      lastStatus: webhook.last_status,
      lastDeployedAt: webhook.last_deployed_at
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get webhook details for a website (Authenticated)
 */
router.get('/site/:siteId', requireAuth, async (req, res) => {
  try {
    const webhook = await webhookService.getWebhookBySiteId(req.params.siteId);
    return res.json({ webhook });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Enable or update webhook for a website (Authenticated)
 */
router.post('/site/:siteId', requireAuth, async (req, res) => {
  try {
    const { branch, secret, autoNpm, autoPip } = req.body;
    const webhook = await webhookService.createOrUpdateWebhook(req.params.siteId, {
      branch,
      secret,
      autoNpm,
      autoPip
    });
    return res.json({ success: true, webhook });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Delete webhook configuration (Authenticated)
 */
router.delete('/site/:siteId', requireAuth, async (req, res) => {
  try {
    await webhookService.deleteWebhook(req.params.siteId);
    return res.json({ success: true, message: 'Webhook deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Trigger manual deployment immediately (Authenticated)
 */
router.post('/site/:siteId/trigger', requireAuth, async (req, res) => {
  try {
    const result = await webhookService.executeDeployment(req.params.siteId, {
      author: 'Admin User',
      triggeredBy: 'Manual Dashboard Trigger'
    });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Get deployment history for a website (Authenticated)
 */
router.get('/site/:siteId/deployments', requireAuth, async (req, res) => {
  try {
    const deployments = await webhookService.listDeployments(req.params.siteId, req.query.limit || 20);
    return res.json(deployments);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
