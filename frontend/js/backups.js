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
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center">No backups created yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.backupsList
      .map(
        (b) => `
        <tr>
          <td><strong>📦 ${b.filename}</strong></td>
          <td class="text-muted">${b.sizeFormatted}</td>
          <td class="text-muted text-sm">${new Date(b.createdAt).toLocaleString()}</td>
          <td>
            <div class="flex-align gap-2">
              <a href="/api/backups/download/${encodeURIComponent(b.filename)}" class="btn btn-secondary btn-sm" download>⬇ Download</a>
              <button class="btn btn-danger btn-sm" onclick="backupsManager.deleteBackup('${b.filename}')">🗑</button>
            </div>
          </td>
        </tr>
      `
      )
      .join('');
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

  async deleteBackup(filename) {
    if (!confirm(`Delete backup archive "${filename}"?`)) return;

    try {
      await API.delete(`/api/backups/${encodeURIComponent(filename)}`);
      API.toast('Backup deleted', 'info');
      this.loadBackups();
    } catch (e) {}
  }
};
