const backupsManager = {
  backupsList: [],

  init() {
    this.bindEvents();
    this.loadBackups();
  },

  bindEvents() {
    const openBtn = document.getElementById('open-create-backup-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        document.getElementById('modal-create-backup').classList.remove('hidden');
      });
    }

    const form = document.getElementById('create-backup-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleCreate(e));
    }

    const pruneBtn = document.getElementById('btn-prune-backups');
    if (pruneBtn) {
      pruneBtn.addEventListener('click', () => this.pruneOldBackups());
    }

    const autoBackupBtn = document.getElementById('btn-auto-backup');
    if (autoBackupBtn) {
      autoBackupBtn.addEventListener('click', () => this.triggerAutoBackup());
    }
  },

  async loadBackups() {
    try {
      this.backupsList = await API.get('/api/backups');
      this.renderBackups();
    } catch (e) {}
  },

  renderBackups() {
    const tbody = document.getElementById('backups-table-body');
    if (!tbody) return;

    if (!this.backupsList || this.backupsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center" style="padding: 24px;">No backups created yet. Click "+ Create Backup" to generate one.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.backupsList
      .map(
        (b) => `
        <tr>
          <td>
            <div class="flex-align gap-2">
              <i data-lucide="archive" style="width: 16px; height: 16px; color: #38bdf8;"></i>
              <strong>${b.filename}</strong>
            </div>
          </td>
          <td class="text-muted">${b.sizeFormatted}</td>
          <td class="text-muted text-sm">${new Date(b.createdAt).toLocaleString()}</td>
          <td>
            <div class="flex-align gap-2 flex-wrap">
              <button class="btn btn-secondary btn-sm" onclick="backupsManager.sendToTelegram('${b.filename}')" title="Send archive to Telegram Cloud Channel">
                <i data-lucide="send" style="width: 13px; height: 13px; margin-right: 3px; color: #38bdf8;"></i> Telegram Cloud
              </button>
              <a href="/api/backups/download/${encodeURIComponent(b.filename)}" class="btn btn-secondary btn-sm" download style="display: inline-flex; align-items: center;">
                <i data-lucide="download" style="width: 13px; height: 13px; margin-right: 3px;"></i> Download
              </a>
              <button class="btn btn-danger btn-sm" onclick="backupsManager.deleteBackup('${b.filename}')" title="Delete backup">
                <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
              </button>
            </div>
          </td>
        </tr>
      `
      )
      .join('');

    if (window.lucide) lucide.createIcons();
  },

  async handleCreate(e) {
    e.preventDefault();
    const type = document.getElementById('backup-type').value;

    try {
      API.toast('Generating backup archive...', 'info');
      await API.post('/api/backups/create', { type });
      API.toast('Backup archive created successfully!', 'success');
      document.getElementById('modal-create-backup').classList.add('hidden');
      this.loadBackups();
    } catch (e) {}
  },

  async sendToTelegram(filename) {
    try {
      API.toast(`Uploading ${filename} to Telegram Cloud...`, 'info');
      const res = await API.post('/api/backups/send-telegram', { filename });
      API.toast(res.message || 'Dispatched to Telegram!', 'success');
    } catch (err) {}
  },

  async pruneOldBackups() {
    const confirmed = await UI.confirm(
      'Automatically prune backups older than 7 days to free storage?',
      'Prune Old Backups',
      { confirmText: 'Prune', cancelText: 'Cancel' }
    );
    if (!confirmed) return;

    try {
      API.toast('Pruning old archives...', 'info');
      const res = await API.post('/api/backups/prune', { retentionDays: 7 });
      API.toast(`Pruned ${res.pruned} old backup(s). ${res.remaining} remaining.`, 'success');
      this.loadBackups();
    } catch (e) {}
  },

  async triggerAutoBackup() {
    try {
      API.toast('Running automated full backup & cloud sync...', 'info');
      const res = await API.post('/api/backups/auto-backup');
      API.toast(`Auto-backup complete (${res.backup ? res.backup.filename : 'done'})!`, 'success');
      this.loadBackups();
    } catch (e) {}
  },

  async deleteBackup(filename) {
    const confirmed = await UI.confirm(
      `Are you sure you want to permanently delete backup archive "${filename}"?`,
      'Delete Backup Archive',
      { confirmText: 'Delete Backup', cancelText: 'Cancel', type: 'danger' }
    );
    if (!confirmed) return;

    try {
      await API.delete(`/api/backups/${encodeURIComponent(filename)}`);
      API.toast('Backup deleted', 'info');
      this.loadBackups();
    } catch (e) {}
  }
};
