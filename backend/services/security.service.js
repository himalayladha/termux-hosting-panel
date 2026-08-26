const db = require('../database/db');
const cloudflareService = require('./cloudflare.service');
const notificationService = require('./notification.service');

// In-memory failed login tracking
const failedLogins = new Map(); // ip -> { count, firstAttempt }
const notFoundScans = new Map(); // ip -> { count, firstAttempt }

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const BAN_DURATION_MINUTES = 60; // 1 hour ban

// Private LAN and Loopback Whitelist
function isWhitelisted(ip) {
  if (!ip) return true;
  const cleanIp = ip.replace(/^::ffff:/, '').trim();

  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') return true;
  if (cleanIp.startsWith('192.168.')) return true;
  if (cleanIp.startsWith('10.')) return true;
  if (cleanIp.startsWith('172.16.') || cleanIp.startsWith('172.31.')) return true;

  return false;
}

// Client IP extractor from request
function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp.trim();

  const xForwarded = req.headers['x-forwarded-for'];
  if (xForwarded) {
    return xForwarded.split(',')[0].trim();
  }

  return (req.ip || req.connection.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '');
}

const securityService = {
  getClientIp,
  isWhitelisted,

  /**
   * Check if an IP address is currently banned
   */
  async isIpBanned(ip) {
    if (isWhitelisted(ip)) return false;

    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();
    const row = await db.get(
      'SELECT id, reason, banned_until FROM ip_bans WHERE ip = ? AND datetime(banned_until) > datetime("now")',
      [cleanIp]
    );

    if (row) {
      return {
        isBanned: true,
        reason: row.reason,
        bannedUntil: row.banned_until
      };
    }

    return { isBanned: false };
  },

  /**
   * Record a failed login attempt
   */
  async recordFailedLogin(ip, username = '') {
    if (isWhitelisted(ip)) return;
    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();
    const now = Date.now();

    const record = failedLogins.get(cleanIp) || { count: 0, firstAttempt: now };
    if (now - record.firstAttempt > WINDOW_MS) {
      record.count = 1;
      record.firstAttempt = now;
    } else {
      record.count += 1;
    }
    failedLogins.set(cleanIp, record);

    // Max 5 failed attempts within 10 minutes -> 1 Hour Ban
    if (record.count >= 5) {
      await this.banIp(cleanIp, `Brute-force password attack (${record.count} failed logins)`, BAN_DURATION_MINUTES);
      failedLogins.delete(cleanIp);

      // Trigger high priority security alert
      try {
        await notificationService.broadcastAlert({
          title: 'IP Banned (Brute-Force Attack)',
          message: `🚨 Banned IP <b>${cleanIp}</b> for 1 hour after ${record.count} consecutive failed login attempts on user <b>${username || 'admin'}</b>.`,
          level: 'danger',
          category: 'general'
        });
      } catch (_) {}
    }
  },

  /**
   * Reset failed login counter for an IP upon successful authentication
   */
  resetFailedLogins(ip) {
    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();
    failedLogins.delete(cleanIp);
  },

  /**
   * Ban an IP address
   */
  async banIp(ip, reason = 'Automated security trigger', durationMinutes = 60) {
    if (isWhitelisted(ip)) return null;
    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();

    const bannedUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    const existing = await db.get('SELECT id, failed_attempts FROM ip_bans WHERE ip = ?', [cleanIp]);
    if (existing) {
      await db.run(
        'UPDATE ip_bans SET reason = ?, failed_attempts = failed_attempts + 1, banned_until = ?, created_at = CURRENT_TIMESTAMP WHERE ip = ?',
        [reason, bannedUntil, cleanIp]
      );
    } else {
      await db.run(
        'INSERT INTO ip_bans (ip, reason, failed_attempts, banned_until) VALUES (?, ?, 5, ?)',
        [cleanIp, reason, bannedUntil]
      );
    }

    return { ip: cleanIp, bannedUntil, reason };
  },

  /**
   * Unban a specific IP address
   */
  async unbanIp(ip) {
    const cleanIp = (ip || '').replace(/^::ffff:/, '').trim();
    await db.run('DELETE FROM ip_bans WHERE ip = ?', [cleanIp]);
    failedLogins.delete(cleanIp);
    return { success: true, message: `IP ${cleanIp} has been unbanned` };
  },

  /**
   * Clear all active IP bans
   */
  async clearAllBans() {
    await db.run('DELETE FROM ip_bans');
    failedLogins.clear();
    return { success: true, message: 'All IP bans have been cleared' };
  },

  /**
   * List all currently banned IPs
   */
  async listBans() {
    const rows = await db.all(
      `SELECT id, ip, reason, failed_attempts, banned_until, created_at,
              datetime(banned_until) > datetime('now') AS is_active
       FROM ip_bans
       ORDER BY created_at DESC`
    );

    return rows.map((r) => {
      const remainingMs = new Date(r.banned_until).getTime() - Date.now();
      const remainingMins = Math.max(0, Math.ceil(remainingMs / 60000));
      return {
        ...r,
        isActive: !!r.is_active,
        remainingMinutes: remainingMins,
        remainingFormatted: remainingMins > 0 ? `${remainingMins} min remaining` : 'Expired'
      };
    });
  },

  /**
   * Get overall security statistics
   */
  async getSecurityStatus(userId) {
    const totpService = require('./totp.service');
    const twoFA = await totpService.get2FAStatus(userId);
    const activeBans = await db.all('SELECT COUNT(*) as count FROM ip_bans WHERE datetime(banned_until) > datetime("now")');
    const totalBans = await db.all('SELECT COUNT(*) as count FROM ip_bans');

    const cfAccess = await this.getCloudflareAccessStatus();

    return {
      twoFA,
      activeBansCount: activeBans[0] ? activeBans[0].count : 0,
      totalBansCount: totalBans[0] ? totalBans[0].count : 0,
      cloudflareAccess: cfAccess
    };
  },

  /**
   * Check Cloudflare Access status
   */
  async getCloudflareAccessStatus() {
    const savedSetting = await db.get('SELECT value FROM settings WHERE key = "cloudflare_access_config"');
    if (savedSetting && savedSetting.value) {
      try {
        return JSON.parse(savedSetting.value);
      } catch (_) {}
    }
    return {
      isConfigured: false,
      allowedEmails: [],
      applicationName: 'TermuxPanel Admin Access'
    };
  },

  /**
   * Configure Cloudflare Access One-Click Rules
   */
  async configureCloudflareAccess({ apiToken, domain, panelSubdomain = 'panel', allowedEmails = [] }) {
    const effectiveToken = (apiToken && apiToken.trim()) || cloudflareService.getSavedApiToken();
    if (!effectiveToken) {
      throw new Error('Cloudflare API Token is required to configure Zero Trust Access');
    }

    if (!domain) {
      throw new Error('Domain name is required');
    }

    const cleanDomain = domain.trim().toLowerCase();
    const panelHostname = `${(panelSubdomain || 'panel').trim().toLowerCase()}.${cleanDomain}`;
    const emailsList = Array.isArray(allowedEmails) ? allowedEmails : allowedEmails.split(/[\s,]+/).filter(Boolean);

    if (emailsList.length === 0) {
      throw new Error('At least one authorized administrator email address is required (e.g. user@gmail.com)');
    }

    // 1. Get Cloudflare Accounts
    const accountsRes = await cloudflareService.cfApiRequest('GET', '/accounts', null, effectiveToken);
    if (!accountsRes.result || accountsRes.result.length === 0) {
      throw new Error('No Cloudflare accounts found for this API token');
    }
    const accountId = accountsRes.result[0].id;

    // 2. Create or Update Access Application
    let appResult = null;
    try {
      const existingApps = await cloudflareService.cfApiRequest(
        'GET',
        `/accounts/${accountId}/access/apps`,
        null,
        effectiveToken
      );

      const existingApp = (existingApps.result || []).find((a) => a.domain === panelHostname);
      if (existingApp) {
        appResult = existingApp;
      } else {
        const createRes = await cloudflareService.cfApiRequest(
          'POST',
          `/accounts/${accountId}/access/apps`,
          {
            name: 'TermuxPanel Admin Access',
            domain: panelHostname,
            type: 'self_hosted',
            session_duration: '24h',
            auto_redirect_to_identity: false
          },
          effectiveToken
        );
        appResult = createRes.result;
      }
    } catch (appErr) {
      console.warn('[Cloudflare Access] App create note:', appErr.message);
    }

    // 3. Create or Update Access Policy
    if (appResult && appResult.id) {
      try {
        const includeRules = emailsList.map((email) => ({ email: { email: email.trim().toLowerCase() } }));
        await cloudflareService.cfApiRequest(
          'POST',
          `/accounts/${accountId}/access/apps/${appResult.id}/policies`,
          {
            name: 'Allow Admin Emails',
            decision: 'allow',
            include: includeRules
          },
          effectiveToken
        );
      } catch (polErr) {
        console.warn('[Cloudflare Access] Policy update note:', polErr.message);
      }
    }

    // 4. Save configuration in database
    const configData = {
      isConfigured: true,
      domain: cleanDomain,
      panelHostname,
      allowedEmails: emailsList,
      applicationName: 'TermuxPanel Admin Access',
      updatedAt: new Date().toISOString()
    };

    const configStr = JSON.stringify(configData);
    const existing = await db.get('SELECT key FROM settings WHERE key = "cloudflare_access_config"');
    if (existing) {
      await db.run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = "cloudflare_access_config"', [configStr]);
    } else {
      await db.run('INSERT INTO settings (key, value) VALUES ("cloudflare_access_config", ?)', [configStr]);
    }

    return {
      success: true,
      message: `Cloudflare Access One-Click Policy deployed! Only [${emailsList.join(', ')}] can access https://${panelHostname}`,
      config: configData
    };
  }
};

module.exports = securityService;
