const securityService = require('../services/security.service');

async function ipBanGuard(req, res, next) {
  try {
    const ip = securityService.getClientIp(req);
    const banInfo = await securityService.isIpBanned(ip);

    if (banInfo && banInfo.isBanned) {
      return res.status(403).json({
        error: 'Access Denied: Your IP address is temporarily banned due to security violations.',
        reason: banInfo.reason,
        bannedUntil: banInfo.bannedUntil
      });
    }

    next();
  } catch (err) {
    next();
  }
}

module.exports = {
  ipBanGuard
};
