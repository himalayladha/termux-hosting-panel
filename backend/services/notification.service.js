const https = require('https');
const http = require('http');
const db = require('../database/db');

/**
 * Helper to make outbound HTTP/HTTPS JSON requests with timeout
 */
function sendHttpRequest(urlStr, data, method = 'POST') {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const bodyStr = typeof data === 'string' ? data : JSON.stringify(data);
      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        timeout: 6000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'TermuxPanel-Notification-Bot/1.0',
          'Content-Length': Buffer.byteLength(bodyStr)
        }
      };

      const req = client.request(options, (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, statusCode: res.statusCode, data: resData });
          } else {
            reject(new Error(`HTTP error ${res.statusCode}: ${resData.substring(0, 120)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Notification request timed out (6s)'));
      });

      req.on('error', (err) => reject(err));

      req.write(bodyStr);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

const notificationService = {
  /**
   * Fetch notification settings from database
   */
  async getSettings() {
    const rows = await db.all('SELECT key, value FROM settings WHERE key LIKE "notify_%"');
    const settings = {
      telegram_enabled: false,
      telegram_bot_token: '',
      telegram_chat_id: '',
      discord_enabled: false,
      discord_webhook_url: '',
      alert_battery: true,
      alert_thermal: true,
      alert_tunnel: true,
      alert_crashes: true,
      temp_threshold: 42,
      battery_threshold: 15
    };

    rows.forEach((r) => {
      const k = r.key.replace('notify_', '');
      if (k === 'telegram_enabled' || k === 'discord_enabled' || k.startsWith('alert_')) {
        settings[k] = r.value === '1' || r.value === 'true';
      } else if (k === 'temp_threshold' || k === 'battery_threshold') {
        settings[k] = parseInt(r.value, 10) || settings[k];
      } else {
        settings[k] = r.value;
      }
    });

    return settings;
  },

  /**
   * Save notification settings to database
   */
  async saveSettings(settings) {
    for (const [k, v] of Object.entries(settings)) {
      const dbKey = `notify_${k}`;
      const valStr = typeof v === 'boolean' ? (v ? '1' : '0') : String(v || '');
      const existing = await db.get('SELECT key FROM settings WHERE key = ?', [dbKey]);
      if (existing) {
        await db.run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [valStr, dbKey]);
      } else {
        await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [dbKey, valStr]);
      }
    }
    return await this.getSettings();
  },

  /**
   * Send a Telegram alert message
   */
  async sendTelegram(botToken, chatId, { title, message, level = 'info' }) {
    if (!botToken || !chatId) {
      throw new Error('Telegram Bot Token and Chat ID are required');
    }

    const icon = level === 'danger' || level === 'error' ? '🚨' : level === 'warning' ? '⚠️' : '📱';
    const text = `<b>${icon} TermuxPanel: ${title}</b>\n\n${message}\n\n<i>Time: ${new Date().toLocaleString()}</i>`;

    const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`;
    return await sendHttpRequest(url, {
      chat_id: chatId.trim(),
      text,
      parse_mode: 'HTML'
    });
  },

  /**
   * Send a Discord webhook alert message
   */
  async sendDiscord(webhookUrl, { title, message, level = 'info' }) {
    if (!webhookUrl) {
      throw new Error('Discord Webhook URL is required');
    }

    const color = level === 'danger' || level === 'error' ? 15548997 : level === 'warning' ? 16753920 : 3711992; // Red, Orange, Blue

    const payload = {
      username: 'TermuxPanel Bot',
      avatar_url: 'https://cdn-icons-png.flaticon.com/512/919/919825.png',
      embeds: [
        {
          title: `📱 TermuxPanel Alert: ${title}`,
          description: message,
          color,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Android Termux Hosting Engine'
          }
        }
      ]
    };

    return await sendHttpRequest(webhookUrl.trim(), payload);
  },

  /**
   * Broadcast an alert across all enabled channels
   */
  async broadcastAlert({ title, message, level = 'info', category = 'general' }) {
    const settings = await this.getSettings();
    const results = { telegram: null, discord: null };

    // Check category filter
    if (category === 'thermal' && !settings.alert_thermal) return results;
    if (category === 'battery' && !settings.alert_battery) return results;
    if (category === 'tunnel' && !settings.alert_tunnel) return results;
    if (category === 'crash' && !settings.alert_crashes) return results;

    // 1. Telegram
    if (settings.telegram_enabled && settings.telegram_bot_token && settings.telegram_chat_id) {
      try {
        await this.sendTelegram(settings.telegram_bot_token, settings.telegram_chat_id, { title, message, level });
        results.telegram = true;
      } catch (err) {
        console.error('[Notification] Telegram send failed:', err.message);
        results.telegram = false;
      }
    }

    // 2. Discord
    if (settings.discord_enabled && settings.discord_webhook_url) {
      try {
        await this.sendDiscord(settings.discord_webhook_url, { title, message, level });
        results.discord = true;
      } catch (err) {
        console.error('[Notification] Discord send failed:', err.message);
        results.discord = false;
      }
    }

    return results;
  }
};

module.exports = notificationService;
