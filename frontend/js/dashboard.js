const dashboard = {
  timer: null,

  init() {
    this.loadSummary();
    this.startPolling();
  },

  startPolling() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (document.getElementById('view-dashboard').classList.contains('active')) {
        this.loadMetrics();
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

    // Uptime
    const uptimeEl = document.getElementById('metric-uptime');
    const envEl = document.getElementById('metric-env');
    if (uptimeEl) uptimeEl.textContent = m.uptime.formatted;
    if (envEl) {
      envEl.textContent = m.os.isAndroidTermux ? 'Android Termux Online' : `${m.os.platform} (${m.os.arch})`;
    }
  },

  renderRunningApps(sites) {
    const listEl = document.getElementById('dashboard-apps-list');
    if (!listEl) return;

    if (!sites || sites.length === 0) {
      listEl.innerHTML = '<p class="text-muted">No websites or applications created yet. Click "+ Create Website" above.</p>';
      return;
    }

    listEl.innerHTML = `
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Application</th>
              <th>Type</th>
              <th>Local Port</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${sites
              .map(
                (s) => `
              <tr>
                <td><strong>${s.name}</strong></td>
                <td><span class="badge badge-primary">${s.type.toUpperCase()}</span></td>
                <td><code>:${s.port}</code></td>
                <td>
                  <span class="badge ${s.status === 'running' ? 'badge-success' : 'badge-danger'}">
                    ${s.status.toUpperCase()}
                  </span>
                </td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="app.switchTab('websites')">Manage</button>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }
};
