const fs = require('fs');
const path = require('path');
const dns = require('dns');
const https = require('https');
const db = require('../database/db');
const config = require('../config/app.config');
const { findAvailablePort } = require('../config/ports.config');
const cloudflareService = require('./cloudflare.service');
const databaseService = require('./database.service');
const processService = require('./process.service');

// Helper to copy starter templates recursively
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

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
  const effectiveApiToken = (cfApiToken && cfApiToken.trim()) || cloudflareService.getSavedApiToken();

  // If 1-Click Cloudflare Auto Setup is requested
  if (autoCloudflare && effectiveApiToken && (cfZoneDomain || cleanDomain.split('.').slice(-2).join('.'))) {
    const rootZone = cfZoneDomain || cleanDomain.split('.').slice(-2).join('.');
    const route = {
      hostname: cleanDomain,
      service: `http://localhost:${targetPort}`
    };

    cfResult = await cloudflareService.setupTunnelViaApi({
      apiToken: effectiveApiToken,
      domain: rootZone,
      tunnelName: 'termux-android-tunnel',
      routes: [route]
    });

    cnameTarget = cfResult.cnameTarget;
  }

  if (!cnameTarget) {
    const tunnelConf = cloudflareService.getTunnelConfig();
    cnameTarget = tunnelConf.cnameTarget || '<YOUR_TUNNEL_ID>.cfargotunnel.com';
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
 * All-In-One Subdomain Provisioning Wizard
 * Automatically provisions:
 * 1. Dedicated Subdomain (e.g. blog.example.com)
 * 2. Dedicated Hosted Website / App (HTML, Node.js, Python, or PHP)
 * 3. Dedicated SQLite Database (with schema template presets)
 * 4. Automatic Cloudflare Tunnel Ingress & DNS CNAME mapping
 */
async function createSubdomain({
  subdomainPrefix,
  rootDomain,
  appType = 'html',
  createSite = true,
  createDatabase = false,
  dbTemplate = 'blank',
  autoCloudflare = false,
  cfApiToken = null
}) {
  const prefix = (subdomainPrefix || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const root = (rootDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!prefix) {
    throw new Error('Please specify a subdomain prefix (e.g. "blog", "api", "store")');
  }
  if (!root || !root.includes('.')) {
    throw new Error('Please specify a valid root domain (e.g. "example.com" or "mydomain.org")');
  }

  const fullDomain = `${prefix}.${root}`;

  // Check if domain already exists
  const existingDomain = await db.get('SELECT * FROM domains WHERE domain = ?', [fullDomain]);
  if (existingDomain) {
    throw new Error(`Subdomain "${fullDomain}" is already connected.`);
  }

  let siteId = null;
  let targetPort = config.PORT;
  let createdDbInfo = null;

  // 1. Create Dedicated Website if requested
  if (createSite) {
    let siteName = prefix;
    let nameCheck = await db.get('SELECT id FROM websites WHERE name = ?', [siteName]);
    if (nameCheck) {
      siteName = `${prefix}-${root.split('.')[0]}`;
      nameCheck = await db.get('SELECT id FROM websites WHERE name = ?', [siteName]);
      if (nameCheck) {
        siteName = `${siteName}-${Date.now().toString().slice(-4)}`;
      }
    }

    // Allocate Port
    const usedPortsRows = await db.all('SELECT port FROM websites WHERE port IS NOT NULL');
    const usedPorts = usedPortsRows.map((r) => r.port);
    targetPort = await findAvailablePort(usedPorts);

    // Setup Directory Root
    const siteRoot = path.join(config.STORAGE_DIR, siteName);
    if (!fs.existsSync(siteRoot)) {
      fs.mkdirSync(siteRoot, { recursive: true });
    }

    // Copy Starter Template
    const templatePath = path.join(config.TEMPLATES_DIR, appType);
    if (fs.existsSync(templatePath)) {
      copyDirRecursive(templatePath, siteRoot);
    }

    let defaultEntry = 'public/index.html';
    if (appType === 'node') defaultEntry = 'server.js';
    else if (appType === 'python') defaultEntry = 'app.py';
    else if (appType === 'php') defaultEntry = 'public/index.php';

    // 2. Create Dedicated SQLite Database if requested
    if (createDatabase) {
      const dbFilename = `${siteName}.db`;
      const fullDbPath = path.join(config.DATA_DIR, dbFilename);
      await databaseService.createDatabase(fullDbPath, dbTemplate || 'blank');
      createdDbInfo = {
        name: dbFilename,
        path: fullDbPath,
        template: dbTemplate || 'blank'
      };
    }

    // Insert Website record
    const siteInsert = await db.run(
      `INSERT INTO websites (name, type, domain, root_path, entry_file, port, status, autostart)
       VALUES (?, ?, ?, ?, ?, ?, 'stopped', 1)`,
      [siteName, appType, fullDomain, siteRoot, defaultEntry, targetPort]
    );

    siteId = siteInsert.lastID;

    // Start website process immediately
    try {
      await processService.startWebsite(siteId);
    } catch (startErr) {
      console.warn(`[Subdomains] Warning: Could not autostart ${siteName}:`, startErr.message);
    }
  }

  // 3. Connect domain record & Cloudflare DNS
  const domainRes = await connectDomain({
    domain: fullDomain,
    websiteId: siteId,
    autoCloudflare,
    cfApiToken,
    cfZoneDomain: root
  });

  return {
    success: true,
    domain: fullDomain,
    websiteId: siteId,
    targetPort,
    database: createdDbInfo,
    cnameTarget: domainRes.cnameTarget,
    cloudflareAuto: domainRes.cloudflareAuto
  };
}

/**
 * Update domain configuration & target mapping
 */
async function updateDomain(domainId, { domain, websiteId, sslEnabled, cnameTarget }) {
  const existing = await db.get('SELECT * FROM domains WHERE id = ?', [domainId]);
  if (!existing) {
    throw new Error('Domain record not found');
  }

  let cleanDomain = existing.domain;
  if (domain && domain.trim()) {
    cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!cleanDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleanDomain)) {
      throw new Error('Please enter a valid domain or subdomain name');
    }

    // Check conflict with other domains
    const conflict = await db.get('SELECT id FROM domains WHERE domain = ? AND id != ?', [cleanDomain, domainId]);
    if (conflict) {
      throw new Error(`Domain "${cleanDomain}" is already connected to another site.`);
    }
  }

  let targetPort = config.PORT;
  let targetName = 'TermuxPanel Control Plane';
  const numericWebId = (websiteId !== undefined && websiteId !== null && parseInt(websiteId, 10) > 0) ? parseInt(websiteId, 10) : 0;

  if (numericWebId > 0) {
    const site = await db.get('SELECT * FROM websites WHERE id = ?', [numericWebId]);
    if (!site) throw new Error('Target website not found');
    targetPort = site.port;
    targetName = site.name;
  }

  const isSsl = sslEnabled !== undefined ? (sslEnabled ? 1 : 0) : existing.ssl_enabled;
  const targetCname = cnameTarget !== undefined ? cnameTarget : existing.cname_target;

  await db.run(
    'UPDATE domains SET domain = ?, website_id = ?, ssl_enabled = ?, cname_target = ? WHERE id = ?',
    [cleanDomain, numericWebId, isSsl, targetCname, domainId]
  );

  // Auto-sync with Cloudflare API if token is saved
  const savedApiToken = cloudflareService.getSavedApiToken();
  if (savedApiToken && cleanDomain && cleanDomain.includes('.')) {
    try {
      const rootZone = cleanDomain.split('.').slice(-2).join('.');
      await cloudflareService.setupTunnelViaApi({
        apiToken: savedApiToken,
        domain: rootZone,
        routes: [
          {
            hostname: cleanDomain,
            service: `http://localhost:${targetPort}`
          }
        ]
      });
    } catch (cfErr) {
      console.warn('[Domains] Cloudflare API auto-sync note:', cfErr.message);
    }
  }

  return {
    success: true,
    id: domainId,
    domain: cleanDomain,
    targetName,
    targetPort,
    sslEnabled: !!isSsl,
    cnameTarget: targetCname
  };
}

/**
 * Update domain target website
 */
async function updateDomainTarget(domainId, websiteId) {
  return await updateDomain(domainId, { websiteId });
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
  createSubdomain,
  updateDomain,
  updateDomainTarget,
  deleteDomain,
  verifyDomainDns
};
