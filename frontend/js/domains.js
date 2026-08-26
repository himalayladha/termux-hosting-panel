const domainsManager = {
  domainsList: [],
  currentMode: 'auto',

  init() {
    this.bindEvents();
    this.loadDomains();
  },

  bindEvents() {
    const openBtn = document.getElementById('open-connect-domain-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openConnectModal());
    }

    const form = document.getElementById('connect-domain-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleConnectDomain(e));
    }
  },

  switchMode(mode) {
    this.currentMode = mode;
    const autoBtn = document.getElementById('domain-tab-btn-auto');
    const manualBtn = document.getElementById('domain-tab-btn-manual');
    const autoFields = document.getElementById('domain-cf-auto-fields');
    const manualFields = document.getElementById('domain-cf-manual-fields');

    if (mode === 'auto') {
      if (autoBtn) autoBtn.className = 'btn btn-primary btn-sm';
      if (manualBtn) manualBtn.className = 'btn btn-secondary btn-sm';
      if (autoFields) autoFields.classList.remove('hidden');
      if (manualFields) manualFields.classList.add('hidden');
    } else {
      if (autoBtn) autoBtn.className = 'btn btn-secondary btn-sm';
      if (manualBtn) manualBtn.className = 'btn btn-primary btn-sm';
      if (autoFields) autoFields.classList.add('hidden');
      if (manualFields) manualFields.classList.remove('hidden');
    }
    if (window.lucide) lucide.createIcons();
  },

  async openConnectModal() {
    const targetSelect = document.getElementById('domain-target-select');
    if (targetSelect) {
      try {
        const sites = await API.get('/api/websites');
        targetSelect.innerHTML = `
          <option value="">TermuxPanel Control Plane (:9000)</option>
          ${sites.map((s) => `<option value="${s.id}">Website: ${s.name} (Port :${s.port})</option>`).join('')}
        `;
      } catch (e) {}
    }

    document.getElementById('modal-connect-domain').classList.remove('hidden');
    this.switchMode('auto');
    if (window.lucide) lucide.createIcons();
  },

  async loadDomains() {
    try {
      this.domainsList = await API.get('/api/domains');
      this.renderDomains();
    } catch (err) {
      console.error('Failed to load domains:', err);
    }
  },

  renderDomains() {
    const tbody = document.getElementById('domains-table-body');
    if (!tbody) return;

    if (!this.domainsList || this.domainsList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-muted text-center" style="padding: 32px;">
            <i data-lucide="globe-2" style="width: 36px; height: 36px; color: #475569; margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto;"></i>
            No custom domains connected yet. Click "+ Connect Domain" to route your custom domain to any hosted website.
          </td>
        </tr>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    tbody.innerHTML = this.domainsList
      .map((d) => {
        return `
        <tr>
          <td>
            <div class="flex-align gap-2">
              <i data-lucide="globe" style="width: 16px; height: 16px; color: #38bdf8;"></i>
              <a href="https://${d.domain}" target="_blank" style="font-weight: 600; color: #38bdf8; text-decoration: underline;">
                ${d.domain}
              </a>
            </div>
          </td>
          <td>
            <div class="flex-align gap-2">
              <span class="badge ${d.targetType === 'panel' ? 'badge-primary' : 'badge-secondary'}">
                ${d.targetType.toUpperCase()}
              </span>
              <span><strong>${d.targetName}</strong> <code class="text-muted text-sm">(:${d.targetPort})</code></span>
            </div>
          </td>
          <td>
            <span class="badge badge-success" style="display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="shield-check" style="width: 12px; height: 12px;"></i>
              HTTPS Auto-SSL
            </span>
          </td>
          <td>
            <span class="badge ${d.tunnelRunning ? 'badge-success' : 'badge-secondary'}" style="display: inline-flex; align-items: center; gap: 4px;">
              <i data-lucide="cloud" style="width: 12px; height: 12px;"></i>
              ${d.tunnelRunning ? 'Cloudflare Tunnel Active' : 'Tunnel Ready'}
            </span>
          </td>
          <td>
            <span class="text-muted text-sm">${new Date(d.createdAt).toLocaleDateString()}</span>
          </td>
          <td style="text-align: right;">
            <div class="flex-align gap-2" style="justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="domainsManager.verifyDomain('${d.domain}')" title="Verify DNS propagation & SSL reachability">
                <i data-lucide="activity" style="width: 13px; height: 13px; margin-right: 3px;"></i> Verify DNS
              </button>
              <a href="https://${d.domain}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none;" title="Open live domain">
                <i data-lucide="external-link" style="width: 13px; height: 13px;"></i>
              </a>
              <button class="btn btn-danger btn-sm" onclick="domainsManager.deleteDomain(${d.id}, '${d.domain}')" title="Disconnect domain">
                <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    if (window.lucide) lucide.createIcons();
  },

  async handleConnectDomain(e) {
    e.preventDefault();
    const domain = document.getElementById('connect-domain-input').value.trim();
    const websiteId = document.getElementById('domain-target-select').value || null;
    const isAuto = this.currentMode === 'auto';
    const cfApiToken = isAuto ? document.getElementById('domain-cf-token').value.trim() : null;
    const cfZoneDomain = isAuto ? document.getElementById('domain-cf-zone').value.trim() : null;

    if (!domain) return;

    try {
      API.toast('Connecting domain...', 'info');
      const res = await API.post('/api/domains/connect', {
        domain,
        websiteId,
        autoCloudflare: isAuto,
        cfApiToken,
        cfZoneDomain
      });

      API.toast(`Domain ${domain} connected successfully!`, 'success');
      document.getElementById('modal-connect-domain').classList.add('hidden');
      document.getElementById('connect-domain-form').reset();
      this.loadDomains();

      if (!isAuto) {
        await UI.alert(
          `Domain ${domain} registered!\n\nTo complete DNS setup in Cloudflare Dashboard:\n1. Add a CNAME record with Name: "${domain}"\n2. Target: "<YOUR_TUNNEL_ID>.cfargotunnel.com"\n3. Proxy status: Proxied (Orange Cloud)`,
          'DNS Setup Instructions',
          'info'
        );
      }
    } catch (err) {
      // toast shown by API client
    }
  },

  async verifyDomain(domainName) {
    try {
      API.toast(`Checking DNS and SSL for ${domainName}...`, 'info');
      const res = await API.post('/api/domains/verify', { domain: domainName });
      if (res.httpsReachable) {
        await UI.alert(`Domain ${domainName} is LIVE and routing securely with active HTTPS SSL!`, 'Domain Verified', 'success');
      } else if (res.resolved) {
        await UI.alert(`DNS resolved (${res.ipAddresses.join(', ') || 'CNAME mapped'}). Tunnel is connecting.`, 'DNS Resolved', 'info');
      } else {
        await UI.alert(`DNS for ${domainName} is not yet propagated. Please check your CNAME record in Cloudflare.`, 'DNS Pending', 'warning');
      }
    } catch (e) {}
  },

  async deleteDomain(id, name) {
    const confirmed = await UI.confirm(
      `Are you sure you want to disconnect domain "${name}"?`,
      'Disconnect Domain',
      { confirmText: 'Disconnect', cancelText: 'Cancel', type: 'danger' }
    );
    if (!confirmed) return;

    try {
      await API.delete(`/api/domains/${id}`);
      API.toast(`Domain ${name} disconnected`, 'info');
      this.loadDomains();
    } catch (e) {}
  }
};
