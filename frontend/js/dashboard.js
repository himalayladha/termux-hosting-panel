const dashboard = {
  timer: null,
  wakelockEnabled: true,

  init() {
    this.loadSummary();
    this.loadHardware();
    this.startPolling();
  },

  startPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (document.getElementById('view-dashboard').classList.contains('active')) {
        this.loadMetrics();
        this.loadHardware();
      }
    }, 4000);
  },

  async loadSummary() {
    try {
      const data = await API.get('/api/dashboard/summary');
      this.renderMetrics(data.metrics);
      this.renderRunningApps(data.recentWebsites);
    } catch (err) {
      console.error('Failed to load dashboard summary:', err);
    }
  },

  async loadMetrics() {
    try {
      const metrics = await API.get('/api/dashboard/metrics');
      this.renderMetrics(metrics);
    } catch (err) {
      console.error('Failed to refresh metrics:', err);
    }
  },

  async loadHardware() {
    try {
      const res = await API.get('/api/hardware/status');
      this.renderHardware(res.battery, res.wakelock);
    } catch (_) {}
  },

  renderHardware(b, w) {
    if (!b) return;

    // Battery Percent & Bar
    const batPercent = document.getElementById('metric-battery-percent');
    const batBar = document.getElementById('bar-battery');
    const batStatus = document.getElementById('metric-battery-status');
    const batHealth = document.getElementById('metric-battery-health');
    const batTemp = document.getElementById('metric-battery-temp');
    const batPlugged = document.getElementById('metric-battery-plugged');

    if (batPercent) batPercent.textContent = `${b.percentage}%`;
    if (batBar) {
      batBar.style.width = `${b.percentage}%`;
      batBar.style.background = b.percentage <= 20 ? '#ef4444' : b.percentage <= 50 ? '#f59e0b' : '#22c55e';
    }

    if (batStatus) {
      batStatus.textContent = b.status;
      batStatus.className = b.status === 'CHARGING' ? 'badge badge-success' : 'badge badge-secondary';
    }

    if (batPlugged) {
      const plugText = b.plugged.replace('PLUGGED_', '');
      batPlugged.textContent = b.plugged === 'UNPLUGGED' ? 'Unplugged' : `Plugged (${plugText})`;
      batPlugged.style.color = b.plugged === 'UNPLUGGED' ? '#f59e0b' : '#4ade80';
    }

    if (batHealth) {
      batHealth.textContent = b.health;
    }

    if (batTemp) {
      batTemp.textContent = `${b.temperature}°C`;
      if (b.temperature >= 42.0) {
        batTemp.style.color = '#ef4444';
        batTemp.innerHTML = `${b.temperature}°C <span class="badge badge-danger" style="font-size: 10px; margin-left: 4px;">HOT</span>`;
      } else if (b.temperature >= 38.0) {
        batTemp.style.color = '#f59e0b';
        batTemp.innerHTML = `${b.temperature}°C <span class="badge badge-warning" style="font-size: 10px; margin-left: 4px;">WARM</span>`;
      } else {
        batTemp.style.color = '#22c55e';
        batTemp.innerHTML = `${b.temperature}°C <span class="badge badge-success" style="font-size: 10px; margin-left: 4px;">NORMAL</span>`;
      }
    }

    // WakeLock Button
    if (w) {
      this.wakelockEnabled = w.isEnabled;
      const wlBtn = document.getElementById('btn-toggle-wakelock');
      const wlBadge = document.getElementById('badge-wakelock-status');

      if (wlBadge) {
        wlBadge.textContent = w.isEnabled ? 'ACTIVE (CPU AWAKE)' : 'DISABLED';
        wlBadge.className = w.isEnabled ? 'badge badge-success' : 'badge badge-secondary';
      }

      if (wlBtn) {
        if (w.isEnabled) {
          wlBtn.className = 'btn btn-secondary btn-sm';
          wlBtn.innerHTML = `<i data-lucide="moon" style="width: 13px; height: 13px; margin-right: 4px;"></i> Release WakeLock`;
        } else {
          wlBtn.className = 'btn btn-primary btn-sm';
          wlBtn.innerHTML = `<i data-lucide="sun" style="width: 13px; height: 13px; margin-right: 4px;"></i> Keep CPU Awake`;
        }
      }
    }

    if (window.lucide) lucide.createIcons();
  },

  async toggleWakeLock() {
    try {
      const newState = !this.wakelockEnabled;
      const res = await API.post('/api/hardware/wakelock', { enable: newState });
      API.toast(res.message, 'info');
      this.loadHardware();
    } catch (_) {}
  },

  renderMetrics(m) {
    if (!m) return;

    // CPU
    const cpuEl = document.getElementById('metric-cpu');
    const cpuBar = document.getElementById('bar-cpu');
    const cpuCores = document.getElementById('metric-cpu-cores');
    if (cpuEl) cpuEl.textContent = `${m.cpu.percentage}%`;
    if (cpuBar) cpuBar.style.width = `${m.cpu.percentage}%`;
    if (cpuCores) cpuCores.textContent = `${m.cpu.cores} CPU Cores (${m.cpu.model.substring(0, 20)}...)`;

    // RAM
    const ramEl = document.getElementById('metric-ram');
    const ramBar = document.getElementById('bar-ram');
    const ramPercent = document.getElementById('metric-ram-percent');
    if (ramEl) ramEl.textContent = `${m.memory.usedFormatted} / ${m.memory.totalFormatted}`;
    if (ramBar) ramBar.style.width = `${m.memory.percentage}%`;
    if (ramPercent) ramPercent.textContent = `${m.memory.percentage}% Used (${m.memory.freeFormatted} free)`;

    // Storage
    const diskEl = document.getElementById('metric-disk');
    const diskBar = document.getElementById('bar-disk');
    const diskPercent = document.getElementById('metric-disk-percent');
    if (diskEl) diskEl.textContent = `${m.disk.usedFormatted} / ${m.disk.totalFormatted}`;
    if (diskBar) diskBar.style.width = `${m.disk.percentage}%`;
    if (diskPercent) diskPercent.textContent = `${m.disk.percentage}% Used (${m.disk.freeFormatted} free)`;

    // Uptime & Network
    const uptimeEl = document.getElementById('metric-uptime');
    const envEl = document.getElementById('metric-env');
    const localUrlEl = document.getElementById('dash-local-url');
    const wifiUrlEl = document.getElementById('dash-wifi-url');

    if (uptimeEl) uptimeEl.textContent = m.uptime.formatted;
    if (envEl) {
      envEl.textContent = m.os.isAndroidTermux ? 'Android Termux Online' : `${m.os.platform} (${m.os.arch})`;
    }

    if (m.network) {
      if (localUrlEl && m.network.localUrl) {
        localUrlEl.textContent = m.network.localUrl;
      }
      if (wifiUrlEl) {
        if (m.network.networkUrl) {
          wifiUrlEl.textContent = m.network.networkUrl;
        } else {
          wifiUrlEl.textContent = 'Wi-Fi not connected';
        }
      }
    }
  },

  renderRunningApps(sites) {
    const listEl = document.getElementById('dashboard-apps-list');
    if (!listEl) return;

    if (!sites || sites.length === 0) {
      listEl.innerHTML = '<p class="text-muted">No websites or applications created yet. Click "+ Create Website" above.</p>';
      return;
    }

    const currentHost = window.location.hostname || '127.0.0.1';
    const isWifiClient = currentHost !== '127.0.0.1' && currentHost !== 'localhost';

    listEl.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Application</th>
              <th>Type</th>
              <th>Direct Access Links</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${sites
              .map((s) => {
                const isRunning = s.status === 'running';
                const openUrl = isWifiClient ? `http://${currentHost}:${s.port}` : `http://127.0.0.1:${s.port}`;
                return `
              <tr>
                <td><strong>${s.name}</strong></td>
                <td><span class="badge badge-primary">${s.type.toUpperCase()}</span></td>
                <td>
                  <div style="font-size: 12px; display: flex; flex-direction: column; gap: 4px;">
                    <span style="display: inline-flex; align-items: center; gap: 4px;">
                      <i data-lucide="smartphone" style="width: 12px; height: 12px; color: #60a5fa;"></i>
                      <a href="http://127.0.0.1:${s.port}" target="_blank" style="color: #60a5fa;"><code>http://127.0.0.1:${s.port}</code></a>
                    </span>
                    ${
                      isWifiClient
                        ? `<span style="display: inline-flex; align-items: center; gap: 4px;">
                             <i data-lucide="laptop" style="width: 12px; height: 12px; color: #4ade80;"></i>
                             <a href="http://${currentHost}:${s.port}" target="_blank" style="color: #4ade80;"><code>http://${currentHost}:${s.port}</code></a>
                           </span>`
                        : ''
                    }
                  </div>
                </td>
                <td>
                  <span class="badge ${isRunning ? 'badge-success' : 'badge-danger'}">
                    ${isRunning ? 'RUNNING' : 'STOPPED'}
                  </span>
                </td>
                <td>
                  <div class="flex-align gap-1">
                    ${
                      isRunning
                        ? `<a href="${openUrl}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none; display: inline-flex; align-items: center;">
                             <i data-lucide="external-link" style="width: 12px; height: 12px; margin-right: 3px;"></i> Open
                           </a>`
                        : ''
                    }
                    <button class="btn btn-secondary btn-sm" onclick="app.switchTab('websites')">Manage</button>
                  </div>
                </td>
              </tr>
            `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  }
};
