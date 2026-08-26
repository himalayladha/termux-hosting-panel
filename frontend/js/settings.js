const settingsManager = {
  init() {
    this.bindEvents();
    this.loadSettings();
  },

  bindEvents() {
    const passwordForm = document.getElementById('change-password-form');
    if (passwordForm) {
      passwordForm.addEventListener('submit', (e) => this.handleChangePassword(e));
    }
  },

  async loadSettings() {
    try {
      const data = await API.get('/api/settings');
      const verEl = document.getElementById('settings-version');
      const hostEl = document.getElementById('settings-host');
      const portEl = document.getElementById('settings-port');
      const rootEl = document.getElementById('settings-root');

      if (verEl && data.version) verEl.textContent = data.version;
      if (hostEl && data.host) hostEl.textContent = `${data.host} (All Interfaces)`;
      if (portEl && data.port) portEl.textContent = data.port;
      if (rootEl && data.rootDir) rootEl.textContent = data.rootDir;

      if (window.lucide) lucide.createIcons();
    } catch (e) {}
  },

  async handleChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;

    try {
      const res = await API.post('/api/settings/password', { currentPassword, newPassword });
      API.toast(res.message || 'Password updated', 'success');
      setTimeout(() => {
        location.reload();
      }, 1000);
    } catch (e) {}
  }
};
