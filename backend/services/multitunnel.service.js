const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const http = require('http');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('../config/app.config');
const cloudflareService = require('./cloudflare.service');

// Binary detection helper
async function checkBinaryInstalled(binaryName) {
  if (process.platform === 'win32') {
    try {
      await execPromise(`where ${binaryName}`);
      return { installed: true, binary: binaryName };
    } catch (_) {
      return { installed: false, binary: binaryName };
    }
  }

  try {
    const { stdout } = await execPromise(`which ${binaryName} || true`);
    const trimmed = stdout.trim();
    if (trimmed && fs.existsSync(trimmed)) {
      return { installed: true, binary: trimmed };
    }

    const termuxPath = path.join(process.env.PREFIX || '/data/data/com.termux/files/usr', 'bin', binaryName);
    if (fs.existsSync(termuxPath)) {
      return { installed: true, binary: termuxPath };
    }

    const homeBinPath = path.join(process.env.HOME || '/data/data/com.termux/files/home', 'bin', binaryName);
    if (fs.existsSync(homeBinPath)) {
      return { installed: true, binary: homeBinPath };
    }

    return { installed: false, binary: binaryName };
  } catch (e) {
    return { installed: false, binary: binaryName };
  }
}

// Token storage helpers
function saveTokenFile(filePath, token) {
  const clean = (token || '').trim();
  if (!clean) throw new Error('Token cannot be empty');
  if (!fs.existsSync(config.CONFIG_DIR)) {
    fs.mkdirSync(config.CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(filePath, clean, { encoding: 'utf8', mode: 0o600 });
}

function getTokenFile(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      return content || null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function maskToken(token) {
  if (!token) return null;
  if (token.length > 8) {
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
  }
  return '****';
}

// Check if background process is running
async function isProcessRunning(processPattern) {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execPromise('tasklist');
      return stdout.toLowerCase().includes(processPattern.toLowerCase());
    } catch (_) {
      return false;
    }
  }

  try {
    const { stdout } = await execPromise(`pgrep -f "${processPattern}" || true`);
    return !!stdout.trim();
  } catch (e) {
    return false;
  }
}

// Fetch active Ngrok public URL via local Ngrok client API
function fetchNgrokPublicUrl() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', { timeout: 1500 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.tunnels && parsed.tunnels.length > 0) {
            const httpsTunnel = parsed.tunnels.find((t) => t.public_url.startsWith('https')) || parsed.tunnels[0];
            return resolve(httpsTunnel.public_url);
          }
        } catch (_) {}
        resolve(null);
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Extract LocalXpose public URL from log file
function extractLoclxPublicUrl() {
  if (!fs.existsSync(config.LOCLX_LOG_FILE)) return null;
  try {
    const content = fs.readFileSync(config.LOCLX_LOG_FILE, 'utf8');
    const match = content.match(/https:\/\/[a-zA-Z0-9.-]+\.loclx\.io/i);
    return match ? match[0] : null;
  } catch (_) {
    return null;
  }
}

let providersCache = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 4000;

/**
 * Multi-Tunnel Service API
 */
