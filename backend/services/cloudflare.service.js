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

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
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
 * Check if Cloudflare tunnel token is configured
 */
function getTunnelConfig() {
  const tokenExists = fs.existsSync(config.CLOUDFLARE_TOKEN_FILE);
  let maskedToken = null;

  if (tokenExists) {
    try {
      const content = fs.readFileSync(config.CLOUDFLARE_TOKEN_FILE, 'utf8').trim();
      if (content.length > 8) {
        maskedToken = `${content.substring(0, 4)}...${content.substring(content.length - 4)}`;
      } else {
        maskedToken = '****';
      }
    } catch (e) {
      maskedToken = 'configured (unreadable)';
    }
  }

  return {
    isConfigured: tokenExists,
    tokenPath: config.CLOUDFLARE_TOKEN_FILE,
    maskedToken
  };
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

  // 5. Configure Tunnel Ingress Rules (remotely managed configuration)
  const ingressRules = [];

  // Add all app routes
  for (const r of routes) {
    ingressRules.push({
      hostname: r.hostname,
      service: r.service
    });
  }

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

  for (const r of routes) {
    const hostname = r.hostname.trim();
    const existing = existingDns.find((d) => d.name === hostname);

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
 * Check if cloudflared service / process is running
 */
async function getTunnelStatus() {
  const binary = await checkCloudflaredInstalled();
  const tunnelConfig = getTunnelConfig();

  let isRunning = false;
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execPromise('tasklist /FI "IMAGENAME eq cloudflared.exe"');
      isRunning = stdout.includes('cloudflared.exe');
    } else {
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
    isRunning,
    logPath: config.CLOUDFLARE_LOG_FILE
  };
}

module.exports = {
  checkCloudflaredInstalled,
  getTunnelConfig,
  saveTunnelToken,
  setupTunnelViaApi,
  getTunnelStatus
};
