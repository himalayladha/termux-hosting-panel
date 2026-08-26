const websites = {
  list: [],
  currentEditingId: null,
  currentWebhookSiteId: null,

  init() {
    this.bindEvents();
    this.loadWebsites();
  },

  bindEvents() {
    const openBtn = document.getElementById('open-create-site-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        document.getElementById('modal-create-site').classList.remove('hidden');
      });
    }

    const createForm = document.getElementById('create-site-form');
    if (createForm) {
      createForm.addEventListener('submit', (e) => this.handleCreate(e));
    }

    const editForm = document.getElementById('edit-site-form');
    if (editForm) {
      editForm.addEventListener('submit', (e) => this.handleEdit(e));
    }

    const editDeleteBtn = document.getElementById('edit-site-delete-btn');
    if (editDeleteBtn) {
      editDeleteBtn.addEventListener('click', () => {
        if (this.currentEditingId) {
          const site = this.list.find((s) => s.id === this.currentEditingId);
          document.getElementById('modal-edit-site').classList.add('hidden');
          this.deleteSite(this.currentEditingId, site ? site.name : 'website');
        }
      });
    }

    const webhookForm = document.getElementById('site-webhook-form');
    if (webhookForm) {
      webhookForm.addEventListener('submit', (e) => this.handleSaveWebhook(e));
    }
  },

  async loadWebsites() {
    try {
      this.list = await API.get('/api/websites');
      this.renderWebsites();
    } catch (err) {
      console.error('Failed to load websites:', err);
    }
  },

  renderWebsites() {
    const grid = document.getElementById('websites-list');
    if (!grid) return;

    if (!this.list || this.list.length === 0) {
      grid.innerHTML = `
        <div class="card p-4 text-center">
          <p class="text-muted">No websites or applications deployed yet.</p>
          <div class="mt-3">
            <button class="btn btn-primary" onclick="document.getElementById('modal-create-site').classList.remove('hidden')">
              <i data-lucide="plus" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Create Website
            </button>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    grid.innerHTML = this.list
      .map((site) => {
        const isRunning = site.status === 'running';
        const typeBadge = site.type.toUpperCase();
        const currentHost = window.location.hostname || '127.0.0.1';
        const wifiIp = site.wifiIp || (currentHost !== '127.0.0.1' && currentHost !== 'localhost' ? currentHost : null);
        const openUrl = isRunning ? (wifiIp ? `http://${wifiIp}:${site.port}` : `http://127.0.0.1:${site.port}`) : '#';

        return `
          <div class="card mb-3">
            <div class="card-body">
              <div class="flex-between flex-wrap gap-3 mb-3">
                <div class="flex-align gap-2">
                  <h4 style="font-size: 16px; margin: 0; font-weight: 600;">${site.name}</h4>
                  <span class="badge badge-primary">${typeBadge}</span>
                  <span class="badge ${isRunning ? 'badge-success' : 'badge-danger'}">
                    ${isRunning ? '● RUNNING' : '○ STOPPED'}
                  </span>
                </div>

                <div class="flex-align gap-2 flex-wrap">
                  ${
                    isRunning
                      ? `<a href="${openUrl}" target="_blank" class="btn btn-primary btn-sm" style="text-decoration: none; display: inline-flex; align-items: center;">
                           <i data-lucide="external-link" style="width: 13px; height: 13px; margin-right: 4px;"></i> Open
                         </a>
                         <button class="btn btn-secondary btn-sm" onclick="websites.restartSite(${site.id})">
                           <i data-lucide="refresh-cw" style="width: 13px; height: 13px; margin-right: 3px;"></i> Restart
                         </button>
                         <button class="btn btn-secondary btn-sm" onclick="websites.stopSite(${site.id})">
                           <i data-lucide="square" style="width: 13px; height: 13px; margin-right: 3px;"></i> Stop
                         </button>`
                      : `<button class="btn btn-primary btn-sm" onclick="websites.startSite(${site.id})">
                           <i data-lucide="play" style="width: 13px; height: 13px; margin-right: 3px;"></i> Start
                         </button>`
                  }
                  <button class="btn btn-secondary btn-sm" onclick="websites.openWebhookModal(${site.id})" title="GitHub Auto-Deploy Webhook">
                    <i data-lucide="git-branch" style="width: 13px; height: 13px; margin-right: 3px; color: #a855f7;"></i> CI/CD
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="websites.openEditModal(${site.id})" title="Manage Website Settings">
                    <i data-lucide="sliders" style="width: 13px; height: 13px; margin-right: 3px;"></i> Manage
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="websites.viewLogs(${site.id}, '${site.name}')">
                    <i data-lucide="terminal" style="width: 13px; height: 13px; margin-right: 3px;"></i> Logs
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="websites.openFileManager(${site.id})">
                    <i data-lucide="folder" style="width: 13px; height: 13px; margin-right: 3px;"></i> Files
                  </button>
                  <button class="btn btn-danger btn-sm" onclick="websites.deleteSite(${site.id}, '${site.name}')" title="Delete Website">
                    <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                  </button>
                </div>
              </div>

              <!-- Endpoint Access Links -->
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.07); border-radius: 8px; padding: 10px 14px;" class="flex-between flex-wrap gap-2 text-sm">
                <div class="flex-align gap-3 flex-wrap">
                  ${
                    (site.custom_domain || (site.domain && site.domain.includes('.')))
                      ? `<span style="display: inline-flex; align-items: center; gap: 4px;">
                           <i data-lucide="globe" style="width: 14px; height: 14px; color: #38bdf8;"></i>
                           <strong>Public Domain:</strong>
                           <a href="https://${site.custom_domain || site.domain}" target="_blank" style="color: #38bdf8; text-decoration: underline;"><code>https://${site.custom_domain || site.domain}</code></a>
                         </span>`
                      : ''
                  }
                  <span style="display: inline-flex; align-items: center; gap: 4px;">
                    <i data-lucide="smartphone" style="width: 14px; height: 14px; color: #60a5fa;"></i>
                    <strong>Phone Local:</strong>
                    <a href="http://127.0.0.1:${site.port}" target="_blank" style="color: #60a5fa; text-decoration: underline;"><code>http://127.0.0.1:${site.port}</code></a>
                  </span>
                  ${
                    wifiIp
                      ? `<span style="display: inline-flex; align-items: center; gap: 4px;">
                           <i data-lucide="laptop" style="width: 14px; height: 14px; color: #4ade80;"></i>
                           <strong>PC (Same Wi-Fi):</strong>
                           <a href="http://${wifiIp}:${site.port}" target="_blank" style="color: #4ade80; text-decoration: underline;"><code>http://${wifiIp}:${site.port}</code></a>
                         </span>`
                      : `<span style="display: inline-flex; align-items: center; gap: 4px;">
                           <i data-lucide="laptop" style="width: 14px; height: 14px; color: #94a3b8;"></i>
                           <strong>PC:</strong> <span class="text-muted">Connect phone to Wi-Fi</span>
                         </span>`
                  }
                </div>
                <div class="text-muted text-sm">
                  <span>Entry: <code>${site.entry_file || 'default'}</code></span>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    if (window.lucide) lucide.createIcons();
  },

  async openWebhookModal(siteId) {
    const site = this.list.find((s) => s.id === siteId);
    if (!site) return;

    this.currentWebhookSiteId = siteId;
    document.getElementById('webhook-site-name').textContent = site.name;

    // Fetch existing webhook config
    try {
      const res = await API.get(`/api/webhooks/site/${siteId}`);
      const webhook = res.webhook;

      const host = window.location.origin;
      const urlInput = document.getElementById('webhook-url-input');
      const secretInput = document.getElementById('webhook-secret-input');
      const branchInput = document.getElementById('webhook-branch-input');
      const npmCheck = document.getElementById('webhook-auto-npm');
      const pipCheck = document.getElementById('webhook-auto-pip');

      if (webhook) {
        urlInput.value = `${host}/api/webhooks/deploy/${webhook.token}`;
        secretInput.value = webhook.secret || '';
        branchInput.value = webhook.branch || 'main';
        if (npmCheck) npmCheck.checked = !!webhook.auto_npm;
        if (pipCheck) pipCheck.checked = !!webhook.auto_pip;
      } else {
        urlInput.value = 'Click "Save & Generate Webhook" below to create webhook URL';
        secretInput.value = '';
        branchInput.value = 'main';
        if (npmCheck) npmCheck.checked = true;
        if (pipCheck) pipCheck.checked = true;
      }

      this.loadDeploymentHistory(siteId);
    } catch (_) {}

    document.getElementById('modal-site-webhook').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  async handleSaveWebhook(e) {
    e.preventDefault();
    if (!this.currentWebhookSiteId) return;

    const branch = document.getElementById('webhook-branch-input').value.trim() || 'main';
    const secret = document.getElementById('webhook-secret-input').value.trim();
    const autoNpm = document.getElementById('webhook-auto-npm').checked ? 1 : 0;
    const autoPip = document.getElementById('webhook-auto-pip').checked ? 1 : 0;

    try {
      API.toast('Configuring GitHub Webhook...', 'info');
      const res = await API.post(`/api/webhooks/site/${this.currentWebhookSiteId}`, {
        branch,
        secret,
        autoNpm,
        autoPip
      });
      API.toast('Webhook configured successfully!', 'success');
      this.openWebhookModal(this.currentWebhookSiteId);
    } catch (err) {}
  },

  async triggerManualDeploy() {
    if (!this.currentWebhookSiteId) return;

    try {
      API.toast('Triggering manual deployment...', 'info');
      const res = await API.post(`/api/webhooks/site/${this.currentWebhookSiteId}/trigger`);
      API.toast(res.message || 'Deployment executed!', 'success');
      this.loadDeploymentHistory(this.currentWebhookSiteId);
    } catch (err) {}
  },

  async loadDeploymentHistory(siteId) {
    const listEl = document.getElementById('webhook-deploy-history');
    if (!listEl) return;

    try {
      const history = await API.get(`/api/webhooks/site/${siteId}/deployments`);
      if (!history || history.length === 0) {
        listEl.innerHTML = '<p class="text-muted text-sm">No deployments logged yet. Push code to GitHub or click "Trigger Manual Deploy" above.</p>';
        return;
      }

      listEl.innerHTML = history
        .map(
          (d) => `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px; margin-bottom: 8px;">
            <div class="flex-between flex-wrap gap-1 text-sm">
              <div>
                <span class="badge ${d.status === 'success' ? 'badge-success' : 'badge-danger'}" style="font-size: 11px;">
                  ${d.status.toUpperCase()}
                </span>
                <strong style="margin-left: 6px;">${d.commit_message || 'Deploy'}</strong>
              </div>
              <span class="text-muted text-sm">${new Date(d.created_at).toLocaleString()}</span>
            </div>
            <div class="text-muted text-sm mt-1" style="font-size: 12px;">
              Commit: <code>${d.commit_hash}</code> • Author: <strong>${d.author}</strong>
            </div>
          </div>
        `
        )
        .join('');
    } catch (_) {}
  },

  openEditModal(id) {
    const site = this.list.find((s) => s.id === id);
    if (!site) return;

    this.currentEditingId = id;
    document.getElementById('edit-site-id').value = site.id;
    document.getElementById('edit-site-name').value = site.name;
    document.getElementById('edit-site-type').value = site.type;
    document.getElementById('edit-site-domain').value = site.domain || '';
    document.getElementById('edit-site-port').value = site.port || '';
    document.getElementById('edit-site-entry').value = site.entry_file || '';
    document.getElementById('edit-site-autostart').checked = !!site.autostart;

    document.getElementById('modal-edit-site').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  async handleEdit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-site-id').value;
    const name = document.getElementById('edit-site-name').value.trim();
    const type = document.getElementById('edit-site-type').value;
    const domain = document.getElementById('edit-site-domain').value.trim();
    const port = document.getElementById('edit-site-port').value.trim();
    const entry_file = document.getElementById('edit-site-entry').value.trim();
    const autostart = document.getElementById('edit-site-autostart').checked;

    if (!id || !name) return;

    const btn = document.getElementById('edit-site-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Saving...`;
      if (window.lucide) lucide.createIcons();
    }

    try {
      API.toast('Updating website settings & renaming directory...', 'info');
      const res = await API.put(`/api/websites/${id}`, {
        name,
        type,
        domain,
        port: port ? parseInt(port, 10) : undefined,
        entry_file,
        autostart
      });

      API.toast(res.message || `Website "${name}" updated!`, 'success');
      document.getElementById('modal-edit-site').classList.add('hidden');
      this.loadWebsites();
    } catch (err) {
      // toast shown by API client
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="save" style="width: 14px; height: 14px; margin-right: 4px;"></i> Save & Apply Changes`;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  async handleCreate(e) {
    e.preventDefault();
    const name = document.getElementById('site-name').value;
    const type = document.getElementById('site-type').value;
    const domain = document.getElementById('site-domain').value;
    const entry_file = document.getElementById('site-entry').value;
    const autostart = document.getElementById('site-autostart').checked;

    try {
      await API.post('/api/websites', {
        name,
        type,
        domain,
        entry_file,
        autostart
      });
      API.toast(`Website ${name} created and launched!`, 'success');
      document.getElementById('modal-create-site').classList.add('hidden');
      document.getElementById('create-site-form').reset();
      this.loadWebsites();
    } catch (err) {
      // toast shown by API client
    }
  },

  async startSite(id) {
    try {
      await API.post(`/api/websites/${id}/start`);
      API.toast('Website started', 'success');
      this.loadWebsites();
    } catch (e) {}
  },

  async stopSite(id) {
    try {
      await API.post(`/api/websites/${id}/stop`);
      API.toast('Website stopped', 'info');
      this.loadWebsites();
    } catch (e) {}
  },

  async restartSite(id) {
    try {
      await API.post(`/api/websites/${id}/restart`);
      API.toast('Website restarted', 'success');
      this.loadWebsites();
    } catch (e) {}
  },

  async viewLogs(id, name) {
    try {
      const data = await API.get(`/api/websites/${id}/logs`);
      document.getElementById('site-logs-title').textContent = `${name} Logs`;
      document.getElementById('site-access-log').textContent =
        data.accessLogs.join('\n') || '(No access logs yet)';
      document.getElementById('site-error-log').textContent =
        data.errorLogs.join('\n') || '(No error logs)';
      document.getElementById('modal-site-logs').classList.remove('hidden');
    } catch (e) {}
  },

  openFileManager(id) {
    app.switchTab('filemanager');
    const select = document.getElementById('fm-site-select');
    if (select) {
      select.value = id;
      fileManager.loadFiles();
    }
  },

  async deleteSite(id, name) {
    const confirmed = await UI.confirm(
      `Are you sure you want to delete website "${name}"?\nAll files, databases, and records associated with this website will be permanently removed.`,
      `Delete Website: ${name}`,
      { confirmText: 'Delete Website', cancelText: 'Cancel', type: 'danger' }
    );
    if (!confirmed) return;

    try {
      await API.delete(`/api/websites/${id}`);
      API.toast(`Deleted ${name}`, 'info');
      this.loadWebsites();
    } catch (e) {}
  }
};
