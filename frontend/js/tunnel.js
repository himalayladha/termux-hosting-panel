const tunnelManager = {
  currentProvider: 'cloudflare',
  currentMode: 'api',
  providersData: null,
  tunnelState: {
    isRunning: false,
    isConfigured: false,
    maskedToken: null,
    binaryVersion: null
  },

  init() {
    this.bindEvents();
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

    const ngrokTokenForm = document.getElementById('ngrok-token-form');
    if (ngrokTokenForm) {
      ngrokTokenForm.addEventListener('submit', (e) => this.handleSaveFallbackToken('ngrok', e));
    }

    const loclxTokenForm = document.getElementById('loclx-token-form');
    if (loclxTokenForm) {
      loclxTokenForm.addEventListener('submit', (e) => this.handleSaveFallbackToken('localxpose', e));
    }
  },

  switchProvider(provider) {
    this.currentProvider = provider;

    // Update tab buttons
    document.querySelectorAll('.tunnel-provider-tab-btn').forEach((btn) => {
      if (btn.dataset.provider === provider) {
        btn.className = 'btn btn-primary btn-sm tunnel-provider-tab-btn';
      } else {
        btn.className = 'btn btn-secondary btn-sm tunnel-provider-tab-btn';
      }
    });

    // Toggle panels
    const panels = ['cloudflare', 'ngrok', 'localxpose', 'tailscale'];
    panels.forEach((p) => {
      const panelEl = document.getElementById(`tunnel-panel-${p}`);
      if (panelEl) {
        if (p === provider) {
          panelEl.classList.remove('hidden');
        } else {
          panelEl.classList.add('hidden');
        }
      }
    });

    this.populateTargetSelects();
    this.loadProviders();
    if (window.lucide) lucide.createIcons();
  },

  switchMode(mode) {
    this.currentMode = mode;
    const apiBtn = document.getElementById('tab-btn-cf-api');
    const tokenBtn = document.getElementById('tab-btn-cf-token');
    const apiCard = document.getElementById('tunnel-mode-api');
    const tokenCard = document.getElementById('tunnel-mode-token');

    if (mode === 'api') {
      if (apiBtn) apiBtn.className = 'btn btn-primary btn-sm';
      if (tokenBtn) tokenBtn.className = 'btn btn-secondary btn-sm';
      if (apiCard) apiCard.classList.remove('hidden');
      if (tokenCard) tokenCard.classList.add('hidden');
    } else {
      if (apiBtn) apiBtn.className = 'btn btn-secondary btn-sm';
      if (tokenBtn) tokenBtn.className = 'btn btn-primary btn-sm';
      if (apiCard) apiCard.classList.add('hidden');
      if (tokenCard) tokenCard.classList.remove('hidden');
    }
    if (window.lucide) lucide.createIcons();
  },

  async populateTargetSelects() {
    let sites = [];
    try {
      if (typeof websites !== 'undefined' && websites.list && websites.list.length > 0) {
        sites = websites.list;
      } else {
        sites = await API.get('/api/websites');
      }
    } catch (_) {}

    const options = [
      '<option value="9000">TermuxPanel Control Plane (Port 9000)</option>',
      ...sites.map((s) => `<option value="${s.port}">Website: ${s.name} (Port ${s.port} • ${(s.type || 'html').toUpperCase()})</option>`)
    ].join('');

    const ngrokSel = document.getElementById('ngrok-target-select');
    if (ngrokSel) ngrokSel.innerHTML = options;

    const loclxSel = document.getElementById('loclx-target-select');
    if (loclxSel) loclxSel.innerHTML = options;

    const tailscaleSel = document.getElementById('tailscale-target-select');
    if (tailscaleSel) tailscaleSel.innerHTML = options;
  },

  async loadProviders() {
    try {
      const providers = await API.get('/api/tunnel/providers');
      this.providersData = providers;

      // 1. Ngrok UI Update
      if (providers.ngrok) {
        const n = providers.ngrok;
        const statusBadge = document.getElementById('ngrok-status-badge');
        const statusText = document.getElementById('ngrok-status-text');
        const maskedToken = document.getElementById('ngrok-masked-token');
        const binaryInfo = document.getElementById('ngrok-binary-info');
        const liveCard = document.getElementById('ngrok-live-url-card');
        const publicUrlLink = document.getElementById('ngrok-public-url-link');
        const openUrlBtn = document.getElementById('ngrok-open-url-btn');
        const copyUrlBtn = document.getElementById('ngrok-copy-url-btn');
        const startBtn = document.getElementById('btn-start-ngrok');
        const stopBtn = document.getElementById('btn-stop-ngrok');

        if (statusBadge) {
          statusBadge.textContent = n.isRunning ? 'RUNNING / ONLINE' : 'STOPPED';
          statusBadge.className = n.isRunning ? 'badge badge-success' : 'badge badge-secondary';
        }
        if (statusText) {
          statusText.textContent = n.isRunning ? 'RUNNING / ONLINE' : 'STOPPED';
          statusText.style.color = n.isRunning ? '#22c55e' : '#f59e0b';
        }
        if (maskedToken) {
          maskedToken.textContent = n.tokenMask || (n.isConfigured ? 'Token Configured' : 'Not Configured');
        }
        if (binaryInfo) {
          binaryInfo.textContent = n.isInstalled ? 'Installed' : 'Not Installed (pkg install -y ngrok)';
          binaryInfo.style.color = n.isInstalled ? '#22c55e' : '#f87171';
        }

        if (n.isRunning && n.publicUrl) {
          if (liveCard) liveCard.classList.remove('hidden');
          if (publicUrlLink) {
            publicUrlLink.textContent = n.publicUrl;
            publicUrlLink.href = n.publicUrl;
          }
          if (openUrlBtn) openUrlBtn.href = n.publicUrl;
          if (copyUrlBtn) {
            copyUrlBtn.onclick = () => {
              navigator.clipboard.writeText(n.publicUrl).then(() => API.toast(`Copied ${n.publicUrl}`, 'success'));
            };
          }
        } else if (liveCard) {
          liveCard.classList.add('hidden');
        }
      }

      // 2. LocalXpose UI Update
      if (providers.localxpose) {
        const l = providers.localxpose;
        const statusBadge = document.getElementById('loclx-status-badge');
        const statusText = document.getElementById('loclx-status-text');
        const maskedToken = document.getElementById('loclx-masked-token');
        const binaryInfo = document.getElementById('loclx-binary-info');
        const liveCard = document.getElementById('loclx-live-url-card');
        const publicUrlLink = document.getElementById('loclx-public-url-link');
        const openUrlBtn = document.getElementById('loclx-open-url-btn');
        const copyUrlBtn = document.getElementById('loclx-copy-url-btn');

        if (statusBadge) {
          statusBadge.textContent = l.isRunning ? 'RUNNING / ONLINE' : 'STOPPED';
          statusBadge.className = l.isRunning ? 'badge badge-success' : 'badge badge-secondary';
        }
        if (statusText) {
          statusText.textContent = l.isRunning ? 'RUNNING / ONLINE' : 'STOPPED';
          statusText.style.color = l.isRunning ? '#22c55e' : '#f59e0b';
        }
        if (maskedToken) {
          maskedToken.textContent = l.tokenMask || (l.isConfigured ? 'Token Configured' : 'Not Configured');
        }
        if (binaryInfo) {
          binaryInfo.textContent = l.isInstalled ? 'Installed' : 'Not Installed (curl installer)';
          binaryInfo.style.color = l.isInstalled ? '#22c55e' : '#f87171';
        }

        if (l.isRunning && l.publicUrl) {
          if (liveCard) liveCard.classList.remove('hidden');
          if (publicUrlLink) {
            publicUrlLink.textContent = l.publicUrl;
            publicUrlLink.href = l.publicUrl;
          }
          if (openUrlBtn) openUrlBtn.href = l.publicUrl;
          if (copyUrlBtn) {
            copyUrlBtn.onclick = () => {
              navigator.clipboard.writeText(l.publicUrl).then(() => API.toast(`Copied ${l.publicUrl}`, 'success'));
            };
          }
        } else if (liveCard) {
          liveCard.classList.add('hidden');
        }
      }

      // 3. Tailscale UI Update
      if (providers.tailscale) {
        const t = providers.tailscale;
        const statusBadge = document.getElementById('tailscale-status-badge');
        const statusText = document.getElementById('tailscale-status-text');
        const binaryInfo = document.getElementById('tailscale-binary-info');

        if (statusBadge) {
          statusBadge.textContent = t.isRunning ? 'FUNNEL ACTIVE' : 'STOPPED';
          statusBadge.className = t.isRunning ? 'badge badge-success' : 'badge badge-secondary';
        }
        if (statusText) {
          statusText.textContent = t.isRunning ? 'FUNNEL ACTIVE' : 'STOPPED';
          statusText.style.color = t.isRunning ? '#22c55e' : '#f59e0b';
        }
        if (binaryInfo) {
          binaryInfo.textContent = t.isInstalled ? 'Installed' : 'Not Installed (pkg install -y tailscale)';
          binaryInfo.style.color = t.isInstalled ? '#22c55e' : '#f87171';
        }
      }

      if (window.lucide) lucide.createIcons();
    } catch (_) {}
  },

  async startFallback(provider) {
    let targetPort = 9000;
    let subdomain = null;

    if (provider === 'ngrok') {
      const sel = document.getElementById('ngrok-target-select');
      if (sel) targetPort = sel.value;
    } else if (provider === 'localxpose') {
      const sel = document.getElementById('loclx-target-select');
      if (sel) targetPort = sel.value;
      const subInput = document.getElementById('loclx-subdomain-input');
      if (subInput) subdomain = subInput.value.trim();
    } else if (provider === 'tailscale') {
      const sel = document.getElementById('tailscale-target-select');
      if (sel) targetPort = sel.value;
    }

    try {
      API.toast(`Starting ${provider} tunnel on port ${targetPort}...`, 'info');
      const res = await API.post(`/api/tunnel/${provider}/start`, { targetPort, subdomain });
      API.toast(res.message || `${provider} started!`, 'success');
      await this.loadProviders();
    } catch (err) {
      // toast shown by API client
    }
  },

  async stopFallback(provider) {
    try {
      API.toast(`Stopping ${provider} tunnel...`, 'info');
      const res = await API.post(`/api/tunnel/${provider}/stop`);
      API.toast(res.message || `${provider} stopped`, 'info');
      await this.loadProviders();
    } catch (err) {}
  },

  async handleSaveFallbackToken(provider, e) {
    e.preventDefault();
    let token = '';
    if (provider === 'ngrok') {
      token = document.getElementById('ngrok-token-input').value.trim();
    } else if (provider === 'localxpose') {
      token = document.getElementById('loclx-token-input').value.trim();
    }

    if (!token) return;

    try {
      API.toast(`Saving ${provider} token...`, 'info');
      const res = await API.post(`/api/tunnel/${provider}/token`, { token });
      API.toast(res.message || 'Token saved!', 'success');
      if (provider === 'ngrok') document.getElementById('ngrok-token-input').value = '';
      if (provider === 'localxpose') document.getElementById('loclx-token-input').value = '';
      await this.loadProviders();
    } catch (err) {}
  },

  async viewFallbackLogs(provider) {
    document.getElementById('modal-tunnel-logs').classList.remove('hidden');
    const pre = document.getElementById('tunnel-log-content');
    if (pre) pre.textContent = `Fetching latest runtime logs for ${provider}...`;

    try {
      const res = await API.get(`/api/tunnel/${provider}/logs`);
      if (pre) pre.textContent = res.logs || 'No logs available';
    } catch (e) {
      if (pre) pre.textContent = 'Failed to load logs: ' + e.message;
    }
    if (window.lucide) lucide.createIcons();
  },

  async loadStatus() {
    try {
      const data = await API.get('/api/tunnel/status');
      this.tunnelState = data.status;
      this.renderStatus(data.status);
      this.renderRoutes(data.recommendedRoutes);
      this.populateTargetSelects();
      this.loadProviders();
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
      tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-center" style="padding: 24px;">No routes mapped yet. Connect a domain in the Domains tab to map public hostnames to local services.</td></tr>`;
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
          <td>
            ${
              r.isLive
                ? `<a href="${r.tunnelUrl}" target="_blank" style="color: #38bdf8; font-weight: 600; text-decoration: underline;">${r.tunnelUrl}</a>`
                : `<code class="text-muted">${r.tunnelUrl}</code>`
            }
          </td>
          <td>
            <span class="badge ${r.type && r.type.includes('HTTPS') ? 'badge-success' : 'badge-secondary'}">
              ${r.type || 'HTTP'}
            </span>
          </td>
          <td><code>${r.service}</code></td>
          <td>${r.description}</td>
          <td>
            <span class="badge ${r.isLive ? 'badge-success' : 'badge-secondary'}" style="font-size: 10.5px;">
              ${r.status}
            </span>
          </td>
          <td style="text-align: right;">
            <div class="flex-align gap-1" style="justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${r.tunnelUrl}').then(() => API.toast('Copied ${r.tunnelUrl}', 'success'))" title="Copy URL">
                <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
              </button>
              ${
                r.isLive
                  ? `<a href="${r.tunnelUrl}" target="_blank" class="btn btn-primary btn-sm" title="Open live URL" style="text-decoration: none;">
                      <i data-lucide="external-link" style="width: 12px; height: 12px;"></i>
                     </a>`
                  : `<button class="btn btn-secondary btn-sm" onclick="domainsManager.openConnectModal()" title="Connect Custom Domain">
                      <i data-lucide="plus" style="width: 12px; height: 12px;"></i>
                     </button>`
              }
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
    const apiToken = document.getElementById('tunnel-api-token').value.trim();
    const domain = document.getElementById('tunnel-api-domain').value.trim();
    const panelSubdomain = document.getElementById('tunnel-api-subdomain').value.trim() || 'panel';
    const tunnelName = document.getElementById('tunnel-api-name').value.trim() || 'termux-android-tunnel';
    const btn = document.getElementById('btn-submit-api-tunnel');

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
        panelSubdomain,
        tunnelName
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
        btn.innerHTML = `<i data-lucide="zap" style="width: 15px; height: 15px; margin-right: 4px;"></i> Auto-Create Tunnel & DNS Records`;
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
