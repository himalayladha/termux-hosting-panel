const tunnelManager = {
  currentMode: 'semi',
  tunnelState: {
    isRunning: false,
    isConfigured: false,
    maskedToken: null,
    binaryVersion: null
  },

  init() {
    this.bindEvents();
    this.loadStatus();
  },

  bindEvents() {
    const semiForm = document.getElementById('tunnel-token-form');
    if (semiForm) {
      semiForm.addEventListener('submit', (e) => this.handleSaveToken(e));
    }

    const apiForm = document.getElementById('tunnel-api-form');
    if (apiForm) {
      apiForm.addEventListener('submit', (e) => this.handleAutoSetup(e));
    }
  },

  switchMode(mode) {
    this.currentMode = mode;
    const semiBtn = document.getElementById('tunnel-tab-btn-semi');
    const autoBtn = document.getElementById('tunnel-tab-btn-auto');
    const semiCard = document.getElementById('tunnel-mode-semi');
    const autoCard = document.getElementById('tunnel-mode-auto');

    if (mode === 'semi') {
      if (semiBtn) semiBtn.className = 'btn btn-primary btn-sm';
      if (autoBtn) autoBtn.className = 'btn btn-secondary btn-sm';
      if (semiCard) semiCard.classList.remove('hidden');
      if (autoCard) autoCard.classList.add('hidden');
    } else {
      if (semiBtn) semiBtn.className = 'btn btn-secondary btn-sm';
      if (autoBtn) autoBtn.className = 'btn btn-primary btn-sm';
      if (semiCard) semiCard.classList.add('hidden');
      if (autoCard) autoCard.classList.remove('hidden');
    }
    if (window.lucide) lucide.createIcons();
  },

  async loadStatus() {
    try {
      const data = await API.get('/api/tunnel/status');
      this.tunnelState = data.status;
      this.renderStatus(data.status);
      this.renderRoutes(data.recommendedRoutes);
    } catch (e) {}
  },

  renderStatus(s) {
    const connectedPanel = document.getElementById('tunnel-connected-panel');
    const setupCard = document.getElementById('tunnel-setup-card');
    const badge = document.getElementById('tunnel-badge');
    const statusText = document.getElementById('tunnel-status-text');
    const maskedToken = document.getElementById('tunnel-masked-token');
    const binaryInfo = document.getElementById('tunnel-binary-info');
    const powerBtn = document.getElementById('tunnel-btn-power');

    if (s.isConfigured || s.isRunning) {
      if (connectedPanel) connectedPanel.classList.remove('hidden');
      if (setupCard) setupCard.classList.add('hidden');

      if (statusText) {
        statusText.textContent = s.isRunning ? 'RUNNING / ONLINE' : 'STOPPED';
        statusText.style.color = s.isRunning ? '#22c55e' : '#f59e0b';
      }

      if (maskedToken) {
        maskedToken.textContent = s.maskedToken || 'Token Saved';
      }

      if (binaryInfo) {
        binaryInfo.textContent = s.binaryVersion ? s.binaryVersion.split(' ')[0] + ' ' + (s.binaryVersion.split(' ')[2] || '') : (s.binaryInstalled ? 'Installed' : 'cloudflared ready');
      }

      if (powerBtn) {
        if (s.isRunning) {
          powerBtn.innerHTML = `<i data-lucide="square" style="width: 14px; height: 14px; margin-right: 4px;"></i> Stop Tunnel`;
          powerBtn.className = 'btn btn-secondary btn-sm';
        } else {
          powerBtn.innerHTML = `<i data-lucide="play" style="width: 14px; height: 14px; margin-right: 4px;"></i> Start Tunnel`;
          powerBtn.className = 'btn btn-success btn-sm';
        }
      }
    } else {
      if (connectedPanel) connectedPanel.classList.add('hidden');
      if (setupCard) setupCard.classList.remove('hidden');

      if (badge) {
        badge.className = 'badge badge-secondary';
        badge.textContent = 'TOKEN REQUIRED';
      }
    }

    const input = document.getElementById('tunnel-token-input');
    if (input && s.maskedToken) {
      input.placeholder = `Configured (${s.maskedToken})`;
    }

    if (window.lucide) lucide.createIcons();
  },

  showSetupOptions() {
    const setupCard = document.getElementById('tunnel-setup-card');
    if (setupCard) {
      setupCard.classList.toggle('hidden');
      if (!setupCard.classList.contains('hidden')) {
        setupCard.scrollIntoView({ behavior: 'smooth' });
      }
    }
  },

  renderRoutes(routes) {
    const tbody = document.getElementById('tunnel-routes-body');
    if (!tbody) return;

    if (!routes || routes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center" style="padding: 24px;">No routes mapped yet. Connect a domain in the Domains tab to map public hostnames to local services.</td></tr>`;
      return;
    }

    tbody.innerHTML = routes
      .map(
        (r) => `
        <tr>
          <td>
            <div class="flex-align gap-2">
              <i data-lucide="${r.isPanel ? 'layout-dashboard' : 'globe'}" style="width: 15px; height: 15px; color: #38bdf8;"></i>
              <strong>${r.hostname}</strong>
            </div>
          </td>
          <td><span class="badge ${r.type && r.type.includes('HTTPS') ? 'badge-success' : 'badge-secondary'}">${r.type || 'HTTP'}</span></td>
          <td><code>${r.service}</code></td>
          <td>
            <div class="flex-between">
              <span>${r.description}</span>
              <span class="badge ${r.status && r.status.includes('Connected') ? 'badge-success' : 'badge-secondary'}" style="font-size: 10px; margin-left: 8px;">
                ${r.status}
              </span>
            </div>
          </td>
        </tr>
      `
      )
      .join('');

    if (window.lucide) lucide.createIcons();
  },

  async handleSaveToken(e) {
    e.preventDefault();
    const token = document.getElementById('tunnel-token-input').value.trim();

    if (!token) return;

    try {
      await API.post('/api/tunnel/token', { token });
      API.toast('Cloudflare Tunnel token saved and connector started!', 'success');
      document.getElementById('tunnel-token-input').value = '';
      await this.loadStatus();
      await UI.alert('Cloudflare Tunnel is now active and routing traffic to your Termux websites!', 'Tunnel Connected', 'success');
    } catch (e) {}
  },

  async handleAutoSetup(e) {
    e.preventDefault();
    const apiToken = document.getElementById('cf-api-token').value.trim();
    const domain = document.getElementById('cf-domain').value.trim();
    const panelSubdomain = document.getElementById('cf-subdomain').value.trim() || 'panel';
    const btn = document.getElementById('cf-auto-btn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Configuring Tunnel & DNS...`;
      if (window.lucide) lucide.createIcons();
    }

    try {
      API.toast('Connecting to Cloudflare API...', 'info');
      const res = await API.post('/api/tunnel/auto-setup', {
        apiToken,
        domain,
        panelSubdomain
      });

      API.toast('Cloudflare Tunnel & DNS configured automatically!', 'success');
      document.getElementById('tunnel-api-form').reset();
      await this.loadStatus();

      await UI.alert(
        `Cloudflare Tunnel is connected and ready!\n\nYour Panel URL: ${res.panelUrl}\n\nDNS CNAME records have been created and proxied with free SSL.`,
        'Tunnel Connected Successfully',
        'success'
      );
    } catch (err) {
      // toast shown by API client
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="zap" style="width: 14px; height: 14px; margin-right: 4px;"></i> Run Fully-Automatic Setup`;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  async restart() {
    try {
      API.toast('Restarting Cloudflare Tunnel...', 'info');
      await API.post('/api/tunnel/restart');
      API.toast('Cloudflare Tunnel restarted successfully!', 'success');
      this.loadStatus();
    } catch (e) {}
  },

  async togglePower() {
    try {
      if (this.tunnelState.isRunning) {
        await API.post('/api/tunnel/stop');
        API.toast('Cloudflare Tunnel stopped', 'info');
      } else {
        await API.post('/api/tunnel/start');
        API.toast('Cloudflare Tunnel started', 'success');
      }
      this.loadStatus();
    } catch (e) {}
  },

  async disconnect() {
    const confirmed = await UI.confirm(
      'Are you sure you want to disconnect Cloudflare Tunnel? This will stop the connector and remove the saved token.',
      'Disconnect Cloudflare Tunnel',
      { confirmText: 'Disconnect', cancelText: 'Keep Connected', type: 'danger' }
    );

    if (!confirmed) return;

    try {
      await API.delete('/api/tunnel/token');
      API.toast('Cloudflare Tunnel disconnected', 'info');
      this.loadStatus();
    } catch (e) {}
  },

  async viewLogs() {
    document.getElementById('modal-tunnel-logs').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    this.fetchLogs();
  },

  async fetchLogs() {
    const pre = document.getElementById('tunnel-log-content');
    if (!pre) return;
    pre.textContent = 'Fetching latest tunnel logs...';

    try {
      const res = await API.get('/api/tunnel/logs');
      pre.textContent = res.logs || 'No logs available';
    } catch (e) {
      pre.textContent = 'Failed to load logs: ' + e.message;
    }
  }
};
