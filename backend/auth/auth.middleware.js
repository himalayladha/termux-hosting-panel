const authService = require('./auth.service');

async function requireAuth(req, res, next) {
  try {
    let token = req.cookies && req.cookies.tp_session;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Session missing or expired' });
    }

    const user = await authService.validateSession(token);
    if (!user) {
      res.clearCookie('tp_session');
      return res.status(401).json({ success: false, error: 'Unauthorized: Session invalid' });
    }

    // Detect Cloudflare Access 2nd layer verification header
    const cfAccessEmail = req.headers['cf-access-authenticated-user-email'];
    if (cfAccessEmail) {
      user.cfAccessEmail = cfAccessEmail;
    }

    req.user = user;
    req.sessionToken = token;
    next();
  } catch (err) {
    console.error('[Auth Middleware] Error:', err);
    return res.status(500).json({ success: false, error: 'Internal auth error' });
  }
}

module.exports = {
  requireAuth
};
