const crypto = require('crypto');
const db = require('../database/db');

// In-memory sliding window for real-time Requests Per Second (RPS) calculation
const recentHits = [];

function hashIp(ip) {
  if (!ip) return 'anon';
  return crypto.createHash('sha256').update(ip.trim()).digest('hex').substring(0, 12);
}

const analyticsService = {
  /**
   * Record a web traffic hit event
   */
  async recordHit({ websiteId, path = '/', statusCode = 200, responseTimeMs = 0, bytesSent = 0, userAgent = '', ip = '' }) {
    if (!websiteId) return;

    const now = Date.now();
    recentHits.push(now);

    // Prune hits older than 60 seconds from memory
    const sixtySecAgo = now - 60000;
    while (recentHits.length > 0 && recentHits[0] < sixtySecAgo) {
      recentHits.shift();
    }

    const cleanPath = (path || '/').split('?')[0].substring(0, 255);
    const ipHash = hashIp(ip);
    const cleanUa = (userAgent || '').substring(0, 200);

    try {
      await db.run(
        `INSERT INTO website_metrics (website_id, path, status_code, response_time_ms, bytes_sent, user_agent, ip_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [websiteId, cleanPath, statusCode || 200, responseTimeMs || 0, bytesSent || 0, cleanUa, ipHash]
      );
    } catch (err) {
      console.warn('[Analytics] Failed to record hit:', err.message);
    }
  },

  /**
   * Get Live Traffic RPS (Requests per second over last 60 seconds)
   */
  getLiveRps() {
    const now = Date.now();
    const sixtySecAgo = now - 60000;
    while (recentHits.length > 0 && recentHits[0] < sixtySecAgo) {
      recentHits.shift();
    }

    const rps = (recentHits.length / 60).toFixed(2);
    return {
      rps: parseFloat(rps),
      hitsLastMinute: recentHits.length,
      activeVisitorsEstimate: Math.max(1, Math.min(recentHits.length, Math.ceil(recentHits.length / 3)))
    };
  },

  /**
   * Get analytics overview summary
   */
  async getSummary(websiteId = null, range = '24h') {
    let intervalModifier = "-1 day";
    if (range === '1h') intervalModifier = "-1 hour";
    else if (range === '7d') intervalModifier = "-7 days";
    else if (range === '30d') intervalModifier = "-30 days";

    let whereClause = `WHERE datetime(created_at) >= datetime('now', '${intervalModifier}')`;
    const params = [];

    if (websiteId) {
      whereClause += ` AND website_id = ?`;
      params.push(websiteId);
    }

    // 1. Overall stats
    const stats = await db.get(
      `SELECT
         COUNT(*) as total_requests,
         COUNT(DISTINCT ip_hash) as unique_visitors,
         COALESCE(SUM(bytes_sent), 0) as total_bytes,
         COALESCE(AVG(response_time_ms), 0) as avg_latency_ms
       FROM website_metrics
       ${whereClause}`,
      params
    );

    // 2. Status code breakdown
    const statusRows = await db.all(
      `SELECT
         status_code,
         COUNT(*) as count
       FROM website_metrics
       ${whereClause}
       GROUP BY status_code
       ORDER BY count DESC`,
      params
    );

    let status2xx = 0;
    let status3xx = 0;
    let status4xx = 0;
    let status5xx = 0;

    for (const row of statusRows) {
      const code = row.status_code;
      if (code >= 200 && code < 300) status2xx += row.count;
      else if (code >= 300 && code < 400) status3xx += row.count;
      else if (code >= 400 && code < 500) status4xx += row.count;
      else if (code >= 500) status5xx += row.count;
    }

    const live = this.getLiveRps();

    return {
      range,
      totalRequests: stats ? stats.total_requests : 0,
      uniqueVisitors: stats ? stats.unique_visitors : 0,
      totalBytes: stats ? stats.total_bytes : 0,
      totalBytesFormatted: this.formatBytes(stats ? stats.total_bytes : 0),
      avgLatencyMs: stats ? Math.round(stats.avg_latency_ms) : 0,
      liveRps: live.rps,
      hitsLastMinute: live.hitsLastMinute,
      statusBreakdown: {
        status2xx,
        status3xx,
        status4xx,
        status5xx,
        codes: statusRows
      }
    };
  },

  /**
   * Get top visited paths
   */
  async getTopPaths(websiteId = null, limit = 10, range = '24h') {
    let intervalModifier = "-1 day";
    if (range === '7d') intervalModifier = "-7 days";
    else if (range === '30d') intervalModifier = "-30 days";

    let whereClause = `WHERE datetime(created_at) >= datetime('now', '${intervalModifier}')`;
    const params = [];

    if (websiteId) {
      whereClause += ` AND website_id = ?`;
      params.push(websiteId);
    }

    const rows = await db.all(
      `SELECT
         path,
         COUNT(*) as hits,
         COUNT(DISTINCT ip_hash) as unique_visitors,
         COALESCE(SUM(bytes_sent), 0) as bytes_sent
       FROM website_metrics
       ${whereClause}
       GROUP BY path
       ORDER BY hits DESC
       LIMIT ?`,
      [...params, limit]
    );

    return rows.map((r) => ({
      path: r.path,
      hits: r.hits,
      uniqueVisitors: r.unique_visitors,
      bytesSent: r.bytes_sent,
      bytesFormatted: this.formatBytes(r.bytes_sent)
    }));
  },

  /**
   * Get hourly traffic trends (last 24 hours)
   */
  async getHourlyTrend(websiteId = null, hours = 24) {
    let whereClause = `WHERE datetime(created_at) >= datetime('now', '-${hours} hours')`;
    const params = [];

    if (websiteId) {
      whereClause += ` AND website_id = ?`;
      params.push(websiteId);
    }

    const rows = await db.all(
      `SELECT
         strftime('%Y-%m-%d %H:00', created_at) as hour,
         COUNT(*) as requests,
         COUNT(DISTINCT ip_hash) as visitors,
         COALESCE(SUM(bytes_sent), 0) as bytes
       FROM website_metrics
       ${whereClause}
       GROUP BY strftime('%Y-%m-%d %H:00', created_at)
       ORDER BY hour ASC`,
      params
    );

    return rows;
  },

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
};

module.exports = analyticsService;
