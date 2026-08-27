const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('../config/app.config');

const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Helper to make Cloudflare REST API requests
 */
function cfApiRequest(endpoint, apiToken, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CF_API_BASE}${endpoint}`);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      timeout: 4000,
      headers: {
        Authorization: `Bearer ${apiToken.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TermuxPanel-Cloudflare-Client/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.success) {
            const errorMsg = (parsed.errors && parsed.errors.map((e) => e.message).join(', ')) || 'API request failed';
            return reject(new Error(errorMsg));
          }
          resolve(parsed.result);
        } catch (e) {
          reject(new Error(`Failed to parse Cloudflare API response: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Cloudflare API request timed out (4s)'));
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Save Cloudflare API Token to disk securely
 */
function saveApiToken(apiToken) {
  const clean = (apiToken || '').trim();
  if (!clean) return;
  if (!fs.existsSync(config.CONFIG_DIR)) {
    fs.mkdirSync(config.CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(config.CLOUDFLARE_API_TOKEN_FILE, clean, { encoding: 'utf8', mode: 0o600 });
}

/**
 * Get saved Cloudflare API Token
 */
function getSavedApiToken() {
  if (fs.existsSync(config.CLOUDFLARE_API_TOKEN_FILE)) {
    try {
      const token = fs.readFileSync(config.CLOUDFLARE_API_TOKEN_FILE, 'utf8').trim();
      return token || null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * Get Cloudflare API token status and masked version
 */
function getApiTokenConfig() {
  const token = getSavedApiToken();
  if (!token) {
    return { hasSavedApiToken: false, maskedApiToken: null };
  }
  let masked = '****';
  if (token.length > 8) {
    masked = `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
  }
  return { hasSavedApiToken: true, maskedApiToken: masked };
}

/**
 * Fetch all zones/domains linked to a Cloudflare API Token (or auto-fetch using saved token)
 */
async function listZones(apiToken = null) {
  const effectiveToken = (apiToken && apiToken.trim()) || getSavedApiToken();
  if (!effectiveToken) {
    throw new Error('Cloudflare API Token not found. Please provide or save your API Token.');
  }

  // If user provided a new valid token, save it for future automated calls
  if (apiToken && apiToken.trim()) {
    saveApiToken(apiToken);
  }

  const zones = await cfApiRequest('/zones', effectiveToken);
  return (zones || []).map((z) => ({
    id: z.id,
    name: z.name,
    status: z.status,
    nameServers: z.name_servers || [],
    accountName: (z.account && z.account.name) || 'Cloudflare Account'
  }));
}

/**
 * Check if cloudflared binary is installed
 */
async function checkCloudflaredInstalled() {
  try {
    const { stdout } = await execPromise('cloudflared --version');
    return {
      installed: true,
      version: stdout.trim()
    };
  } catch (err) {
    return {
      installed: false,
      version: null
    };
  }
}

/**
 * Check if Cloudflare tunnel token is configured and extract CNAME target
 */
function getTunnelConfig() {
  const tokenExists = fs.existsSync(config.CLOUDFLARE_TOKEN_FILE);
  let maskedToken = null;
  let tunnelId = null;
  let accountId = null;
  let cnameTarget = '<YOUR_TUNNEL_ID>.cfargotunnel.com';

  if (tokenExists) {
    try {
      const content = fs.readFileSync(config.CLOUDFLARE_TOKEN_FILE, 'utf8').trim();
      if (content.length > 8) {
        maskedToken = `${content.substring(0, 4)}...${content.substring(content.length - 4)}`;
      } else {
        maskedToken = '****';
      }

      // Try decoding base64 tunnel token to extract tunnelId & accountId
      try {
        const decoded = Buffer.from(content, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (parsed.t) {
          tunnelId = parsed.t;
          cnameTarget = `${tunnelId}.cfargotunnel.com`;
        }
        if (parsed.a) {
          accountId = parsed.a;
        }
      } catch (_) {}
    } catch (e) {
      maskedToken = 'configured (unreadable)';
    }
  }

  return {
    isConfigured: tokenExists,
    tokenPath: config.CLOUDFLARE_TOKEN_FILE,
    maskedToken,
    tunnelId,
    accountId,
    cnameTarget
  };
}

/**
 * Fetch remote Tunnel Ingress rules directly from Cloudflare API
 */
async function getRemoteTunnelIngress(apiToken = null) {
  const effectiveToken = (apiToken && apiToken.trim()) || getSavedApiToken();
  if (!effectiveToken) return [];

  const tunnelConf = getTunnelConfig();
  if (!tunnelConf.isConfigured || !tunnelConf.tunnelId) return [];

  try {
    let accountId = tunnelConf.accountId;
    if (!accountId) {
      const accounts = await cfApiRequest('/accounts', effectiveToken);
      if (accounts && accounts.length > 0) {
        accountId = accounts[0].id;
      }
    }

    if (!accountId) return [];

    const configRes = await cfApiRequest(`/accounts/${accountId}/cfd_tunnel/${tunnelConf.tunnelId}/configurations`, effectiveToken);
    if (configRes && configRes.config && Array.isArray(configRes.config.ingress)) {
      return configRes.config.ingress.filter((rule) => rule.hostname && rule.service && rule.service !== 'http_status:404');
    }
  } catch (err) {
    // Graceful fallback if Cloudflare token lacks specific permissions
  }
  return [];
}

/**
 * Save Cloudflare Tunnel Token securely (Semi-Automatic Method)
 */
async function saveTunnelToken(token) {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Token cannot be empty');
  }

  if (!fs.existsSync(config.CONFIG_DIR)) {
    fs.mkdirSync(config.CONFIG_DIR, { recursive: true });
  }

  fs.writeFileSync(config.CLOUDFLARE_TOKEN_FILE, cleanToken, { encoding: 'utf8', mode: 0o600 });

  if (process.platform !== 'win32') {
    try {
      await execPromise(`chmod 600 "${config.CLOUDFLARE_TOKEN_FILE}"`);
    } catch (e) {
      // ignore
    }
  }

  // If cloudflared binary is present, start/restart it
  try {
    const isInstalled = await checkCloudflaredInstalled();
    if (isInstalled.installed) {
      if (process.platform !== 'win32') {
        await execPromise('pkill -x cloudflared || true');
      }
      const logFile = config.CLOUDFLARE_LOG_FILE;
      const cmd = `cloudflared tunnel run --token "${cleanToken}" > "${logFile}" 2>&1 &`;
      exec(cmd);
    }
  } catch (e) {
    // ignore
  }

  return { success: true };
}

/**
 * Fully-Automatic Setup: Create Tunnel, DNS CNAMEs, and Ingress Routes using Cloudflare API
 */
async function setupTunnelViaApi({ apiToken, domain, tunnelName = 'termux-android-tunnel', routes = [] }) {
  if (!apiToken || !domain) {
    throw new Error('Cloudflare API Token and domain are required');
  }

  saveApiToken(apiToken);
  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // 1. Get Zone and Account directly from /zones
  let zoneId = null;
  let accountId = null;
  let accountName = 'Cloudflare Account';

  try {
    const zones = await cfApiRequest(`/zones?name=${encodeURIComponent(cleanDomain)}`, apiToken);
    if (zones && zones.length > 0) {
      zoneId = zones[0].id;
      if (zones[0].account && zones[0].account.id) {
        accountId = zones[0].account.id;
        accountName = zones[0].account.name || 'Cloudflare Account';
      }
    }
  } catch (err) {
    if (err.message.includes('Authentication') || err.message.includes('Invalid') || err.message.includes('Unauthorized')) {
      throw new Error(`Cloudflare API Token authentication failed: ${err.message}. Please verify your API token.`);
    }
  }

  // Fallback to /accounts if account was not returned with zone
  if (!accountId) {
    try {
      const accounts = await cfApiRequest('/accounts', apiToken);
      if (accounts && accounts.length > 0) {
        accountId = accounts[0].id;
        accountName = accounts[0].name || 'Cloudflare Account';
      }
    } catch (_) {}
  }

  if (!zoneId) {
    throw new Error(`Domain "${cleanDomain}" was not found in your Cloudflare account. Ensure your API Token has "Zone:Read" permission and domain is active.`);
  }

  if (!accountId) {
    throw new Error(`Could not determine Account ID for "${cleanDomain}". Ensure your Cloudflare API token has "Account.Cloudflare Tunnel:Edit" and "Account.Account Settings:Read" permissions.`);
  }

  // 3. Create or find existing tunnel
  let tunnel = null;
  const existingTunnels = await cfApiRequest(`/accounts/${accountId}/cfd_tunnel?name=${encodeURIComponent(tunnelName)}&is_deleted=false`, apiToken);

  if (existingTunnels && existingTunnels.length > 0) {
    tunnel = existingTunnels[0];
  } else {
    // Generate a random 32-byte secret encoded in base64
    const secret = Buffer.from(require('crypto').randomBytes(32)).toString('base64');
    tunnel = await cfApiRequest(`/accounts/${accountId}/cfd_tunnel`, apiToken, 'POST', {
      name: tunnelName,
      tunnel_secret: secret,
      config_src: 'cloudflare'
    });
  }

  const tunnelId = tunnel.id;

  // 4. Get Tunnel Token for running cloudflared
  const tunnelTokenResult = await cfApiRequest(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`, apiToken);
  const tunnelToken = typeof tunnelTokenResult === 'string' ? tunnelTokenResult : tunnelTokenResult.token;

  if (!tunnelToken) {
    throw new Error('Failed to retrieve Tunnel Token from Cloudflare API');
  }

  // 5. Gather and aggregate all application and panel ingress rules
  const db = require('../database/db');
  const allHostnamesMap = new Map();

  // Always ensure panel hostname is mapped
  const panelHostname = `panel.${cleanDomain}`;
  allHostnamesMap.set(panelHostname, {
    hostname: panelHostname,
    service: `http://localhost:${config.PORT || 9000}`
  });

  // Pull all connected domains from database
  try {
    const dbDomains = await db.all(`
      SELECT d.domain, d.website_id, w.port as website_port
      FROM domains d
      LEFT JOIN websites w ON d.website_id = w.id
    `);

    for (const d of dbDomains) {
      if (d.domain) {
        const port = d.website_port || config.PORT || 9000;
        allHostnamesMap.set(d.domain, {
          hostname: d.domain,
          service: `http://localhost:${port}`
        });
      }
    }
  } catch (_) {}

  // Fetch existing remote ingress from Cloudflare to preserve anything already configured
  try {
    const existingConfig = await cfApiRequest(
      `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
      apiToken
    );
    if (existingConfig && existingConfig.config && Array.isArray(existingConfig.config.ingress)) {
      for (const rule of existingConfig.config.ingress) {
        if (rule.hostname && rule.service && rule.service !== 'http_status:404') {
          if (!allHostnamesMap.has(rule.hostname)) {
            allHostnamesMap.set(rule.hostname, {
              hostname: rule.hostname,
              service: rule.service
            });
          }
        }
      }
    }
  } catch (_) {}

  // Add the newly requested routes
  for (const r of routes) {
    if (r.hostname && r.service) {
      allHostnamesMap.set(r.hostname, {
        hostname: r.hostname,
        service: r.service
      });
    }
  }

  // Construct ingress rules array
  const ingressRules = Array.from(allHostnamesMap.values());

  // Catch-all 404 rule required by Cloudflare
  ingressRules.push({
    service: 'http_status:404'
  });

  await cfApiRequest(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, apiToken, 'PUT', {
    config: {
      ingress: ingressRules
    }
  });

  // 6. Create DNS CNAME Records for each public hostname
  const dnsTarget = `${tunnelId}.cfargotunnel.com`;
  const existingDns = await cfApiRequest(`/zones/${zoneId}/dns_records`, apiToken);
  const createdRecords = [];

  for (const r of Array.from(allHostnamesMap.values())) {
    const hostname = r.hostname.trim();
    const existing = (existingDns || []).find((d) => d.name === hostname);

    if (existing) {
      if (existing.type === 'CNAME' && existing.content === dnsTarget) {
        createdRecords.push({ hostname, status: 'already_configured' });
      } else {
        // Update to point to tunnel
        await cfApiRequest(`/zones/${zoneId}/dns_records/${existing.id}`, apiToken, 'PUT', {
          type: 'CNAME',
          name: hostname,
          content: dnsTarget,
          proxied: true,
          ttl: 1
        });
        createdRecords.push({ hostname, status: 'updated' });
      }
    } else {
      // Create new CNAME
      await cfApiRequest(`/zones/${zoneId}/dns_records`, apiToken, 'POST', {
        type: 'CNAME',
        name: hostname,
        content: dnsTarget,
        proxied: true,
        ttl: 1
      });
      createdRecords.push({ hostname, status: 'created' });
    }
  }

  // 7. Save token and launch tunnel
  await saveTunnelToken(tunnelToken);

  return {
    success: true,
    account: { id: accountId, name: accountName },
    zone: { id: zoneId, name: cleanDomain },
    tunnel: { id: tunnelId, name: tunnelName },
    cnameTarget: dnsTarget,
    dnsRecords: createdRecords
  };
}

/**
 * One-Click Sync: Ensure ALL connected websites and panel hostname are active in Cloudflare Ingress & DNS
 */
async function syncAllCloudflareRoutes(apiToken = null, zoneDomain = null) {
  const effectiveToken = (apiToken && apiToken.trim()) || getSavedApiToken();
  if (!effectiveToken) {
    throw new Error('Cloudflare API Token not configured. Please save API Token first.');
  }

  // Find root domain from zones
  let domain = zoneDomain;
  if (!domain) {
    const zones = await listZones(effectiveToken);
    if (zones.length > 0) {
      domain = zones[0].name;
    }
  }

  if (!domain) {
    throw new Error('Could not detect active Cloudflare zone domain');
  }

  return await setupTunnelViaApi({
    apiToken: effectiveToken,
    domain,
    tunnelName: 'termux-android-tunnel',
    routes: []
  });
}

/**
 * Check if cloudflared service / process is running
 */
async function getTunnelStatus() {
  const binary = await checkCloudflaredInstalled();
  const tunnelConfig = getTunnelConfig();

  let isRunning = false;
  try {
    if (process.platform !== 'win32') {
      const { stdout } = await execPromise('pgrep -x cloudflared');
      isRunning = !!stdout.trim();
    }
  } catch (e) {
    isRunning = false;
  }

  return {
    binaryInstalled: binary.installed,
    binaryVersion: binary.version,
    isConfigured: tunnelConfig.isConfigured,
    maskedToken: tunnelConfig.maskedToken,
    tunnelId: tunnelConfig.tunnelId,
    cnameTarget: tunnelConfig.cnameTarget,
    isRunning,
    logPath: config.CLOUDFLARE_LOG_FILE
  };
}

/**
 * Stop cloudflared tunnel process
 */
async function stopTunnel() {
  if (process.platform !== 'win32') {
    try {
      await execPromise('pkill -9 -x cloudflared || true');
    } catch (e) {}
  }
  return { success: true, isRunning: false };
}

/**
 * Start cloudflared tunnel process
 */
async function startTunnel() {
  if (!fs.existsSync(config.CLOUDFLARE_TOKEN_FILE)) {
    throw new Error('No Cloudflare tunnel token configured. Please configure token first.');
  }

  const token = fs.readFileSync(config.CLOUDFLARE_TOKEN_FILE, 'utf8').trim();
  if (!token) {
    throw new Error('Configured tunnel token is empty');
  }

  await stopTunnel();

  const logFile = config.CLOUDFLARE_LOG_FILE;
  const cmd = `cloudflared tunnel run --token "${token}" > "${logFile}" 2>&1 &`;
  exec(cmd);

  return { success: true, isRunning: true };
}

/**
 * Restart cloudflared tunnel
 */
async function restartTunnel() {
  return await startTunnel();
}

/**
 * Disconnect & delete tunnel token
 */
async function deleteTunnelToken() {
  await stopTunnel();
  if (fs.existsSync(config.CLOUDFLARE_TOKEN_FILE)) {
    fs.unlinkSync(config.CLOUDFLARE_TOKEN_FILE);
  }
  return { success: true, isConfigured: false, isRunning: false };
}

/**
 * Get Cloudflare tunnel logs
 */
async function getTunnelLogs(limit = 100) {
  if (!fs.existsSync(config.CLOUDFLARE_LOG_FILE)) {
    return { logs: 'No tunnel logs generated yet.' };
  }

  try {
    const content = fs.readFileSync(config.CLOUDFLARE_LOG_FILE, 'utf8');
    const lines = content.split('\n');
    const recent = lines.slice(-limit).join('\n');
    return { logs: recent };
  } catch (err) {
    return { logs: `Error reading logs: ${err.message}` };
  }
}

/**
 * Purge Cloudflare CDN Edge Cache
 */
async function purgeZoneCache(zoneIdOrDomain, files = null) {
  const apiToken = getSavedApiToken();
  if (!apiToken) {
    throw new Error('Cloudflare API token not configured in Settings/Tunnel');
  }

  let zoneId = zoneIdOrDomain;
  // If domain string provided instead of zone ID, look up zone ID
  if (zoneId && zoneId.includes('.')) {
    const domainName = zoneIdOrDomain;
    const zones = await listZones();
    const matchedZone = zones.find(
      (z) => domainName === z.name || domainName.endsWith(`.${z.name}`)
    );
    if (!matchedZone) {
      throw new Error(`Cloudflare Zone not found for domain "${domainName}"`);
    }
    zoneId = matchedZone.id;
  }

  const payload = files && files.length > 0 ? { files } : { purge_everything: true };
  const res = await cfApiRequest(`/zones/${zoneId}/purge_cache`, apiToken, 'POST', payload);
  return { success: true, message: 'Cloudflare Edge Cache purged successfully!', result: res };
}

module.exports = {
  checkCloudflaredInstalled,
  getTunnelConfig,
  saveTunnelToken,
  saveApiToken,
  getSavedApiToken,
  getApiTokenConfig,
  setupTunnelViaApi,
  getRemoteTunnelIngress,
  getTunnelStatus,
  listZones,
  startTunnel,
  stopTunnel,
  restartTunnel,
  deleteTunnelToken,
  getTunnelLogs,
  syncAllCloudflareRoutes,
  purgeZoneCache
};
