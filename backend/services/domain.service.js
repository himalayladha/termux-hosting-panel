const dns = require('dns');
const https = require('https');
const db = require('../database/db');
const config = require('../config/app.config');
const cloudflareService = require('./cloudflare.service');

/**
 * List all configured custom domains with target website info
 */
async function listDomains() {
  const query = `
    SELECT d.id, d.domain, d.website_id, d.ssl_enabled, d.cname_target, d.created_at,
           w.name as website_name, w.port as website_port, w.type as website_type, w.status as website_status
    FROM domains d
    LEFT JOIN websites w ON d.website_id = w.id
    ORDER BY d.created_at DESC
  `;

  const rows = await db.all(query);
  const tunnelStatus = await cloudflareService.getTunnelStatus();

  return rows.map((row) => {
    const isPanel = !row.website_id || row.website_id === 0;
    return {
      id: row.id,
      domain: row.domain,
      websiteId: isPanel ? null : row.website_id,
      targetName: isPanel ? 'TermuxPanel Control Plane' : (row.website_name || 'Unassigned'),
      targetPort: isPanel ? config.PORT : (row.website_port || null),
      targetType: isPanel ? 'panel' : (row.website_type || 'custom'),
      targetStatus: isPanel ? 'running' : (row.website_status || 'stopped'),
      sslEnabled: !!row.ssl_enabled,
      cnameTarget: row.cname_target || (tunnelStatus.isConfigured ? 'Cloudflare Tunnel Managed' : 'Tunnel Token Required'),
      tunnelRunning: tunnelStatus.isRunning,
      createdAt: row.created_at
    };
  });
}

/**
 * Connect a new domain to a website or the control panel
 */
async function connectDomain({ domain, websiteId, autoCloudflare = false, cfApiToken = null, cfZoneDomain = null }) {
  const cleanDomain = (domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!cleanDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanDomain)) {
    throw new Error('Please enter a valid domain name (e.g. mysite.com or app.example.com)');
  }

  // Check if domain is already registered
  const existing = await db.get('SELECT * FROM domains WHERE domain = ?', [cleanDomain]);
  if (existing) {
    throw new Error(`Domain "${cleanDomain}" is already connected`);
  }

  let targetPort = config.PORT;
  let targetName = 'TermuxPanel Control Plane';

  if (websiteId && parseInt(websiteId, 10) > 0) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [websiteId]);
    if (!site) {
      throw new Error('Selected website not found');
    }
    targetPort = site.port;
    targetName = site.name;
  }

  let cnameTarget = null;
  let cfResult = null;

  // If 1-Click Cloudflare Auto Setup is requested
  if (autoCloudflare && cfApiToken && cfZoneDomain) {
    const route = {
      hostname: cleanDomain,
      service: `http://localhost:${targetPort}`
    };

    cfResult = await cloudflareService.setupTunnelViaApi({
      apiToken: cfApiToken,
      domain: cfZoneDomain,
      tunnelName: 'termux-android-tunnel',
      routes: [route]
    });

    cnameTarget = cfResult.cnameTarget;
  }

  // Insert into database (use 0 for panel to satisfy NOT NULL constraints across existing DBs)
  const numericWebId = (websiteId && parseInt(websiteId, 10) > 0) ? parseInt(websiteId, 10) : 0;

  const insertRes = await db.run(
    'INSERT INTO domains (domain, website_id, ssl_enabled, cname_target) VALUES (?, ?, ?, ?)',
    [cleanDomain, numericWebId, 1, cnameTarget]
  );

  return {
    success: true,
    id: insertRes.lastID,
    domain: cleanDomain,
    targetName,
    targetPort,
    cnameTarget,
    cloudflareAuto: !!cfResult
  };
}

/**
 * Update domain target website
 */
async function updateDomainTarget(domainId, websiteId) {
  const domain = await db.get('SELECT * FROM domains WHERE id = ?', [domainId]);
  if (!domain) {
    throw new Error('Domain record not found');
  }

  let targetPort = config.PORT;
  const numericWebId = (websiteId && parseInt(websiteId, 10) > 0) ? parseInt(websiteId, 10) : 0;

  if (numericWebId > 0) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [numericWebId]);
    if (!site) throw new Error('Target website not found');
    targetPort = site.port;
  }

  await db.run('UPDATE domains SET website_id = ? WHERE id = ?', [numericWebId, domainId]);

  return { success: true, targetPort };
}

/**
 * Remove domain connection
 */
async function deleteDomain(domainId) {
  const domain = await db.get('SELECT * FROM domains WHERE id = ?', [domainId]);
  if (!domain) {
    throw new Error('Domain not found');
  }

  await db.run('DELETE FROM domains WHERE id = ?', [domainId]);
  return { success: true, domain: domain.domain };
}

/**
 * Verify live DNS propagation and reachability
 */
async function verifyDomainDns(domainName) {
  const cleanDomain = domainName.trim().toLowerCase();

  const result = {
    domain: cleanDomain,
    resolved: false,
    cnameRecords: [],
    ipAddresses: [],
    httpsReachable: false,
    message: ''
  };

  // 1. Check CNAME DNS
  try {
    const cnames = await dns.promises.resolveCname(cleanDomain);
    result.cnameRecords = cnames || [];
    result.resolved = true;
  } catch (e) {
    // Maybe it resolves directly to A/AAAA or proxied
  }

  // 2. Check A / IP records
  try {
    const ips = await dns.promises.resolve4(cleanDomain);
    result.ipAddresses = ips || [];
    result.resolved = true;
  } catch (e) {}

  // 3. Test HTTPS request
  try {
    const httpsOk = await new Promise((resolve) => {
      const req = https.get(`https://${cleanDomain}`, { timeout: 4000 }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
    result.httpsReachable = httpsOk;
  } catch (_) {
    result.httpsReachable = false;
  }

  if (result.httpsReachable) {
    result.message = 'Domain is LIVE with active Cloudflare HTTPS SSL!';
  } else if (result.resolved) {
    result.message = 'DNS is resolved, waiting for Cloudflare Tunnel connection.';
  } else {
    result.message = 'DNS not yet propagated. Check your CNAME records in Cloudflare.';
  }

  return result;
}

module.exports = {
  listDomains,
  connectDomain,
  updateDomainTarget,
  deleteDomain,
  verifyDomainDns
};
