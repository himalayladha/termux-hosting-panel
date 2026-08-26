const websites = {
  list: [],

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
              <i data-lucide="plus" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Create Your First Website
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
                           <i data-lucide="external-link" style="width: 13px; height: 13px; margin-right: 4px;"></i> Open Website
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
