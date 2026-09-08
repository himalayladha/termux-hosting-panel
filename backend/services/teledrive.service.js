const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const db = require('../database/db');
const config = require('../config/app.config');

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Make HTTPS request helper
 */
function makeHttpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, raw: data });
        } catch (_) {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timed out after 60s'));
    });

    if (postData) {
      if (Buffer.isBuffer(postData)) {
        req.write(postData);
      } else if (typeof postData === 'string') {
        req.write(postData);
      }
    }
    req.end();
  });
}

class TeleDriveService {
  /**
   * Get Telegram bot configuration from database settings
   */
  async getConfig() {
    const tokenRow = await db.get("SELECT value FROM settings WHERE key = 'telegram_bot_token'");
    const chatRow = await db.get("SELECT value FROM settings WHERE key = 'telegram_chat_id'");
    const channelRow = await db.get("SELECT value FROM settings WHERE key = 'telegram_channel_username'");
    const enabledRow = await db.get("SELECT value FROM settings WHERE key = 'telegram_enabled'");

    return {
      botToken: tokenRow ? tokenRow.value : '',
      chatId: chatRow ? chatRow.value : '',
      channelUsername: channelRow ? channelRow.value : '',
      enabled: enabledRow ? enabledRow.value === '1' || enabledRow.value === 'true' : false,
      isConfigured: !!(tokenRow && tokenRow.value && chatRow && chatRow.value)
    };
  }

  /**
   * Save Telegram bot configuration
   */
  async saveConfig({ botToken, chatId, channelUsername, enabled = true }) {
    if (botToken !== undefined) {
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_bot_token', ?)", [botToken.trim()]);
    }
    if (chatId !== undefined) {
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_chat_id', ?)", [chatId.trim()]);
    }
    if (channelUsername !== undefined) {
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_channel_username', ?)", [channelUsername.trim()]);
    }
    if (enabled !== undefined) {
      await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('telegram_enabled', ?)", [enabled ? '1' : '0']);
    }

    return await this.getConfig();
  }

  /**
   * Test Telegram connection and credentials
   */
  async testConnection(botToken = null, chatId = null) {
    const cfg = await this.getConfig();
    const token = botToken || cfg.botToken;
    const chat = chatId || cfg.chatId;

    if (!token || !token.trim()) {
      throw new Error('Telegram Bot Token is required');
    }

    // 1. Test getMe
    const meRes = await makeHttpsRequest({
      hostname: 'api.telegram.org',
      path: `/bot${token.trim()}/getMe`,
      method: 'GET'
    });

    if (!meRes.data || !meRes.data.ok) {
      throw new Error(`Invalid Bot Token: ${meRes.data ? meRes.data.description : 'Failed to reach Telegram API'}`);
    }

    const botUser = meRes.data.result;

    // 2. Test chat if provided
    let chatInfo = null;
    if (chat && chat.trim()) {
      const chatRes = await makeHttpsRequest({
        hostname: 'api.telegram.org',
        path: `/bot${token.trim()}/getChat?chat_id=${encodeURIComponent(chat.trim())}`,
        method: 'GET'
      });

      if (chatRes.data && chatRes.data.ok) {
        chatInfo = chatRes.data.result;
      }
    }

    return {
      success: true,
      bot: {
        id: botUser.id,
        username: botUser.username,
        name: botUser.first_name
      },
      chat: chatInfo ? {
        id: chatInfo.id,
        title: chatInfo.title || chatInfo.username || 'Private Chat',
        type: chatInfo.type
      } : null,
      message: `Connected successfully to Telegram Bot @${botUser.username}!`
    };
  }

