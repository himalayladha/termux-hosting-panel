const domainsManager = {
  domainsList: [],
  currentMode: 'auto',
  tunnelInfo: null,
  cfZones: [],

  init() {
    this.bindEvents();
    this.loadDomains();
    this.loadTunnelInfo();
  },

  bindEvents() {
    const openConnectBtn = document.getElementById('open-connect-domain-btn');
    if (openConnectBtn) {
      openConnectBtn.addEventListener('click', () => this.openConnectModal());
    }

    const openSubdomainBtn = document.getElementById('open-create-subdomain-btn');
    if (openSubdomainBtn) {
      openSubdomainBtn.addEventListener('click', () => this.openSubdomainModal());
    }

    const connectForm = document.getElementById('connect-domain-form');
    if (connectForm) {
      connectForm.addEventListener('submit', (e) => this.handleConnectDomain(e));
    }

    const subForm = document.getElementById('create-subdomain-form');
    if (subForm) {
      subForm.addEventListener('submit', (e) => this.handleCreateSubdomain(e));
    }

    // Dynamic Subdomain Preview Listeners
    const prefixInput = document.getElementById('subdomain-prefix-input');
    const rootInput = document.getElementById('subdomain-root-input');
    const updatePreview = () => {
      const p = (prefixInput ? prefixInput.value.trim() : '') || 'subdomain';
      const r = (rootInput ? rootInput.value.trim() : '') || 'yourdomain.com';
      const previewEl = document.getElementById('subdomain-preview-text');
      if (previewEl) {
        previewEl.textContent = `https://${p.toLowerCase().replace(/[^a-z0-9-]/g, '')}.${r.toLowerCase().replace(/^https?:\/\//, '')}`;
      }
    };
    if (prefixInput) prefixInput.addEventListener('input', updatePreview);
    if (rootInput) rootInput.addEventListener('input', updatePreview);

    // Dynamic CNAME Host update in Connect Modal
    const domainInput = document.getElementById('connect-domain-input');
    if (domainInput) {
      domainInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase().replace(/^https?:\/\//, '');
        const hostEl = document.getElementById('manual-cname-host');
        if (hostEl) {
          if (!val) {
            hostEl.textContent = '@ (or subdomain prefix)';
          } else {
            const parts = val.split('.');
            if (parts.length > 2) {
              hostEl.textContent = parts[0];
            } else {
              hostEl.textContent = '@';
            }
          }
        }
      });
    }

    // Dynamic Checkbox Toggles in Subdomain Modal
    const siteCb = document.getElementById('subdomain-enable-site');
    const siteFields = document.getElementById('subdomain-site-fields');
    if (siteCb && siteFields) {
      siteCb.addEventListener('change', (e) => {
        siteFields.classList.toggle('hidden', !e.target.checked);
      });
    }

    const dbCb = document.getElementById('subdomain-enable-db');
    const dbFields = document.getElementById('subdomain-db-fields');
    if (dbCb && dbFields) {
      dbCb.addEventListener('change', (e) => {
        dbFields.classList.toggle('hidden', !e.target.checked);
      });
    }

    const cfCb = document.getElementById('subdomain-enable-cf');
    const cfFields = document.getElementById('subdomain-cf-fields');
    if (cfCb && cfFields) {
      cfCb.addEventListener('change', (e) => {
        cfFields.classList.toggle('hidden', !e.target.checked);
      });
    }
  },

  switchMode(mode) {
    this.currentMode = mode;
    const autoBtn = document.getElementById('domain-tab-btn-auto');
    const manualBtn = document.getElementById('domain-tab-btn-manual');
    const nsBtn = document.getElementById('domain-tab-btn-ns');

    const autoFields = document.getElementById('domain-cf-auto-fields');
    const manualFields = document.getElementById('domain-cf-manual-fields');
    const nsFields = document.getElementById('domain-cf-ns-fields');

    if (autoBtn) autoBtn.className = mode === 'auto' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    if (manualBtn) manualBtn.className = mode === 'manual' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    if (nsBtn) nsBtn.className = mode === 'ns' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

    if (autoFields) autoFields.classList.toggle('hidden', mode !== 'auto');
    if (manualFields) manualFields.classList.toggle('hidden', mode !== 'manual');
    if (nsFields) nsFields.classList.toggle('hidden', mode !== 'ns');

    if (window.lucide) lucide.createIcons();
  },

  async loadTunnelInfo() {
    try {
      const data = await API.get('/api/domains/tunnel-info');
      this.tunnelInfo = data;
      const targetEl = document.getElementById('manual-cname-target');
      if (targetEl && data.cnameTarget) {
        targetEl.textContent = data.cnameTarget;
      }
    } catch (e) {}
  },

  async fetchCfZones() {
    const tokenInput = document.getElementById('domain-cf-token');
    const token = tokenInput ? tokenInput.value.trim() : '';
    if (!token) {
      API.toast('Please paste your Cloudflare API Token first', 'warning');
      return;
    }

    const fetchBtn = document.getElementById('btn-fetch-cf-zones');
    if (fetchBtn) {
      fetchBtn.disabled = true;
      fetchBtn.innerHTML = `<i data-lucide="loader" style="width: 13px; height: 13px; margin-right: 3px;"></i> Fetching...`;
      if (window.lucide) lucide.createIcons();
    }

    try {
      API.toast('Fetching domains from your Cloudflare account...', 'info');
      const zones = await API.get(`/api/domains/cloudflare/zones?apiToken=${encodeURIComponent(token)}`);
      this.cfZones = zones;

      if (!zones || zones.length === 0) {
        API.toast('No domains found in this Cloudflare account', 'warning');
        return;
      }

      API.toast(`Found ${zones.length} domain(s) in your Cloudflare account!`, 'success');

      const selectContainer = document.getElementById('domain-cf-zones-container');
      const select = document.getElementById('domain-cf-zone-select');
      const manualContainer = document.getElementById('domain-cf-zone-manual-container');

      if (select && selectContainer) {
        select.innerHTML = zones.map((z) => `<option value="${z.name}">${z.name} (${z.accountName || 'Active'})</option>`).join('');
        selectContainer.classList.remove('hidden');
        if (manualContainer) manualContainer.classList.add('hidden');

        select.addEventListener('change', (e) => {
          const domainIn = document.getElementById('connect-domain-input');
          if (domainIn && !domainIn.value) {
            domainIn.value = e.target.value;
          }
        });

        // Set initial
        const domainIn = document.getElementById('connect-domain-input');
        if (domainIn && !domainIn.value && zones.length > 0) {
          domainIn.value = zones[0].name;
        }
      }
    } catch (err) {
      // Toast displayed by API
    } finally {
      if (fetchBtn) {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = `<i data-lucide="cloud-download" style="width: 13px; height: 13px; margin-right: 3px;"></i> Fetch Domains`;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  async openConnectModal() {
    const targetSelect = document.getElementById('domain-target-select');
    if (targetSelect) {
      try {
        const sites = await API.get('/api/websites');
        targetSelect.innerHTML = `
          <option value="">TermuxPanel Control Plane (:9000)</option>
          ${sites.map((s) => `<option value="${s.id}">Website: ${s.name} (Port :${s.port} • ${s.type.toUpperCase()})</option>`).join('')}
        `;
      } catch (e) {}
    }

    this.loadTunnelInfo();
    document.getElementById('modal-connect-domain').classList.remove('hidden');
    this.switchMode('auto');
    if (window.lucide) lucide.createIcons();
  },

  async openSubdomainModal() {
    const rootInput = document.getElementById('subdomain-root-input');
    if (rootInput && this.domainsList && this.domainsList.length > 0) {
      const firstDomain = this.domainsList[0].domain;
      const parts = firstDomain.split('.');
      if (parts.length >= 2) {
        rootInput.value = parts.slice(-2).join('.');
      }
    }

    const modal = document.getElementById('modal-create-subdomain');
    if (modal) modal.classList.remove('hidden');
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
            No custom domains or subdomains connected yet.<br>Click <strong>"+ Connect Existing Domain"</strong> or <strong>"+ Create Subdomain"</strong> to route traffic.
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
              <button class="btn btn-secondary btn-sm" onclick="domainsManager.showDnsInstructions('${d.domain}')" title="View CNAME DNS details">
                <i data-lucide="info" style="width: 13px; height: 13px;"></i>
              </button>
              <button class="btn btn-secondary btn-sm" onclick="domainsManager.verifyDomain('${d.domain}')" title="Verify DNS propagation & SSL reachability">
                <i data-lucide="activity" style="width: 13px; height: 13px; margin-right: 3px;"></i> Verify
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

  async showDnsInstructions(domainName) {
    const cnameTarget = (this.tunnelInfo && this.tunnelInfo.cnameTarget) || '<YOUR_TUNNEL_ID>.cfargotunnel.com';
    const parts = domainName.split('.');
    const host = parts.length > 2 ? parts[0] : '@';

    await UI.alert(
      `Cloudflare DNS Record Details for "${domainName}":\n\n` +
      `• Type: CNAME\n` +
      `• Name / Host: ${host}\n` +
      `• Target / Destination: ${cnameTarget}\n` +
      `• Proxy Status: Proxied (Orange Cloud ☁️ Enabled)\n\n` +
      `Traffic will route through your Cloudflare Tunnel directly to the connected website!`,
      `DNS Settings: ${domainName}`,
      'info'
    );
  },

  async handleConnectDomain(e) {
    e.preventDefault();
    const domain = document.getElementById('connect-domain-input').value.trim();
    const websiteId = document.getElementById('domain-target-select').value || null;
    const isAuto = this.currentMode === 'auto';
    const cfApiToken = isAuto ? document.getElementById('domain-cf-token').value.trim() : null;
    const zoneSelect = document.getElementById('domain-cf-zone-select');
    const manualZoneInput = document.getElementById('domain-cf-zone');
    const cfZoneDomain = isAuto ? (zoneSelect && !zoneSelect.closest('.hidden') ? zoneSelect.value : (manualZoneInput ? manualZoneInput.value.trim() : null)) : null;

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

      const cnameTarget = (this.tunnelInfo && this.tunnelInfo.cnameTarget) || res.cnameTarget || '<YOUR_TUNNEL_ID>.cfargotunnel.com';
      const parts = domain.split('.');
      const host = parts.length > 2 ? parts[0] : '@';

      if (!isAuto) {
        await UI.alert(
          `Domain "${domain}" is connected to your website!\n\n` +
          `Complete your DNS setup in Cloudflare Dashboard:\n` +
          `1. Add CNAME Record with Name: "${host}"\n` +
          `2. Target: "${cnameTarget}"\n` +
          `3. Proxy status: Proxied (Orange Cloud)\n\n` +
          `Your site will immediately receive free HTTPS SSL!`,
          'Domain Connected Successfully',
          'success'
        );
      } else {
        await UI.alert(
          `Domain "${domain}" has been automatically configured in Cloudflare!\n\n` +
          `• Target: ${res.targetName} (: ${res.targetPort})\n` +
          `• DNS CNAME & Ingress Route created.\n` +
          `• Live URL: https://${domain}`,
          'Domain Active via Cloudflare API',
          'success'
        );
      }
    } catch (err) {
      // toast shown by API client
    }
  },

  async handleCreateSubdomain(e) {
    e.preventDefault();
    const prefix = document.getElementById('subdomain-prefix-input').value.trim();
    const root = document.getElementById('subdomain-root-input').value.trim();
    const createSite = document.getElementById('subdomain-enable-site').checked;
    const appType = document.getElementById('subdomain-app-type').value;
    const createDb = document.getElementById('subdomain-enable-db').checked;
    const dbTemplate = document.getElementById('subdomain-db-template').value;
    const autoCf = document.getElementById('subdomain-enable-cf').checked;
    const cfToken = document.getElementById('subdomain-cf-token').value.trim();

    if (!prefix || !root) return;

    const btn = document.getElementById('subdomain-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Provisioning...`;
      if (window.lucide) lucide.createIcons();
    }

    try {
      API.toast('Provisioning subdomain, dedicated website & database...', 'info');
      const res = await API.post('/api/domains/create-subdomain', {
        subdomainPrefix: prefix,
        rootDomain: root,
        appType,
        createSite,
        createDatabase: createDb,
        dbTemplate,
        autoCloudflare: autoCf,
        cfApiToken: cfToken
      });

      API.toast(`Subdomain ${res.domain} created!`, 'success');
      document.getElementById('modal-create-subdomain').classList.add('hidden');
      document.getElementById('create-subdomain-form').reset();
      this.loadDomains();

      let msg = `Subdomain "${res.domain}" has been successfully provisioned!\n\n`;
      if (res.websiteId) {
        msg += `• Dedicated Website: Port :${res.targetPort}\n`;
        msg += `• Storage Root: ~/termux-panel/storage/websites/${prefix}/\n`;
      }
      if (res.database) {
        msg += `• Dedicated Database: data/${res.database.name} (${res.database.template})\n`;
      }
      msg += `\nYour site is live and reachable locally & globally via Cloudflare Tunnel!`;

      await UI.alert(msg, 'Subdomain Ready', 'success');
    } catch (err) {
      // toast shown by API client
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="sparkles" style="width: 14px; height: 14px; margin-right: 4px;"></i> Provision Subdomain`;
        if (window.lucide) lucide.createIcons();
      }
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
