const app = {
  currentUser: null,

  init() {
    this.bindGlobalEvents();
    this.checkAuthStatus();
  },

  bindGlobalEvents() {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        this.switchTab(tab);
        // On mobile, close sidebar after clicking nav item
        const sidebarEl = document.getElementById('sidebar');
        const backdropEl = document.getElementById('sidebar-backdrop');
        if (sidebarEl) sidebarEl.classList.remove('open');
        if (backdropEl) backdropEl.classList.remove('active');
      });
    });

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const closeBtn = document.getElementById('sidebar-close-btn');
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    if (toggleBtn && sidebar && backdrop) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        backdrop.classList.add('active');
      });
    }
    if (closeBtn && sidebar && backdrop) {
      closeBtn.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
      });
    }
    if (backdrop && sidebar) {
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('active');
      });
    }

    // Modal close buttons & backdrop clicking
    document.querySelectorAll('.modal-close-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.add('hidden');
      });
    });

    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && overlay.id !== 'modal-app-dialog') {
          overlay.classList.add('hidden');
        }
      });
    });

    // Setup form submit
    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
      setupForm.addEventListener('submit', (e) => this.handleSetup(e));
    }

    // Login form submit
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }
  },

  async checkAuthStatus() {
    try {
      const status = await API.get('/api/auth/status');
      if (!status.initialized) {
        // Needs first-time setup
        this.showSetupModal();
      } else {
        // Check if existing session is valid
        try {
          const me = await API.get('/api/auth/me');
          this.currentUser = me.user;
          this.showApp();
        } catch (e) {
          this.showAuthModal(true);
        }
      }
    } catch (err) {
      console.error('Failed to check auth status:', err);
    }
  },

  showSetupModal() {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('setup-form').classList.remove('hidden');
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('auth-title').textContent = 'TermuxPanel Setup';
    document.getElementById('auth-subtitle').textContent = 'Create Primary Admin Account';
    if (window.lucide) lucide.createIcons();
  },

  showAuthModal(isInitialized = true) {
    document.getElementById('auth-container').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('setup-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
    document.getElementById('auth-title').textContent = 'TermuxPanel';
    document.getElementById('auth-subtitle').textContent = 'Sign in to your control panel';
    if (window.lucide) lucide.createIcons();
  },

  showApp() {
    document.getElementById('auth-container').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');

    if (this.currentUser) {
      const nameEl = document.getElementById('nav-username');
      if (nameEl) nameEl.textContent = this.currentUser.username;
    }

    // Initialize all modules
    dashboard.init();
    websites.init();
    catalogManager.init();
    domainsManager.init();
    fileManager.init();
    databases.init();
    cronManager.init();
    logsViewer.init();
    backupsManager.init();
    tunnelManager.init();
    terminalManager.init();
    settingsManager.init();

    this.switchTab('dashboard');
    if (window.lucide) lucide.createIcons();
  },

  async handleSetup(e) {
    e.preventDefault();
    const username = document.getElementById('setup-username').value;
    const email = document.getElementById('setup-email').value;
    const password = document.getElementById('setup-password').value;

    try {
      const data = await API.post('/api/auth/setup', { username, email, password });
      API.toast('Admin account created! Welcome to TermuxPanel.', 'success');
      this.currentUser = data.user;
      this.showApp();
    } catch (e) {}
  },

  async handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const data = await API.post('/api/auth/login', { username, password });
      API.toast('Logged in successfully', 'success');
      this.currentUser = data.user;
      this.showApp();
    } catch (e) {}
  },

  async handleLogout() {
    try {
      await API.post('/api/auth/logout');
      API.toast('Logged out', 'info');
      this.currentUser = null;
      this.showAuthModal(true);
    } catch (e) {}
  },

  switchTab(tabId) {
    // Hide all views
    document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));

    const targetView = document.getElementById(`view-${tabId}`);
    const targetNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);

    if (targetView) targetView.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    const titles = {
      dashboard: 'Dashboard',
      websites: 'Websites & Applications',
      catalog: '1-Click App Catalog',
      domains: 'Custom Domain Management',
      filemanager: 'File Manager',
      databases: 'SQLite Database Explorer',
      cron: 'Scheduled Cron Jobs',
      terminal: 'In-Browser Web Terminal',
      logs: 'System & Application Logs',
      backups: 'Backups & Archives',
      tunnel: 'Cloudflare Zero Trust Tunnel',
      settings: 'Server Settings'
    };

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[tabId] || 'TermuxPanel';

    // Trigger tab-specific refresh
    if (tabId === 'dashboard') dashboard.loadSummary();
    if (tabId === 'websites') websites.loadWebsites();
    if (tabId === 'catalog') catalogManager.loadCatalog();
    if (tabId === 'domains') domainsManager.loadDomains();
    if (tabId === 'filemanager') fileManager.populateSiteSelector();
    if (tabId === 'databases') databases.loadDatabases();
    if (tabId === 'cron') cronManager.loadJobs();
    if (tabId === 'terminal') terminalManager.openTerminal();
    if (tabId === 'logs') logsViewer.discoverLogs();
    if (tabId === 'backups') backupsManager.loadBackups();
    if (tabId === 'tunnel') tunnelManager.loadStatus();
    if (tabId === 'settings') settingsManager.loadSettings();

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 50);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
