const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const db = require('../database/db');
const notificationService = require('./notification.service');

// Alert cooldown tracking (prevents alert spam)
const alertCooldowns = {
  unplugged: 0,
  low_battery: 0,
  overheat: 0
};
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

let lastPluggedState = null;
let watchdogTimer = null;

const hardwareService = {
  /**
   * Query Android battery & thermal stats
   */
  async getBatteryStatus() {
    // 1. Try termux-battery-status if termux-api is available
    try {
      const { stdout } = await execPromise('termux-battery-status');
      const data = JSON.parse(stdout.trim());
      const temp = typeof data.temperature === 'number' ? parseFloat(data.temperature.toFixed(1)) : 32.5;

      let thermalState = 'normal';
      if (temp >= 42.0) thermalState = 'critical';
      else if (temp >= 38.0) thermalState = 'warm';

      return {
        isAvailable: true,
        source: 'termux-api',
        percentage: data.percentage || 100,
        temperature: temp,
        status: (data.status || 'CHARGING').toUpperCase(),
        plugged: (data.plugged || 'PLUGGED_AC').toUpperCase(),
        health: (data.health || 'GOOD').toUpperCase(),
        thermalState,
        current: data.current || null
      };
    } catch (_) {}

    // 2. Linux / Android sysfs fallback (/sys/class/thermal and /sys/class/power_supply)
    try {
      let temp = null;
      let capacity = null;
      let status = 'CHARGING';
      let plugged = 'PLUGGED_AC';

      const thermalPath = '/sys/class/thermal/thermal_zone0/temp';
      if (fs.existsSync(thermalPath)) {
        const rawTemp = parseInt(fs.readFileSync(thermalPath, 'utf8').trim(), 10);
        temp = rawTemp > 1000 ? parseFloat((rawTemp / 1000).toFixed(1)) : parseFloat(rawTemp.toFixed(1));
      }

      const capPath = '/sys/class/power_supply/battery/capacity';
      if (fs.existsSync(capPath)) {
        capacity = parseInt(fs.readFileSync(capPath, 'utf8').trim(), 10);
      }

      const statusPath = '/sys/class/power_supply/battery/status';
      if (fs.existsSync(statusPath)) {
        status = fs.readFileSync(statusPath, 'utf8').trim().toUpperCase();
      }

      if (temp !== null || capacity !== null) {
        const finalTemp = temp || 34.0;
        let thermalState = 'normal';
        if (finalTemp >= 42.0) thermalState = 'critical';
        else if (finalTemp >= 38.0) thermalState = 'warm';

        return {
          isAvailable: true,
          source: 'sysfs',
          percentage: capacity !== null ? capacity : 95,
          temperature: finalTemp,
          status: status || 'CHARGING',
          plugged: status === 'DISCHARGING' ? 'UNPLUGGED' : 'PLUGGED_AC',
          health: finalTemp >= 42 ? 'OVERHEAT' : 'GOOD',
          thermalState
        };
      }
    } catch (_) {}

    // 3. Simulated environment for development / non-Android environments
    return {
      isAvailable: true,
      source: 'simulated',
      percentage: 88,
      temperature: 33.5,
      status: 'CHARGING',
      plugged: 'PLUGGED_AC',
      health: 'GOOD',
      thermalState: 'normal'
    };
  },

  /**
   * Get CPU WakeLock status
   */
  async getWakeLockStatus() {
    const setting = await db.get('SELECT value FROM settings WHERE key = "wakelock_enabled"');
    const isEnabled = setting ? setting.value === '1' || setting.value === 'true' : true;
    return { isEnabled };
  },

  /**
   * Toggle CPU WakeLock (termux-wake-lock / termux-wake-unlock)
   */
  async setWakeLock(enable) {
    const valStr = enable ? '1' : '0';
    const existing = await db.get('SELECT key FROM settings WHERE key = "wakelock_enabled"');
    if (existing) {
      await db.run('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = "wakelock_enabled"', [valStr]);
    } else {
      await db.run('INSERT INTO settings (key, value) VALUES ("wakelock_enabled", ?)', [valStr]);
    }

    try {
      if (enable) {
        await execPromise('termux-wake-lock');
      } else {
        await execPromise('termux-wake-unlock');
      }
    } catch (_) {
      // In development or non-Termux environments, setting is saved in DB
    }

    return { isEnabled: !!enable };
  },

  /**
   * Check conditions and dispatch automated health alerts
   */
  async checkHealthAndAlert() {
    const battery = await this.getBatteryStatus();
    const settings = await notificationService.getSettings();
    const now = Date.now();

    // 1. Charger Unplugged Alert
    if (lastPluggedState !== null && lastPluggedState !== 'UNPLUGGED' && battery.plugged === 'UNPLUGGED') {
      if (now - alertCooldowns.unplugged > COOLDOWN_MS) {
        alertCooldowns.unplugged = now;
        await notificationService.broadcastAlert({
          title: 'Charger Disconnected',
          message: `⚠️ Phone was unplugged from charger.\nCurrent Battery: <b>${battery.percentage}%</b> (Discharging)`,
          level: 'warning',
          category: 'battery'
        });
      }
    }
    lastPluggedState = battery.plugged;

    // 2. Low Battery Alert (< threshold, e.g. 15%)
    const lowThreshold = settings.battery_threshold || 15;
    if (battery.percentage <= lowThreshold && battery.plugged === 'UNPLUGGED') {
      if (now - alertCooldowns.low_battery > COOLDOWN_MS) {
        alertCooldowns.low_battery = now;
        await notificationService.broadcastAlert({
          title: 'Low Battery Warning',
          message: `🪫 Battery is at <b>${battery.percentage}%</b> and discharging!\nPlease connect phone to power to prevent server downtime.`,
          level: 'danger',
          category: 'battery'
        });
      }
    }

    // 3. Overheating Thermal Alert (>= threshold, e.g. 42°C)
    const tempThreshold = settings.temp_threshold || 42;
    if (battery.temperature >= tempThreshold) {
      if (now - alertCooldowns.overheat > COOLDOWN_MS) {
        alertCooldowns.overheat = now;
        await notificationService.broadcastAlert({
          title: 'High Thermal Warning',
          message: `🔥 Battery temperature reached <b>${battery.temperature}°C</b> (Safe limit: ${tempThreshold}°C).\nConsider moving the phone to a cooler area or lowering CPU load.`,
          level: 'danger',
          category: 'thermal'
        });
      }
    }
  },

  /**
   * Start background hardware guard watchdog
   */
  startWatchdog(intervalSeconds = 60) {
    if (watchdogTimer) clearInterval(watchdogTimer);

    // Initial check
    setTimeout(() => this.checkHealthAndAlert(), 5000);

    watchdogTimer = setInterval(() => {
      this.checkHealthAndAlert().catch((err) => {
        console.error('[Hardware Watchdog Error]', err.message);
      });
    }, intervalSeconds * 1000);

    console.log(`[Hardware Watchdog] Guard active (Checking battery & thermals every ${intervalSeconds}s)`);
  }
};

module.exports = hardwareService;
