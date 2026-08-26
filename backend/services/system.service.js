const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const config = require('../config/app.config');

let previousCpuTimes = null;

/**
 * Calculate CPU usage percentage
 */
function getCpuUsage() {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return 0;

  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach((cpu) => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  if (!previousCpuTimes) {
    previousCpuTimes = { totalIdle, totalTick };
    return 5.0; // Initial baseline
  }

  const idleDelta = totalIdle - previousCpuTimes.totalIdle;
  const totalDelta = totalTick - previousCpuTimes.totalTick;

  previousCpuTimes = { totalIdle, totalTick };

  if (totalDelta === 0) return 0;
  const usage = 100 - Math.round((100 * idleDelta) / totalDelta);
  return Math.max(0, Math.min(100, usage));
}

/**
 * Get Memory Usage (RAM) in bytes & formatted
 */
function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const percentage = Math.round((usedMem / totalMem) * 100);

  return {
    total: totalMem,
    used: usedMem,
    free: freeMem,
    percentage,
    totalFormatted: formatBytes(totalMem),
    usedFormatted: formatBytes(usedMem),
    freeFormatted: formatBytes(freeMem)
  };
}

/**
 * Get Disk Storage info for ROOT_DIR
 */
async function getDiskUsage() {
  try {
    if (process.platform === 'win32') {
      // Windows mock/estimation for development
      return {
        total: 128 * 1024 * 1024 * 1024,
        used: 45 * 1024 * 1024 * 1024,
        free: 83 * 1024 * 1024 * 1024,
        percentage: 35,
        totalFormatted: '128 GB',
        usedFormatted: '45 GB',
        freeFormatted: '83 GB'
      };
    }

    // Unix / Android / Termux df command
    const { stdout } = await execPromise(`df -k "${config.ROOT_DIR}" | tail -1`);
    const parts = stdout.trim().split(/\s+/);
    if (parts.length >= 4) {
      const total = parseInt(parts[1], 10) * 1024;
      const used = parseInt(parts[2], 10) * 1024;
      const free = parseInt(parts[3], 10) * 1024;
      const percentage = Math.round((used / total) * 100) || 0;
      return {
        total,
        used,
        free,
        percentage,
        totalFormatted: formatBytes(total),
        usedFormatted: formatBytes(used),
        freeFormatted: formatBytes(free)
      };
    }
  } catch (err) {
    // Fallback
  }

  return {
    total: 64 * 1024 * 1024 * 1024,
    used: 20 * 1024 * 1024 * 1024,
    free: 44 * 1024 * 1024 * 1024,
    percentage: 31,
    totalFormatted: '64 GB',
    usedFormatted: '20 GB',
    freeFormatted: '44 GB'
  };
}

/**
 * Format uptime seconds to human readable string (e.g. 4d 17h 32m)
 */
function getFormattedUptime() {
  const uptimeSeconds = Math.floor(os.uptime());
  const days = Math.floor(uptimeSeconds / (3600 * 24));
  const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Format bytes into human readable string
 */
function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Get comprehensive system metrics
 */
async function getSystemMetrics() {
  const memory = getMemoryUsage();
  const disk = await getDiskUsage();
  const cpuPercent = getCpuUsage();

  return {
    cpu: {
      percentage: cpuPercent,
      cores: os.cpus().length,
      model: os.cpus()[0] ? os.cpus()[0].model : 'Unknown'
    },
    memory,
    disk,
    uptime: {
      seconds: Math.floor(os.uptime()),
      formatted: getFormattedUptime()
    },
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      isAndroidTermux: !!process.env.TERMUX_VERSION || fs.existsSync('/data/data/com.termux')
    },
    network: getNetworkAccessUrls()
  };
}

/**
 * Get local and Wi-Fi network access URLs
 */
function getNetworkAccessUrls() {
  const port = config.PORT || 9000;
  let wifiIp = null;

  try {
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          wifiIp = iface.address;
          break;
        }
      }
      if (wifiIp) break;
    }
  } catch (_) {}

  return {
    localUrl: `http://127.0.0.1:${port}`,
    wifiIp: wifiIp || null,
    networkUrl: wifiIp ? `http://${wifiIp}:${port}` : null
  };
}

module.exports = {
  getSystemMetrics,
  formatBytes
};
