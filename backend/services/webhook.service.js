const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const db = require('../database/db');
const processService = require('./process.service');

/**
 * Webhook & CI/CD Deployment Service
 */
const webhookService = {
  /**
   * Get webhook configuration for a website
   */
  async getWebhookBySiteId(websiteId) {
    return await db.get('SELECT * FROM webhooks WHERE website_id = ?', [websiteId]);
  },

  /**
   * Get webhook configuration by unique public token
   */
  async getWebhookByToken(token) {
    return await db.get('SELECT * FROM webhooks WHERE token = ?', [token]);
  },

  /**
   * Create or update webhook for a website
   */
  async createOrUpdateWebhook(websiteId, { branch = 'main', secret = null, autoNpm = 1, autoPip = 1 } = {}) {
    const existing = await this.getWebhookBySiteId(websiteId);
    const token = existing ? existing.token : crypto.randomBytes(24).toString('hex');
    const webhookSecret = secret !== undefined ? (secret ? secret.trim() : null) : (existing ? existing.secret : crypto.randomBytes(16).toString('hex'));

    if (existing) {
      await db.run(
        `UPDATE webhooks
         SET branch = ?, secret = ?, auto_npm = ?, auto_pip = ?
         WHERE id = ?`,
        [branch || 'main', webhookSecret, autoNpm ? 1 : 0, autoPip ? 1 : 0, existing.id]
      );
    } else {
      await db.run(
        `INSERT INTO webhooks (website_id, token, branch, secret, auto_npm, auto_pip)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [websiteId, token, branch || 'main', webhookSecret, autoNpm ? 1 : 0, autoPip ? 1 : 0]
      );
    }

    return await this.getWebhookBySiteId(websiteId);
  },

  /**
   * Delete webhook configuration
   */
  async deleteWebhook(websiteId) {
    return await db.run('DELETE FROM webhooks WHERE website_id = ?', [websiteId]);
  },

  /**
   * Verify GitHub HMAC-SHA256 signature
   */
  verifySignature(rawBody, signatureHeader, secret) {
    if (!secret) return true; // If no secret configured, allow token-based authentication
    if (!signatureHeader) return false;

    try {
      const parts = signatureHeader.split('=');
      if (parts.length !== 2 || parts[0] !== 'sha256') return false;

      const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(parts[1], 'hex'), Buffer.from(expectedSignature, 'hex'));
    } catch (_) {
      return false;
    }
  },

  /**
   * Execute automated deployment pipeline for a website
   */
  async executeDeployment(websiteId, { commitHash = null, commitMessage = null, author = 'Webhook Trigger', triggeredBy = 'GitHub Webhook' } = {}) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!site) throw new Error('Website not found');

    const webhook = await this.getWebhookBySiteId(websiteId);
    const branch = (webhook && webhook.branch) || 'main';
    const logs = [];
    let isSuccess = true;

    logs.push(`[${new Date().toISOString()}] Starting CI/CD deployment for "${site.name}" (Branch: ${branch})`);
    logs.push(`Triggered by: ${triggeredBy}`);

    const siteRoot = site.root_path;

    if (!fs.existsSync(siteRoot)) {
      throw new Error(`Website directory does not exist: ${siteRoot}`);
    }

    try {
      // 1. Check if git repository exists in document root
      const gitDir = path.join(siteRoot, '.git');
      if (fs.existsSync(gitDir)) {
        logs.push('[Git] Fetching latest commits...');
        try {
          const fetchRes = await execPromise(`git -c safe.directory='*' fetch origin ${branch}`, { cwd: siteRoot });
          if (fetchRes.stdout) logs.push(fetchRes.stdout.trim());

          logs.push(`[Git] Pulling origin/${branch}...`);
          const pullRes = await execPromise(`git -c safe.directory='*' pull origin ${branch}`, { cwd: siteRoot });
          if (pullRes.stdout) logs.push(pullRes.stdout.trim());

          // Extract latest commit info if not provided in webhook payload
          if (!commitHash) {
            try {
              const headInfo = await execPromise('git log -1 --pretty=format:"%h|%an|%s"', { cwd: siteRoot });
              const [h, a, s] = headInfo.stdout.trim().split('|');
              commitHash = h || 'HEAD';
              if (!author || author === 'Webhook Trigger') author = a || 'Git Author';
              if (!commitMessage) commitMessage = s || 'Auto-pull latest commit';
            } catch (_) {}
          }
        } catch (gitErr) {
          logs.push(`[Git Error] ${gitErr.message}`);
          // Don't fail completely if local changes needed merge or fallback
        }
      } else {
        logs.push('[Notice] Not a git repository yet. Initialized files kept.');
      }

      // 2. Auto NPM dependencies if enabled and package.json exists
      const packageJson = path.join(siteRoot, 'package.json');
      if (webhook && webhook.auto_npm && fs.existsSync(packageJson)) {
        logs.push('[NPM] Installing production dependencies...');
        try {
          const npmRes = await execPromise('npm install --omit=dev --no-audit --no-fund', { cwd: siteRoot });
          if (npmRes.stdout) logs.push(npmRes.stdout.trim());
        } catch (npmErr) {
          logs.push(`[NPM Error] ${npmErr.message}`);
        }
      }

      // 3. Auto PIP dependencies if enabled and requirements.txt exists
      const reqTxt = path.join(siteRoot, 'requirements.txt');
      if (webhook && webhook.auto_pip && fs.existsSync(reqTxt)) {
        logs.push('[Python PIP] Installing requirements.txt...');
        try {
          const pipRes = await execPromise('pip install -r requirements.txt --no-cache-dir', { cwd: siteRoot });
          if (pipRes.stdout) logs.push(pipRes.stdout.trim());
        } catch (pipErr) {
          logs.push(`[PIP Error] ${pipErr.message}`);
        }
      }

      // 4. Restart website process cleanly
      logs.push('[Process] Reloading application service...');
      try {
        await processService.restartWebsite(site.id);
        logs.push(`✓ Application restarted on port :${site.port}`);
      } catch (procErr) {
        logs.push(`[Restart Warning] ${procErr.message}`);
      }

      logs.push(`✓ Deployment completed successfully at ${new Date().toISOString()}`);
    } catch (err) {
      isSuccess = false;
      logs.push(`❌ Deployment failed: ${err.message}`);
    }

    const logOutput = logs.join('\n');
    const status = isSuccess ? 'success' : 'failed';

    // Record deployment in DB
    await db.run(
      `INSERT INTO deployments (website_id, commit_hash, commit_message, author, status, log_output)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [site.id, commitHash || 'manual', commitMessage || 'Manual / Webhook deployment', author || 'Admin', status, logOutput]
    );

    // Update webhook timestamp
    if (webhook) {
      await db.run('UPDATE webhooks SET last_deployed_at = CURRENT_TIMESTAMP, last_status = ? WHERE id = ?', [status, webhook.id]);
    }

    return {
      success: isSuccess,
      websiteName: site.name,
      status,
      logOutput,
      commitHash: commitHash || 'latest',
      commitMessage: commitMessage || 'Deployed latest code'
    };
  },

  /**
   * List deployment history for a website
   */
  async listDeployments(websiteId, limit = 20) {
    return await db.all(
      'SELECT * FROM deployments WHERE website_id = ? ORDER BY id DESC LIMIT ?',
      [websiteId, limit]
    );
  }
};

module.exports = webhookService;
