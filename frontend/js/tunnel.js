const tunnelManager = {
  currentMode: 'semi',

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
      if (semiBtn) { semiBtn.className = 'btn btn-primary btn-sm'; }
      if (autoBtn) { autoBtn.className = 'btn btn-secondary btn-sm'; }
      if (semiCard) semiCard.classList.remove('hidden');
      if (autoCard) autoCard.classList.add('hidden');
    } else {
      if (semiBtn) { semiBtn.className = 'btn btn-secondary btn-sm'; }
      if (autoBtn) { autoBtn.className = 'btn btn-primary btn-sm'; }
      if (semiCard) semiCard.classList.add('hidden');
      if (autoCard) autoCard.classList.remove('hidden');
    }
  },

  async loadStatus() {
    try {
      const data = await API.get('/api/tunnel/status');
      this.renderStatus(data.status);
      this.renderRoutes(data.recommendedRoutes);
    } catch (e) {}
  },

  renderStatus(s) {
    const badge = document.getElementById('tunnel-badge');
    if (badge) {
      if (s.isRunning) {
        badge.className = 'badge badge-success';
        badge.textContent = 'ONLINE / TUNNEL ACTIVE';
      } else if (s.isConfigured) {
        badge.className = 'badge badge-primary';
        badge.textContent = 'TOKEN CONFIGURED';
      } else {
        badge.className = 'badge badge-secondary';
        badge.textContent = 'TOKEN REQUIRED';
      }
    }

    const input = document.getElementById('tunnel-token-input');
    if (input && s.maskedToken) {
      input.placeholder = `Configured (${s.maskedToken})`;
    }
  },

  renderRoutes(routes) {
    const tbody = document.getElementById('tunnel-routes-body');
    if (!tbody) return;

    if (!routes || routes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center">No routes available</td></tr>`;
      return;
    }

    tbody.innerHTML = routes
      .map(
        (r) => `
        <tr>
          <td><strong>${r.hostname}</strong></td>
          <td><span class="badge badge-secondary">HTTP</span></td>
          <td><code>${r.service}</code></td>
          <td class="text-muted">${r.description}</td>
        </tr>
      `
      )
      .join('');
  },

  async handleSaveToken(e) {
    e.preventDefault();
    const token = document.getElementById('tunnel-token-input').value;

    try {
      await API.post('/api/tunnel/token', { token });
      API.toast('Cloudflare Tunnel token saved securely (chmod 600)!', 'success');
      document.getElementById('tunnel-token-input').value = '';
      this.loadStatus();
    } catch (e) {}
  },

  async handleAutoSetup(e) {
    e.preventDefault();
    const apiToken = document.getElementById('cf-api-token').value;
    const domain = document.getElementById('cf-domain').value;
    const panelSubdomain = document.getElementById('cf-subdomain').value || 'panel';
    const btn = document.getElementById('cf-auto-btn');

    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Configuring Tunnel & DNS...';
    }

    try {
      API.toast('Connecting to Cloudflare API...', 'info');
      const res = await API.post('/api/tunnel/auto-setup', {
        apiToken,
        domain,
        panelSubdomain
      });

      API.toast('Cloudflare Tunnel & DNS configured automatically!', 'success');
      alert(`Success! Cloudflare Tunnel is active.\n\nYour panel is available at: ${res.panelUrl}\n\nDNS CNAME records have been created.`);
      document.getElementById('tunnel-api-form').reset();
      this.loadStatus();
    } catch (err) {
      // toast shown by API client
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Run Fully-Automatic Setup';
      }
    }
  }
};
