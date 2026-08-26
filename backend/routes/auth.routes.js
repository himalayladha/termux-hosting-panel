const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const authService = require('../auth/auth.service');
const { requireAuth } = require('../auth/auth.middleware');
const securityService = require('../services/security.service');
const totpService = require('../services/totp.service');
const db = require('../database/db');

// In-memory 2FA temporary tokens (ticket -> { userId, expiresAt })
const twoFaTickets = new Map();

/**
 * Check if the panel has an admin initialized
 */
router.get('/status', async (req, res) => {
  try {
    const initialized = await authService.hasAdminUser();
    return res.json({ initialized });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * First-time setup: create the admin user
 */
router.post('/setup', async (req, res) => {
  try {
    const initialized = await authService.hasAdminUser();
    if (initialized) {
      return res.status(400).json({ error: 'Panel is already initialized' });
    }

    const { username, password, email } = req.body;
    if (!username || !password || password.length < 6) {
      return res.status(400).json({ error: 'Username and password (min 6 chars) are required' });
    }

    await authService.createAdminUser(username, password, email);
    const loginResult = await authService.login(username, password);

    res.cookie('tp_session', loginResult.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({ success: true, user: loginResult.user, token: loginResult.token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Login Step 1: Verify username and password
 */
router.post('/login', async (req, res) => {
  const ip = securityService.getClientIp(req);

  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (!user) {
      await securityService.recordFailedLogin(ip, username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValid = await authService.verifyPassword(password, user.password_hash);
    if (!isValid) {
      await securityService.recordFailedLogin(ip, username);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if user has 2FA enabled
    const twoFaStatus = await totpService.get2FAStatus(user.id);
    if (twoFaStatus.isEnabled) {
      // Issue temporary 2FA Ticket (valid for 5 minutes)
      const ticket = crypto.randomBytes(24).toString('hex');
      twoFaTickets.set(ticket, {
        userId: user.id,
        username: user.username,
        expiresAt: Date.now() + 5 * 60 * 1000
      });

      return res.json({
        success: true,
        requires2FA: true,
        tempToken: ticket,
        message: 'Enter 6-digit Google Authenticator / 2FA code'
      });
    }

    // No 2FA required: create session directly
    securityService.resetFailedLogins(ip);
    const loginResult = await authService.login(username, password);

    res.cookie('tp_session', loginResult.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({ success: true, user: loginResult.user, token: loginResult.token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Login Step 2: Verify 2FA code or Emergency Backup Code
 */
router.post('/login/2fa', async (req, res) => {
  const ip = securityService.getClientIp(req);

  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ error: 'Authentication code required' });
    }

    const ticketData = twoFaTickets.get(tempToken);
    if (!ticketData || Date.now() > ticketData.expiresAt) {
      twoFaTickets.delete(tempToken);
      return res.status(400).json({ error: '2FA session expired. Please enter your credentials again.' });
    }

    const isValid = await totpService.validateLogin2FA(ticketData.userId, code);
    if (!isValid) {
      await securityService.recordFailedLogin(ip, ticketData.username);
      return res.status(401).json({ error: 'Invalid 2FA code or backup code' });
    }

    // Success: consume ticket and create session
    twoFaTickets.delete(tempToken);
    securityService.resetFailedLogins(ip);

    const user = await db.get('SELECT * FROM users WHERE id = ?', [ticketData.userId]);
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    const token = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    await db.run(
      'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [sessionId, user.id, token, expiresAt]
    );

    res.cookie('tp_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
        last_login: user.last_login
      },
      token
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Logout
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await authService.logout(req.sessionToken);
    res.clearCookie('tp_session');
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Check current logged in user
 */
router.get('/me', requireAuth, (req, res) => {
  return res.json({ success: true, user: req.user });
});

module.exports = router;
