const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database/db');

const SESSION_TTL_HOURS = 24 * 7; // 7 days

/**
 * Hash a plain text password
 */
async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

/**
 * Compare plain password against hash
 */
async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Check if any admin user exists in DB
 */
async function hasAdminUser() {
  const user = await db.get('SELECT id FROM users LIMIT 1');
  return !!user;
}

/**
 * Create initial admin user
 */
async function createAdminUser(username, password, email = '') {
  const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    throw new Error('User already exists');
  }

  const password_hash = await hashPassword(password);
  const result = await db.run(
    'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
    [username.trim(), email.trim(), password_hash]
  );
  return { id: result.lastID, username, email };
}

/**
 * Authenticate user credentials and create a session
 */
async function login(username, password) {
  const user = await db.get('SELECT * FROM users WHERE username = ?', [username.trim()]);
  if (!user) {
    return null;
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return null;
  }

  // Update last_login
  await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

  // Generate session token
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();

  await db.run(
    'INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
    [sessionId, user.id, token, expiresAt]
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
      last_login: user.last_login
    }
  };
}

/**
 * Validate session token
 */
async function validateSession(token) {
  if (!token) return null;

  const session = await db.get(
    `SELECT s.*, u.username, u.email, u.created_at as user_created_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')`,
    [token]
  );

  if (!session) return null;

  return {
    id: session.user_id,
    username: session.username,
    email: session.email,
    token: session.token,
    expires_at: session.expires_at
  };
}

/**
 * Logout / Destroy session
 */
async function logout(token) {
  if (!token) return;
  await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

/**
 * Change user password
 */
async function changePassword(userId, oldPassword, newPassword) {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    throw new Error('User not found');
  }

  const isValid = await verifyPassword(oldPassword, user.password_hash);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  const newHash = await hashPassword(newPassword);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
  // Invalidate all existing sessions for security
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
  return true;
}

module.exports = {
  hashPassword,
  verifyPassword,
  hasAdminUser,
  createAdminUser,
  login,
  validateSession,
  logout,
  changePassword
};
