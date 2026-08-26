const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const securityService = require('../services/security.service');
const totpService = require('../services/totp.service');
const authService = require('../auth/auth.service');
const db = require('../database/db');

/**
 * Get comprehensive security overview
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await securityService.getSecurityStatus(req.user.id);
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Initiate 2FA Setup (generates secret, backup codes, and QR Code Data URI)
 */
router.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const setupData = await totpService.initiate2FASetup(req.user.id, req.user.username);
    return res.json({ success: true, ...setupData });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Confirm 6-digit code and enable 2FA
 */
router.post('/2fa/enable', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: '6-digit authentication code required' });
    }

    const result = await totpService.confirmAndEnable(req.user.id, code);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Disable 2FA (requires current password confirmation)
 */
router.post('/2fa/disable', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Current password required to disable 2FA' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const isPasswordValid = await authService.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const result = await totpService.disable2FA(req.user.id);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * List currently banned IPs
 */
router.get('/ip-bans', requireAuth, async (req, res) => {
  try {
    const bans = await securityService.listBans();
    return res.json(bans);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Unban a specific IP
 */
router.post('/ip-bans/unban', requireAuth, async (req, res) => {
  try {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP address required' });

    const result = await securityService.unbanIp(ip);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * Clear all IP bans
 */
router.post('/ip-bans/clear', requireAuth, async (req, res) => {
  try {
    const result = await securityService.clearAllBans();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Configure Cloudflare Access One-Click Rules
 */
router.post('/cloudflare-access', requireAuth, async (req, res) => {
  try {
    const { apiToken, domain, panelSubdomain, allowedEmails } = req.body;
    const result = await securityService.configureCloudflareAccess({
      apiToken,
      domain,
      panelSubdomain,
      allowedEmails
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
