const settingsManager = {
  init() {
    this.bindEvents();
    this.loadSettings();
    this.loadSecurity();
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

    // 2FA Setup
    const btnStart2FA = document.getElementById('btn-start-2fa-setup');
    if (btnStart2FA) {
      btnStart2FA.addEventListener('click', () => this.start2FASetup());
    }

    const form2FAVerify = document.getElementById('form-2fa-verify-enable');
    if (form2FAVerify) {
      form2FAVerify.addEventListener('submit', (e) => this.handleVerifyEnable2FA(e));
    }

    const btnDisable2FA = document.getElementById('btn-disable-2fa');
    if (btnDisable2FA) {
      btnDisable2FA.addEventListener('click', () => this.handleDisable2FA());
    }

    // Cloudflare Access
    const cfAccessForm = document.getElementById('cloudflare-access-form');
    if (cfAccessForm) {
      cfAccessForm.addEventListener('submit', (e) => this.handleApplyCloudflareAccess(e));
    }

    // Clear All Bans
    const btnClearBans = document.getElementById('btn-clear-all-bans');
    if (btnClearBans) {
      btnClearBans.addEventListener('click', () => this.handleClearAllBans());
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

  async loadSecurity() {
    try {
      const sec = await API.get('/api/security/status');
      if (sec) {
        // 2FA Status
        const badge2FA = document.getElementById('badge-2fa-status');
        const contDisabled = document.getElementById('container-2fa-disabled');
        const contEnabled = document.getElementById('container-2fa-enabled');

        if (sec.twoFA && sec.twoFA.isEnabled) {
          if (badge2FA) {
            badge2FA.textContent = 'ACTIVE (2FA ENABLED)';
            badge2FA.className = 'badge badge-success';
          }
          if (contDisabled) contDisabled.classList.add('hidden');
          if (contEnabled) contEnabled.classList.remove('hidden');
        } else {
          if (badge2FA) {
            badge2FA.textContent = 'DISABLED';
            badge2FA.className = 'badge badge-secondary';
          }
          if (contDisabled) contDisabled.classList.remove('hidden');
          if (contEnabled) contEnabled.classList.add('hidden');
        }

        // Cloudflare Access
        const cfBadge = document.getElementById('badge-cf-access-status');
        const cfEmailsInput = document.getElementById('cf-access-emails');
        if (sec.cloudflareAccess && sec.cloudflareAccess.isConfigured) {
          if (cfBadge) {
            cfBadge.textContent = 'ZERO TRUST ACTIVE';
            cfBadge.className = 'badge badge-success';
          }
          if (cfEmailsInput && sec.cloudflareAccess.allowedEmails) {
            cfEmailsInput.value = sec.cloudflareAccess.allowedEmails.join(', ');
          }
        }

        // IP Bans Count
        const bansCountBadge = document.getElementById('badge-active-bans-count');
        if (bansCountBadge) {
          bansCountBadge.textContent = `${sec.activeBansCount} BANNED`;
          bansCountBadge.className = sec.activeBansCount > 0 ? 'badge badge-danger' : 'badge badge-secondary';
        }
      }

      await this.loadIpBans();
    } catch (e) {}
  },

  async start2FASetup() {
    try {
      API.toast('Generating 2FA Authenticator secret...', 'info');
      const res = await API.post('/api/security/2fa/setup');

      const qrImg = document.getElementById('qr-code-img');
      const manualKey = document.getElementById('manual-2fa-secret');
      const backupDisplay = document.getElementById('backup-codes-display');
      const verifyInput = document.getElementById('input-2fa-verify-code');

      if (qrImg) qrImg.src = res.qrCodeUrl;
      if (manualKey) manualKey.textContent = res.secret;
      if (verifyInput) verifyInput.value = '';

      if (backupDisplay && res.backupCodes) {
        backupDisplay.innerHTML = res.backupCodes
          .map((code) => `<div style="background: rgba(168, 85, 247, 0.1); border-radius: 4px; padding: 4px 6px;"><code>${code}</code></div>`)
          .join('');
      }

      document.getElementById('modal-2fa-setup').classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    } catch (err) {}
  },

  async handleVerifyEnable2FA(e) {
    e.preventDefault();
    const code = document.getElementById('input-2fa-verify-code').value.trim();
    if (!code) return;

    try {
      const res = await API.post('/api/security/2fa/enable', { code });
      document.getElementById('modal-2fa-setup').classList.add('hidden');
      API.toast(res.message || '2FA Enabled successfully!', 'success');
      this.loadSecurity();
    } catch (err) {}
  },

  async handleDisable2FA() {
    const password = await UI.prompt('Enter your current administrator password to disable Two-Factor Authentication:', 'Disable 2FA', '', 'Password');
    if (!password) return;

    try {
      const res = await API.post('/api/security/2fa/disable', { password });
      API.toast(res.message || '2FA has been disabled', 'info');
      this.loadSecurity();
    } catch (err) {}
  },

  async handleApplyCloudflareAccess(e) {
    e.preventDefault();
    const emailsInput = document.getElementById('cf-access-emails').value.trim();
    if (!emailsInput) {
      API.toast('Please enter at least one authorized administrator email address', 'warning');
      return;
    }

    try {
      API.toast('Deploying Cloudflare Access Policy to edge...', 'info');
      const tunnelStatus = await API.get('/api/tunnel/status');
      const domain = tunnelStatus.recommendedRoutes && tunnelStatus.recommendedRoutes.length > 0 && tunnelStatus.recommendedRoutes[0].hostname.includes('.')
        ? tunnelStatus.recommendedRoutes[0].hostname.split('.').slice(-2).join('.')
        : '';

      const res = await API.post('/api/security/cloudflare-access', {
        allowedEmails: emailsInput,
        domain: domain || 'example.com'
      });
      API.toast(res.message || 'Cloudflare Access Policy deployed!', 'success');
      this.loadSecurity();
    } catch (err) {}
  },

  async loadIpBans() {
    const container = document.getElementById('ip-bans-table-container');
    if (!container) return;

    try {
      const bans = await API.get('/api/security/ip-bans');
      if (!bans || bans.length === 0) {
        container.innerHTML = `
          <div class="p-3 text-center" style="background: rgba(34, 197, 94, 0.04); border-radius: 8px; border: 1px dashed rgba(34, 197, 94, 0.2);">
            <span style="color: #4ade80; font-size: 13.5px;">✓ No blocked IP addresses. All client requests are within normal rate limits.</span>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Reason</th>
                <th>Violations</th>
                <th>Status / Duration</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${bans
                .map((b) => `
                <tr>
                  <td><code>${b.ip}</code></td>
                  <td><span class="text-sm">${b.reason}</span></td>
                  <td><span class="badge badge-secondary">${b.failed_attempts} attempts</span></td>
                  <td>
                    <span class="badge ${b.isActive ? 'badge-danger' : 'badge-secondary'}">
                      ${b.isActive ? `BANNED (${b.remainingFormatted})` : 'EXPIRED'}
                    </span>
                  </td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="settingsManager.handleUnbanIp('${b.ip}')">
                      <i data-lucide="unlock" style="width: 12px; height: 12px; margin-right: 3px;"></i> Unban
                    </button>
                  </td>
                </tr>
              `)
                .join('')}
            </tbody>
          </table>
        </div>
      `;

      if (window.lucide) lucide.createIcons();
    } catch (e) {
      container.innerHTML = '<p class="text-muted text-sm">Failed to load IP bans table</p>';
    }
  },

  async handleUnbanIp(ip) {
    try {
      const res = await API.post('/api/security/ip-bans/unban', { ip });
      API.toast(res.message || `Unbanned IP ${ip}`, 'success');
      this.loadSecurity();
    } catch (err) {}
  },

  async handleClearAllBans() {
    const confirmed = await UI.confirm('Are you sure you want to clear all active IP bans?', 'Clear IP Jail');
    if (!confirmed) return;

    try {
      const res = await API.post('/api/security/ip-bans/clear');
      API.toast(res.message || 'All IP bans cleared', 'success');
      this.loadSecurity();
    } catch (err) {}
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