const multitunnelService = {
  /**
   * Get all tunnel providers and their live status
   */
  async getAllProvidersStatus(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && providersCache && now - lastCacheTime < CACHE_TTL_MS) {
      return providersCache;
    }

    // 1. Cloudflare
    const cfInstalled = await cloudflareService.checkCloudflaredInstalled();
    const cfConfig = cloudflareService.getTunnelConfig();
    const cfStatus = await cloudflareService.getTunnelStatus();

    // 2. Ngrok
    const ngrokInstalled = await checkBinaryInstalled('ngrok');
    const ngrokToken = getTokenFile(config.NGROK_TOKEN_FILE);
    const ngrokRunning = await isProcessRunning('ngrok http');
    let ngrokPublicUrl = null;
    if (ngrokRunning) {
      ngrokPublicUrl = await fetchNgrokPublicUrl();
    }

    // 3. LocalXpose
    const loclxInstalled = await checkBinaryInstalled('loclx');
    const loclxToken = getTokenFile(config.LOCLX_TOKEN_FILE);
    const loclxRunning = await isProcessRunning('loclx tunnel');
    let loclxPublicUrl = null;
    if (loclxRunning) {
      loclxPublicUrl = extractLoclxPublicUrl();
    }

    // 4. Tailscale
    const tailscaleInstalled = await checkBinaryInstalled('tailscale');
    const tailscaleRunning = await isProcessRunning('tailscale funnel');

    return {
      cloudflare: {
        name: 'Cloudflare Zero Trust',
        id: 'cloudflare',
        isInstalled: cfInstalled.installed,
        isConfigured: cfConfig.isConfigured,
        isRunning: cfStatus.isRunning,
        tokenMask: cfConfig.maskedToken,
        tunnelId: cfConfig.tunnelId,
        cnameTarget: cfConfig.cnameTarget,
        installCommand: 'pkg install -y cloudflared',
        type: 'Zero Trust (Production Grade)'
      },
      ngrok: {
        name: 'Ngrok Tunnel',
        id: 'ngrok',
        isInstalled: ngrokInstalled.installed,
        isConfigured: !!ngrokToken,
        isRunning: ngrokRunning,
        tokenMask: maskToken(ngrokToken),
        publicUrl: ngrokPublicUrl,
        installCommand: 'pkg install -y ngrok',
        type: 'Instant Fallback (Global Anycast)'
      },
      localxpose: {
        name: 'LocalXpose Tunnel',
        id: 'localxpose',
        isInstalled: loclxInstalled.installed,
        isConfigured: !!loclxToken,
        isRunning: loclxRunning,
        tokenMask: maskToken(loclxToken),
        publicUrl: loclxPublicUrl,
        installCommand: 'curl -s https://api.localxpose.io/install.sh | bash',
        type: 'Lightweight Fallback (Custom Subdomains)'
      },
      tailscale: {
        name: 'Tailscale Funnel',
        id: 'tailscale',
        isInstalled: tailscaleInstalled.installed,
        isConfigured: tailscaleInstalled.installed,
        isRunning: tailscaleRunning,
        publicUrl: null,
        installCommand: 'pkg install -y tailscale',
        type: 'Private Mesh & Funnel Routing'
      }
    };

    providersCache = result;
    lastCacheTime = Date.now();
    return result;
  },

  /**
   * Save authentication token for a provider
   */
  async saveProviderToken(provider, token) {
    if (provider === 'cloudflare') {
      return await cloudflareService.saveTunnelToken(token);
    }

    if (provider === 'ngrok') {
      saveTokenFile(config.NGROK_TOKEN_FILE, token);
      const isInst = await checkBinaryInstalled('ngrok');
      if (isInst.installed) {
        try {
          await execPromise(`ngrok config add-authtoken "${token.trim()}"`);
        } catch (_) {}
      }
      return { success: true, provider: 'ngrok', message: 'Ngrok AuthToken saved successfully' };
    }

    if (provider === 'localxpose') {
      saveTokenFile(config.LOCLX_TOKEN_FILE, token);
      const isInst = await checkBinaryInstalled('loclx');
      if (isInst.installed) {
        try {
          await execPromise(`loclx account auth --token "${token.trim()}"`);
        } catch (_) {}
      }
      return { success: true, provider: 'localxpose', message: 'LocalXpose Access Token saved successfully' };
    }

    throw new Error(`Unsupported provider "${provider}"`);
  },

  /**
   * Start tunnel for a provider on a specific target port
   */
  async startTunnel(provider, { targetPort = 9000, subdomain = null } = {}) {
    const port = parseInt(targetPort, 10) || config.PORT;

    if (!fs.existsSync(config.LOGS_DIR)) {
      fs.mkdirSync(config.LOGS_DIR, { recursive: true });
    }

    if (provider === 'cloudflare') {
      return await cloudflareService.startTunnel();
    }

    if (provider === 'ngrok') {
      const isInst = await checkBinaryInstalled('ngrok');
      if (!isInst.installed) {
        throw new Error('Ngrok binary not installed. Run "pkg install -y ngrok" in Termux.');
      }

      await this.stopTunnel('ngrok');
      const logFile = config.NGROK_LOG_FILE;
      const cmd = `ngrok http ${port} --log=stdout > "${logFile}" 2>&1 &`;
      exec(cmd);

      // Wait a moment and attempt to fetch public URL
      await new Promise((r) => setTimeout(r, 1200));
      const publicUrl = await fetchNgrokPublicUrl();

      return {
        success: true,
        provider: 'ngrok',
        port,
        publicUrl,
        message: publicUrl ? `Ngrok tunnel live at ${publicUrl}` : 'Ngrok tunnel process started'
      };
    }

    if (provider === 'localxpose') {
      const isInst = await checkBinaryInstalled('loclx');
      if (!isInst.installed) {
        throw new Error('LocalXpose binary not installed. Run curl installer in Termux.');
      }

      await this.stopTunnel('localxpose');
      const logFile = config.LOCLX_LOG_FILE;
      const subFlag = subdomain && subdomain.trim() ? `--subdomain "${subdomain.trim()}"` : '';
      const cmd = `loclx tunnel http --to 127.0.0.1:${port} ${subFlag} > "${logFile}" 2>&1 &`;
      exec(cmd);

      await new Promise((r) => setTimeout(r, 1200));
      const publicUrl = extractLoclxPublicUrl();

      return {
        success: true,
        provider: 'localxpose',
        port,
        publicUrl,
        message: publicUrl ? `LocalXpose tunnel live at ${publicUrl}` : 'LocalXpose tunnel process started'
      };
    }

    if (provider === 'tailscale') {
      const isInst = await checkBinaryInstalled('tailscale');
      if (!isInst.installed) {
        throw new Error('Tailscale binary not installed. Run "pkg install -y tailscale" in Termux.');
      }

      const logFile = config.TAILSCALE_LOG_FILE;
      const cmd = `tailscale funnel ${port} on > "${logFile}" 2>&1 &`;
      exec(cmd);

      return {
        success: true,
        provider: 'tailscale',
        port,
        message: `Tailscale funnel enabled on port ${port}`
      };
    }

    throw new Error(`Unsupported provider "${provider}"`);
  },

  /**
   * Stop tunnel for a provider
   */
  async stopTunnel(provider) {
    if (provider === 'cloudflare') {
      return await cloudflareService.stopTunnel();
    }

    if (provider === 'ngrok') {
      if (process.platform !== 'win32') {
        try {
          await execPromise('pkill -f "ngrok http" || true');
        } catch (_) {}
      }
      return { success: true, provider: 'ngrok', message: 'Ngrok tunnel stopped' };
    }

    if (provider === 'localxpose') {
      if (process.platform !== 'win32') {
        try {
          await execPromise('pkill -f "loclx tunnel" || true');
        } catch (_) {}
      }
      return { success: true, provider: 'localxpose', message: 'LocalXpose tunnel stopped' };
    }

    if (provider === 'tailscale') {
      if (process.platform !== 'win32') {
        try {
          await execPromise('tailscale funnel off || true');
        } catch (_) {}
      }
      return { success: true, provider: 'tailscale', message: 'Tailscale funnel disabled' };
    }

    throw new Error(`Unsupported provider "${provider}"`);
  },

  /**
   * Get runtime logs for a provider
   */
  async getProviderLogs(provider, limit = 100) {
    let logFile = config.CLOUDFLARE_LOG_FILE;
    if (provider === 'ngrok') logFile = config.NGROK_LOG_FILE;
    else if (provider === 'localxpose') logFile = config.LOCLX_LOG_FILE;
    else if (provider === 'tailscale') logFile = config.TAILSCALE_LOG_FILE;

    if (!fs.existsSync(logFile)) {
      return { provider, logs: `No runtime logs found for ${provider}. Tunnel has not been started yet.` };
    }

    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split('\n');
      const recent = lines.slice(-limit).join('\n');
      return { provider, logs: recent };
    } catch (err) {
      return { provider, logs: `Error reading logs: ${err.message}` };
    }
  }
};

module.exports = multitunnelService;
