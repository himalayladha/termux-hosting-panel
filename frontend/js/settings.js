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

    const notifyForm = document.getElementById('notifications-settings-form');
    if (notifyForm) {
      notifyForm.addEventListener('submit', (e) => this.handleSaveNotifications(e));
    }

    const testTgBtn = document.getElementById('btn-test-telegram');
    if (testTgBtn) {
      testTgBtn.addEventListener('click', () => this.handleTestAlert('telegram'));
    }

    const testDcBtn = document.getElementById('btn-test-discord');
    if (testDcBtn) {
      testDcBtn.addEventListener('click', () => this.handleTestAlert('discord'));
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

      // Load Notification & Hardware Alert Settings
      const notifySettings = await API.get('/api/hardware/notifications/settings');
      if (notifySettings) {
        const tgCheck = document.getElementById('setting-tg-enabled');
        const tgToken = document.getElementById('setting-tg-token');
        const tgChat = document.getElementById('setting-tg-chat');

        const dcCheck = document.getElementById('setting-dc-enabled');
        const dcUrl = document.getElementById('setting-dc-url');

        const alertBat = document.getElementById('setting-alert-battery');
        const alertTherm = document.getElementById('setting-alert-thermal');
        const alertTun = document.getElementById('setting-alert-tunnel');
        const alertCrash = document.getElementById('setting-alert-crash');

        const tempThresh = document.getElementById('setting-temp-threshold');
        const batThresh = document.getElementById('setting-bat-threshold');

        if (tgCheck) tgCheck.checked = !!notifySettings.telegram_enabled;
        if (tgToken) tgToken.value = notifySettings.telegram_bot_token || '';
        if (tgChat) tgChat.value = notifySettings.telegram_chat_id || '';

        if (dcCheck) dcCheck.checked = !!notifySettings.discord_enabled;
        if (dcUrl) dcUrl.value = notifySettings.discord_webhook_url || '';

        if (alertBat) alertBat.checked = !!notifySettings.alert_battery;
        if (alertTherm) alertTherm.checked = !!notifySettings.alert_thermal;
        if (alertTun) alertTun.checked = !!notifySettings.alert_tunnel;
        if (alertCrash) alertCrash.checked = !!notifySettings.alert_crashes;

        if (tempThresh) tempThresh.value = notifySettings.temp_threshold || 42;
        if (batThresh) batThresh.value = notifySettings.battery_threshold || 15;
      }

      if (window.lucide) lucide.createIcons();
    } catch (e) {}
  },

  async handleSaveNotifications(e) {
    e.preventDefault();

    const payload = {
      telegram_enabled: document.getElementById('setting-tg-enabled').checked,
      telegram_bot_token: document.getElementById('setting-tg-token').value.trim(),
      telegram_chat_id: document.getElementById('setting-tg-chat').value.trim(),
      discord_enabled: document.getElementById('setting-dc-enabled').checked,
      discord_webhook_url: document.getElementById('setting-dc-url').value.trim(),
      alert_battery: document.getElementById('setting-alert-battery').checked,
      alert_thermal: document.getElementById('setting-alert-thermal').checked,
      alert_tunnel: document.getElementById('setting-alert-tunnel').checked,
      alert_crashes: document.getElementById('setting-alert-crash').checked,
      temp_threshold: parseInt(document.getElementById('setting-temp-threshold').value, 10) || 42,
      battery_threshold: parseInt(document.getElementById('setting-bat-threshold').value, 10) || 15
    };

    try {
      API.toast('Saving notification & alert settings...', 'info');
      await API.post('/api/hardware/notifications/settings', payload);
      API.toast('Notification & hardware alert settings saved!', 'success');
    } catch (err) {}
  },

  async handleTestAlert(channel) {
    let payload = { channel };

    if (channel === 'telegram') {
      const botToken = document.getElementById('setting-tg-token').value.trim();
      const chatId = document.getElementById('setting-tg-chat').value.trim();
      if (!botToken || !chatId) {
        API.toast('Please enter both Telegram Bot Token and Chat ID to test', 'warning');
        return;
      }
      payload.botToken = botToken;
      payload.chatId = chatId;
    } else if (channel === 'discord') {
      const webhookUrl = document.getElementById('setting-dc-url').value.trim();
      if (!webhookUrl) {
        API.toast('Please enter Discord Webhook URL to test', 'warning');
        return;
      }
      payload.webhookUrl = webhookUrl;
    }

    try {
      API.toast(`Sending test alert to ${channel}...`, 'info');
      const res = await API.post('/api/hardware/notifications/test', payload);
      API.toast(res.message || 'Test alert sent successfully!', 'success');
    } catch (err) {}
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
