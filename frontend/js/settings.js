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
      document.getElementById('settings-version').textContent = data.version;
      document.getElementById('settings-host').textContent = data.host;
      document.getElementById('settings-port').textContent = data.port;
      document.getElementById('settings-root').textContent = data.rootDir;
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
