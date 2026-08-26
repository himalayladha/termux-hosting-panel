const catalogManager = {
  apps: [],
  selectedApp: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const deployForm = document.getElementById('deploy-catalog-form');
    if (deployForm) {
      deployForm.addEventListener('submit', (e) => this.handleDeploy(e));
    }
  },

  async loadCatalog() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;

    try {
      this.apps = await API.get('/api/catalog');
      this.renderCatalog();
    } catch (err) {
      grid.innerHTML = `<p class="text-danger">Failed to load App Catalog: ${err.message}</p>`;
    }
  },

  renderCatalog() {
    const grid = document.getElementById('catalog-grid');
    if (!grid) return;

    if (!this.apps || this.apps.length === 0) {
      grid.innerHTML = '<p class="text-muted">No apps available in catalog.</p>';
      return;
    }

    grid.innerHTML = this.apps
      .map(
        (app) => `
        <div class="card" style="border-top: 3px solid ${app.color || '#38bdf8'}; display: flex; flex-direction: column; justify-content: space-between;">
          <div class="card-body">
            <div class="flex-between flex-wrap gap-2 mb-2">
              <div class="flex-align gap-2">
                <div style="background: rgba(255,255,255,0.06); padding: 8px; border-radius: 8px; color: ${app.color || '#38bdf8'}; display: flex; align-items: center; justify-content: center;">
                  <i data-lucide="${app.icon || 'box'}" style="width: 22px; height: 22px;"></i>
                </div>
                <div>
                  <h4 style="margin: 0; font-size: 16px;">${app.name}</h4>
                  <span class="text-muted text-sm">${app.category}</span>
                </div>
              </div>
              <span class="badge" style="background: rgba(255,255,255,0.08); color: ${app.color || '#38bdf8'};">${app.badge}</span>
            </div>
            <p class="text-muted text-sm mt-3" style="line-height: 1.6; min-height: 48px;">
              ${app.description}
            </p>
          </div>
          <div class="card-footer p-3 bg-darker flex-between">
            <span class="badge badge-secondary">${app.type.toUpperCase()} RUNTIME</span>
            <button class="btn btn-primary btn-sm" onclick="catalogManager.openDeployModal('${app.id}')">
              <i data-lucide="rocket" style="width: 13px; height: 13px; margin-right: 4px;"></i> 1-Click Deploy
            </button>
          </div>
        </div>
      `
      )
      .join('');

    if (window.lucide) lucide.createIcons();
  },

  openDeployModal(appId) {
    const appDef = this.apps.find((a) => a.id === appId);
    if (!appDef) return;

    this.selectedApp = appDef;
    document.getElementById('deploy-app-id').value = appDef.id;
    document.getElementById('deploy-app-title').textContent = `Deploy ${appDef.name}`;
    document.getElementById('deploy-site-name').value = `${appDef.id}-${Math.floor(100 + Math.random() * 900)}`;
    document.getElementById('deploy-site-domain').value = '';

    document.getElementById('modal-deploy-catalog').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  async handleDeploy(e) {
    e.preventDefault();
    const appId = document.getElementById('deploy-app-id').value;
    const name = document.getElementById('deploy-site-name').value.trim();
    const domain = document.getElementById('deploy-site-domain').value.trim();

    if (!appId || !name) return;

    const btn = document.getElementById('btn-submit-catalog-deploy');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Provisioning & Launching...`;
      if (window.lucide) lucide.createIcons();
    }

    try {
      API.toast(`Deploying ${name}...`, 'info');
      const res = await API.post('/api/catalog/deploy', { appId, name, domain });
      API.toast(res.message || 'App deployed successfully!', 'success');
      document.getElementById('modal-deploy-catalog').classList.add('hidden');
      app.switchTab('websites');
    } catch (err) {
      // toast shown by API client
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="rocket" style="width: 14px; height: 14px; margin-right: 4px;"></i> Deploy & Launch`;
        if (window.lucide) lucide.createIcons();
      }
    }
  }
};
