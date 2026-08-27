const packagesManager = {
  currentWebsiteId: null,
  currentType: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const form = document.getElementById('pkg-install-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleInstall(e));
    }

    const updateAllBtn = document.getElementById('pkg-update-all-btn');
    if (updateAllBtn) {
      updateAllBtn.addEventListener('click', () => this.handleUpdateAll());
    }
  },

  async openModal(siteId, siteName, siteType) {
    this.currentWebsiteId = siteId;
    this.currentType = siteType;

    const modal = document.getElementById('modal-packages');
    if (!modal) return;

    document.getElementById('pkg-site-name').textContent = siteName || 'Website';
    const typeBadge = document.getElementById('pkg-type-badge');
    if (typeBadge) {
      typeBadge.textContent = siteType.toUpperCase();
      typeBadge.className = siteType === 'node' ? 'badge badge-primary' : 'badge badge-success';
    }

    const input = document.getElementById('pkg-name-input');
    if (input) {
      input.placeholder = siteType === 'node' ? 'e.g. express, axios, cors, sqlite3' : 'e.g. fastapi, requests, uvicorn, flask';
      input.value = '';
    }

    modal.classList.remove('hidden');
    await this.loadPackages();
  },

  async loadPackages() {
    const listEl = document.getElementById('pkg-list-body');
    if (!listEl || !this.currentWebsiteId) return;

    listEl.innerHTML = `<tr><td colspan="4" class="text-center p-3 text-muted"><i data-lucide="loader" style="width: 16px; height: 16px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Scanning dependencies...</td></tr>`;
    if (window.lucide) lucide.createIcons();

    try {
      const data = await API.get(`/api/packages/${this.currentWebsiteId}`);

      if (!data.packages || data.packages.length === 0) {
        listEl.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-muted">${data.message || 'No packages installed yet. Use the install box above.'}</td></tr>`;
        return;
      }

      listEl.innerHTML = data.packages
        .map(
          (pkg) => `
          <tr>
            <td>
              <strong style="color: #f1f5f9;">${pkg.name}</strong>
              ${pkg.isDev ? '<span class="badge badge-secondary" style="font-size: 10px; margin-left: 4px;">DEV</span>' : ''}
            </td>
            <td><code>${pkg.declaredVersion || '*'}</code></td>
            <td>
              <span class="badge ${pkg.status === 'installed' ? 'badge-success' : 'badge-danger'}" style="font-size: 11px;">
                ${pkg.installedVersion || 'Missing'}
              </span>
            </td>
            <td style="text-align: right;">
              <button class="btn btn-danger btn-sm" onclick="packagesManager.handleUninstall('${pkg.name}')" title="Uninstall package">
                <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
              </button>
            </td>
          </tr>
        `
        )
        .join('');

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      listEl.innerHTML = `<tr><td colspan="4" class="text-center p-3 text-danger">Failed to load packages: ${err.message}</td></tr>`;
    }
  },

  async handleInstall(e) {
    e.preventDefault();
    if (!this.currentWebsiteId) return;

    const input = document.getElementById('pkg-name-input');
    const isDevCheck = document.getElementById('pkg-is-dev');
    const pkgName = input ? input.value.trim() : '';

    if (!pkgName) return;

    const btn = document.getElementById('pkg-install-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Installing...`;
      if (window.lucide) lucide.createIcons();
    }

    try {
      API.toast(`Installing ${pkgName}... (this may take a few seconds)`, 'info');
      const res = await API.post(`/api/packages/${this.currentWebsiteId}/install`, {
        packageName: pkgName,
        isDev: isDevCheck ? isDevCheck.checked : false
      });

      API.toast(res.message || `Installed ${pkgName}!`, 'success');
      if (input) input.value = '';
      await this.loadPackages();
    } catch (err) {
      // Toast displayed by API client
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="download" style="width: 14px; height: 14px; margin-right: 4px;"></i> Install`;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  async handleUninstall(pkgName) {
    if (!this.currentWebsiteId || !pkgName) return;

    const confirmed = await UI.confirm(
      `Are you sure you want to uninstall package "${pkgName}"?`,
      'Uninstall Package',
      { confirmText: 'Uninstall', cancelText: 'Cancel', type: 'danger' }
    );
    if (!confirmed) return;

    try {
      API.toast(`Uninstalling ${pkgName}...`, 'info');
      const res = await API.post(`/api/packages/${this.currentWebsiteId}/uninstall`, {
        packageName: pkgName
      });
      API.toast(res.message || `Uninstalled ${pkgName}`, 'info');
      await this.loadPackages();
    } catch (err) {}
  },

  async handleUpdateAll() {
    if (!this.currentWebsiteId) return;

    const btn = document.getElementById('pkg-update-all-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width: 13px; height: 13px; margin-right: 3px;"></i> Updating...`;
      if (window.lucide) lucide.createIcons();
    }

    try {
      API.toast('Updating all project dependencies...', 'info');
      const res = await API.post(`/api/packages/${this.currentWebsiteId}/update-all`);
      API.toast(res.message || 'Dependencies updated successfully!', 'success');
      await this.loadPackages();
    } catch (err) {
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="refresh-cw" style="width: 13px; height: 13px; margin-right: 3px;"></i> Update All`;
        if (window.lucide) lucide.createIcons();
      }
    }
  }
};
