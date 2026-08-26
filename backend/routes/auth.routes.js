const express = require('express');
const router = express.Router();
const authService = require('../auth/auth.service');
const { requireAuth } = require('../auth/auth.middleware');

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

    const admin = await authService.createAdminUser(username, password, email);
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
 * Login
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const loginResult = await authService.login(username, password);
    if (!loginResult) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

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
