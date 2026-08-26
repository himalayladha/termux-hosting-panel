const logsViewer = {
  logsList: [],
  currentLogPath: null,

  init() {
    this.bindEvents();
    this.discoverLogs();
  },

  bindEvents() {
    const logSelect = document.getElementById('log-select');
    if (logSelect) {
      logSelect.addEventListener('change', (e) => {
        this.currentLogPath = e.target.value;
        this.readLog();
      });
    }

    const refreshBtn = document.getElementById('log-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.readLog());
    }

    const searchInput = document.getElementById('log-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.readLog());
    }

    const clearBtn = document.getElementById('log-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearCurrentLog());
    }
  },

  async discoverLogs() {
    try {
      this.logsList = await API.get('/api/logs/list');
      const select = document.getElementById('log-select');
      if (!select) return;

      select.innerHTML = this.logsList
        .map((l) => `<option value="${l.path}">${l.name} (${(l.size / 1024).toFixed(1)} KB)</option>`)
        .join('');

      if (this.logsList.length > 0) {
        this.currentLogPath = this.logsList[0].path;
        this.readLog();
      }
    } catch (e) {}
  },

  async readLog() {
    if (!this.currentLogPath) return;
    const search = document.getElementById('log-search-input').value;

    try {
      const data = await API.get(
        `/api/logs/tail?path=${encodeURIComponent(this.currentLogPath)}&lines=200&search=${encodeURIComponent(search)}`
      );

      const contentEl = document.getElementById('log-content');
      if (contentEl) {
        contentEl.textContent = data.lines.join('\n') || '(Log file is currently empty)';
      }
    } catch (e) {}
  },

  async clearCurrentLog() {
    if (!this.currentLogPath) return;
    const confirmed = await UI.confirm(
      'Are you sure you want to clear all contents of this log file?',
      'Clear Log File',
      { confirmText: 'Clear Log', cancelText: 'Cancel', type: 'danger' }
    );
    if (!confirmed) return;

    try {
      await API.post('/api/logs/clear', { path: this.currentLogPath });
      API.toast('Log file cleared', 'info');
      this.readLog();
    } catch (e) {}
  }
};
