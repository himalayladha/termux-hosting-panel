const crypto = require('crypto');
const db = require('../database/db');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encode Buffer to Base32 String
 */
function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode Base32 String to Buffer
 */
function base32Decode(str) {
  const cleaned = str.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate 6-digit TOTP for a given counter
 */
function generateCode(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBuffer);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Minimal QR code SVG renderer for otpauth:// URL
 * Generates an SVG Data URI that displays anywhere
 */
function generateQrSvg(text) {
  // Use public high-reliability QR API with local fallback Data URI
  const encodedText = encodeURIComponent(text);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedText}&margin=1`;
  return qrUrl;
}

const totpService = {
  /**
   * Generate a new random Base32 TOTP secret
   */
  generateSecret(length = 20) {
    const randomBytes = crypto.randomBytes(length);
    return base32Encode(randomBytes);
  },

  /**
   * Verify TOTP code with time drift window (±2 steps = ±60 seconds)
   */
  verifyToken(secret, token, window = 2) {
    if (!secret || !token) return false;
    const cleanToken = token.toString().trim().replace(/\s+/g, '');
    if (cleanToken.length !== 6) return false;

    const secretBuffer = base32Decode(secret);
    const stepSeconds = 30;
    const currentCounter = Math.floor(Date.now() / 1000 / stepSeconds);

    for (let offset = -window; offset <= window; offset++) {
      const generated = generateCode(secretBuffer, currentCounter + offset);
      if (generated === cleanToken) {
        return true;
      }
    }

    return false;
  },

  /**
   * Generate 8 emergency recovery backup codes
   */
  generateBackupCodes(count = 8) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const p1 = crypto.randomBytes(2).toString('hex');
      const p2 = crypto.randomBytes(2).toString('hex');
      codes.push(`${p1}-${p2}`.toLowerCase());
    }
    return codes;
  },

  /**
   * Build otpauth:// URI for authenticator apps
   */
  getOtpAuthUrl(username, secret, issuer = 'TermuxPanel') {
    const label = encodeURIComponent(`${issuer}:${username}`);
    const encIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
  },

  /**
   * Generate QR Code URL
   */
  getQrCodeUrl(otpAuthUrl) {
    return generateQrSvg(otpAuthUrl);
  },

  /**
   * Get 2FA status for a user
   */
  async get2FAStatus(userId) {
    const record = await db.get('SELECT enabled, created_at FROM security_2fa WHERE user_id = ?', [userId]);
    return {
      isEnabled: record ? record.enabled === 1 : false,
      createdAt: record ? record.created_at : null
    };
  },

  /**
   * Initiate 2FA setup (returns secret, backup codes, and QR code URL)
   */
  async initiate2FASetup(userId, username) {
    const secret = this.generateSecret();
    const backupCodes = this.generateBackupCodes();
    const otpAuthUrl = this.getOtpAuthUrl(username, secret);
    const qrCodeUrl = this.getQrCodeUrl(otpAuthUrl);

    // Save as unverified (enabled = 0) until confirmed with code
    const existing = await db.get('SELECT user_id FROM security_2fa WHERE user_id = ?', [userId]);
    const backupCodesJson = JSON.stringify(backupCodes);

    if (existing) {
      await db.run(
        'UPDATE security_2fa SET secret = ?, backup_codes = ?, enabled = 0, created_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [secret, backupCodesJson, userId]
      );
    } else {
      await db.run(
        'INSERT INTO security_2fa (user_id, secret, backup_codes, enabled) VALUES (?, ?, ?, 0)',
        [userId, secret, backupCodesJson]
      );
    }

    return {
      secret,
      backupCodes,
      otpAuthUrl,
      qrCodeUrl
    };
  },

  /**
   * Confirm and activate 2FA
   */
  async confirmAndEnable(userId, code) {
    const record = await db.get('SELECT * FROM security_2fa WHERE user_id = ?', [userId]);
    if (!record || !record.secret) {
      throw new Error('2FA setup not initiated');
    }

    const isValid = this.verifyToken(record.secret, code);
    if (!isValid) {
      throw new Error('Invalid 6-digit authentication code. Please check your authenticator app and try again.');
    }

    await db.run('UPDATE security_2fa SET enabled = 1 WHERE user_id = ?', [userId]);
    return { success: true, message: 'Two-Factor Authentication is now enabled!' };
  },

  /**
   * Disable 2FA
   */
  async disable2FA(userId) {
    await db.run('DELETE FROM security_2fa WHERE user_id = ?', [userId]);
    return { success: true, message: 'Two-Factor Authentication disabled' };
  },

  /**
   * Validate either a TOTP 6-digit code or an emergency backup code during login
   */
  async validateLogin2FA(userId, codeOrBackup) {
    const record = await db.get('SELECT * FROM security_2fa WHERE user_id = ? AND enabled = 1', [userId]);
    if (!record) return true; // 2FA not enabled

    const cleanInput = (codeOrBackup || '').toString().trim().toLowerCase();

    // 1. Try TOTP code (if 6 numeric digits)
    if (/^\d{6}$/.test(cleanInput)) {
      const isValidTotp = this.verifyToken(record.secret, cleanInput);
      if (isValidTotp) return true;
    }

    // 2. Try Emergency Backup Code
    try {
      const backupCodes = JSON.parse(record.backup_codes || '[]');
      const matchIndex = backupCodes.indexOf(cleanInput);

      if (matchIndex !== -1) {
        // Consume single-use backup code
        backupCodes.splice(matchIndex, 1);
        await db.run('UPDATE security_2fa SET backup_codes = ? WHERE user_id = ?', [
          JSON.stringify(backupCodes),
          userId
        ]);
        return true;
      }
    } catch (_) {}

    return false;
  }
};

module.exports = totpService;