  /**
   * Upload a file or buffer to Telegram Cloud Channel
   */
  async uploadFile({ fileBuffer, filePath, fileName, category = 'general', caption = '', mimeType = 'application/octet-stream' }) {
    const cfg = await this.getConfig();
    if (!cfg.isConfigured) {
      throw new Error('Telegram Bot Token and Chat ID are not configured in TeleDrive settings.');
    }

    let buffer = fileBuffer;
    let name = fileName;
    let size = 0;

    if (filePath) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Source file not found at: ${filePath}`);
      }
      buffer = fs.readFileSync(filePath);
      name = name || path.basename(filePath);
    }

    if (!buffer) {
      throw new Error('No file content provided for upload.');
    }

    size = buffer.length;
    name = name || `file-${Date.now()}.bin`;

    const boundary = '----TermuxPanelTeleDrive' + Date.now();
    const crlf = '\r\n';

    let header = `--${boundary}${crlf}`;
    header += `Content-Disposition: form-data; name="chat_id"${crlf}${crlf}`;
    header += `${cfg.chatId}${crlf}`;

    if (caption) {
      header += `--${boundary}${crlf}`;
      header += `Content-Disposition: form-data; name="caption"${crlf}${crlf}`;
      header += `${caption}${crlf}`;
    }

    header += `--${boundary}${crlf}`;
    header += `Content-Disposition: form-data; name="document"; filename="${name}"${crlf}`;
    header += `Content-Type: ${mimeType}${crlf}${crlf}`;

    const footer = `${crlf}--${boundary}--${crlf}`;

    const payload = Buffer.concat([
      Buffer.from(header, 'utf8'),
      buffer,
      Buffer.from(footer, 'utf8')
    ]);

    const res = await makeHttpsRequest({
      hostname: 'api.telegram.org',
      path: `/bot${cfg.botToken}/sendDocument`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      }
    }, payload);

    if (!res.data || !res.data.ok) {
      throw new Error(`Telegram Cloud Upload Failed: ${res.data ? res.data.description : 'Network Error'}`);
    }

    const doc = res.data.result.document || {};
    const messageId = res.data.result.message_id;
    const fileId = doc.file_id || '';

    // Record in local SQLite telegram_files table
    const insertRes = await db.run(
      `INSERT INTO telegram_files (file_name, file_size, mime_type, category, telegram_file_id, telegram_message_id, chat_id, caption)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        size,
        mimeType || doc.mime_type || 'application/octet-stream',
        category,
        fileId,
        messageId,
        String(cfg.chatId),
        caption || ''
      ]
    );

    return {
      id: insertRes.lastID,
      fileName: name,
      fileSize: size,
      fileSizeFormatted: formatBytes(size),
      category,
      telegramFileId: fileId,
      telegramMessageId: messageId,
      uploadedAt: new Date().toISOString()
    };
  }

  /**
   * List files stored in TeleDrive
   */
  async listFiles({ category = null, search = '', limit = 100, offset = 0 } = {}) {
    let sql = 'SELECT * FROM telegram_files WHERE 1=1';
    const params = [];

    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (search && search.trim()) {
      sql += ' AND (file_name LIKE ? OR caption LIKE ?)';
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    sql += ' ORDER BY uploaded_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const rows = await db.all(sql, params);

    const countSql = category && category !== 'all'
      ? 'SELECT COUNT(*) as total FROM telegram_files WHERE category = ?'
      : 'SELECT COUNT(*) as total FROM telegram_files';
    const countParams = category && category !== 'all' ? [category] : [];
    const countRow = await db.get(countSql, countParams);

    return {
      total: countRow ? countRow.total : 0,
      files: rows.map((r) => ({
        id: r.id,
        fileName: r.file_name,
        fileSize: r.file_size,
        fileSizeFormatted: formatBytes(r.file_size),
        mimeType: r.mime_type,
        category: r.category || 'general',
        telegramFileId: r.telegram_file_id,
        telegramMessageId: r.telegram_message_id,
        caption: r.caption,
        uploadedAt: r.uploaded_at
      }))
    };
  }

  /**
   * Get direct download stream/URL from Telegram API
   */
  async getDownloadUrl(fileId) {
    const cfg = await this.getConfig();
    if (!cfg.isConfigured) {
      throw new Error('Telegram Bot is not configured');
    }

    const res = await makeHttpsRequest({
      hostname: 'api.telegram.org',
      path: `/bot${cfg.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`,
      method: 'GET'
    });

    if (!res.data || !res.data.ok) {
      throw new Error(`Failed to resolve Telegram file path: ${res.data ? res.data.description : 'Unknown error'}`);
    }

    const filePath = res.data.result.file_path;
    return `https://api.telegram.org/file/bot${cfg.botToken}/${filePath}`;
  }

  /**
   * Download a Telegram file directly into a Buffer
   */
  async downloadFileBuffer(fileId) {
    const downloadUrl = await this.getDownloadUrl(fileId);

    return new Promise((resolve, reject) => {
      https.get(downloadUrl, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download from Telegram. Status: ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', (err) => reject(err));
      }).on('error', (err) => reject(err));
    });
  }

  /**
   * Delete a file from TeleDrive index and Telegram Channel
   */
  async deleteFile(fileIdOrDbId) {
    const row = await db.get(
      'SELECT * FROM telegram_files WHERE id = ? OR telegram_file_id = ?',
      [fileIdOrDbId, fileIdOrDbId]
    );

    if (!row) {
      throw new Error('File not found in TeleDrive index');
    }

    const cfg = await this.getConfig();
    if (cfg.isConfigured && row.telegram_message_id && row.chat_id) {
      try {
        await makeHttpsRequest({
          hostname: 'api.telegram.org',
          path: `/bot${cfg.botToken}/deleteMessage?chat_id=${encodeURIComponent(row.chat_id)}&message_id=${row.telegram_message_id}`,
          method: 'POST'
        });
      } catch (err) {
        console.warn('[TeleDrive] Could not delete message on Telegram (may be older than 48h):', err.message);
      }
    }

    await db.run('DELETE FROM telegram_files WHERE id = ?', [row.id]);
    return { success: true, deletedId: row.id, fileName: row.file_name };
  }

  /**
   * Get TeleDrive overall storage metrics
   */
  async getDriveStats() {
    const cfg = await this.getConfig();
    const rows = await db.all('SELECT category, COUNT(*) as count, SUM(file_size) as total_bytes FROM telegram_files GROUP BY category');
    const totalRow = await db.get('SELECT COUNT(*) as total_files, SUM(file_size) as total_bytes FROM telegram_files');

    const categories = {
      backup: { count: 0, bytes: 0, formatted: '0 B' },
      static_site: { count: 0, bytes: 0, formatted: '0 B' },
      media: { count: 0, bytes: 0, formatted: '0 B' },
      documents: { count: 0, bytes: 0, formatted: '0 B' },
      general: { count: 0, bytes: 0, formatted: '0 B' },
      // Aliases
      backups: { count: 0, bytes: 0, formatted: '0 B' },
      static_sites: { count: 0, bytes: 0, formatted: '0 B' }
    };

    rows.forEach((r) => {
      const cat = r.category || 'general';
      const formatted = formatBytes(r.total_bytes || 0);
      categories[cat] = {
        count: r.count,
        bytes: r.total_bytes || 0,
        formatted
      };
      if (cat === 'backup') categories.backups = categories[cat];
      if (cat === 'static_site') categories.static_sites = categories[cat];
    });

    const totalFiles = totalRow ? totalRow.total_files || 0 : 0;
    const totalBytes = totalRow ? totalRow.total_bytes || 0 : 0;

    return {
      isConfigured: cfg.isConfigured,
      connectedChannel: cfg.channelUsername || cfg.chatId || null,
      totalFiles,
      totalBytes,
      totalBytesFormatted: formatBytes(totalBytes),
      categories
    };
  }

  /**
   * 1-Click Export a website into a .zip bundle and upload to Telegram Cloud
   */
  async exportWebsiteToTelegram(websiteId) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!site) {
      throw new Error('Website not found');
    }

    const siteDir = site.root_path || path.join(config.WEBSITES_DIR, site.name);
    if (!fs.existsSync(siteDir)) {
      throw new Error(`Website directory does not exist at: ${siteDir}`);
    }

    const zip = new AdmZip();
    zip.addLocalFolder(siteDir);
    const zipBuffer = zip.toBuffer();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const exportFileName = `${site.name}-static-export-${timestamp}.zip`;
    const caption = `🌐 Static Export: ${site.name} (Port :${site.port || 'auto'})\n📦 Type: ${site.type}\n📅 Exported: ${new Date().toLocaleString()}`;

    const uploadRes = await this.uploadFile({
      fileBuffer: zipBuffer,
      fileName: exportFileName,
      category: 'static_site',
      caption,
      mimeType: 'application/zip'
    });

    return {
      success: true,
      siteName: site.name,
      fileName: exportFileName,
      fileSize: zipBuffer.length,
      fileSizeFormatted: formatBytes(zipBuffer.length),
      telegramFileId: uploadRes.telegramFileId,
      uploadedAt: uploadRes.uploadedAt
    };
  }

  /**
   * 1-Click Deploy a static website from a Telegram Cloud .zip archive
   */
  async deployWebsiteFromTelegram({ fileId, siteName, domain = null }) {
    if (!siteName || !siteName.trim()) {
      throw new Error('Target website name is required');
    }

    const cleanName = siteName.trim().toLowerCase().replace(/[^a-z0-9-_.]/g, '');
    const targetDir = path.join(config.WEBSITES_DIR, cleanName);

    // Download ZIP buffer from Telegram
    const zipBuffer = await this.downloadFileBuffer(fileId);
    const zip = new AdmZip(zipBuffer);

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Extract all entries safely
    zip.extractAllTo(targetDir, true);

    // Check if website already registered in database
    let site = await db.get('SELECT * FROM websites WHERE name = ?', [cleanName]);
    if (!site) {
      // Allocate next port
      const portsConfig = require('../config/ports.config');
      const allocatedPort = await portsConfig.allocatePort(cleanName);

      await db.run(
        `INSERT INTO websites (name, type, domain, root_path, entry_file, port, status)
         VALUES (?, ?, ?, ?, ?, ?, 'stopped')`,
        [cleanName, 'html', domain || null, targetDir, 'index.html', allocatedPort]
      );
      site = await db.get('SELECT * FROM websites WHERE name = ?', [cleanName]);
    }

    // Launch/restart process
    const processService = require('./process.service');
    await processService.startWebsite(site.id);
    const updatedSite = await db.get('SELECT * FROM websites WHERE id = ?', [site.id]);

    return {
      success: true,
      site: updatedSite,
      message: `Website "${cleanName}" deployed and running on port :${updatedSite.port}!`
    };
  }

  /**
   * Sync a .tar.gz backup archive to Telegram Cloud and auto-prune backups older than 7 days
   */
  async syncBackupToTelegram(backupFilename) {
    const backupPath = path.join(config.DATA_DIR, 'backups', backupFilename);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup archive file not found: ${backupFilename}`);
    }

    const stats = fs.statSync(backupPath);
    const caption = `Automated Backup Archive: ${backupFilename}\nSize: ${formatBytes(stats.size)}\nTimestamp: ${new Date().toLocaleString()}`;

    const uploadRes = await this.uploadFile({
      filePath: backupPath,
      fileName: backupFilename,
      category: 'backup',
      caption,
      mimeType: 'application/gzip'
    });

    // Run 7-day retention pruning
    const pruneResult = await this.pruneOldBackups(7);

    return {
      success: true,
      upload: uploadRes,
      prunedCount: pruneResult.prunedCount,
      message: `Backup ${backupFilename} synced to Telegram Cloud! (${pruneResult.prunedCount} old backups pruned)`
    };
  }

  /**
   * Prune backups older than retentionDays (Default: 7 days)
   */
  async pruneOldBackups(retentionDays = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffIso = cutoffDate.toISOString();

    // Find old backups in telegram_files
    const oldBackups = await db.all(
      `SELECT * FROM telegram_files WHERE category = 'backup' AND uploaded_at < ?`,
      [cutoffIso]
    );

    let prunedCount = 0;
    const cfg = await this.getConfig();

    for (const b of oldBackups) {
      if (cfg.isConfigured && b.telegram_message_id && b.chat_id) {
        try {
          await makeHttpsRequest({
            hostname: 'api.telegram.org',
            path: `/bot${cfg.botToken}/deleteMessage?chat_id=${encodeURIComponent(b.chat_id)}&message_id=${b.telegram_message_id}`,
            method: 'POST'
          });
        } catch (_) {}
      }

      // Delete from DB
      await db.run('DELETE FROM telegram_files WHERE id = ?', [b.id]);

      // Delete local file if present
      const localPath = path.join(config.DATA_DIR, 'backups', b.file_name);
      if (fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
        } catch (_) {}
      }

      prunedCount++;
    }

    return { success: true, prunedCount, cutoffDate: cutoffIso };
  }
}

module.exports = new TeleDriveService();
