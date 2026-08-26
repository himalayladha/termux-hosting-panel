const cronManager = {
  jobs: [],

  init() {
    this.bindEvents();
    this.loadJobs();
  },

  bindEvents() {
    const openBtn = document.getElementById('open-create-cron-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        document.getElementById('modal-create-cron').classList.remove('hidden');
      });
    }

    const presetSelect = document.getElementById('cron-preset');
    const exprInput = document.getElementById('cron-expression');
    if (presetSelect && exprInput) {
      presetSelect.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
          exprInput.value = e.target.value;
        }
      });
    }

    const createForm = document.getElementById('create-cron-form');
    if (createForm) {
      createForm.addEventListener('submit', (e) => this.handleCreate(e));
    }
  },

  async loadJobs() {
    try {
      this.jobs = await API.get('/api/cron');
      this.renderJobs();
    } catch (e) {}
  },

  renderJobs() {
    const tbody = document.getElementById('cron-table-body');
    if (!tbody) return;

    if (!this.jobs || this.jobs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-muted text-center" style="padding: 24px;">No cron jobs configured yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.jobs
      .map(
        (job) => `
        <tr>
          <td><strong>${job.name}</strong></td>
          <td><code>${job.expression}</code></td>
          <td><code>${job.command}</code></td>
          <td>
            ${
              job.last_status
                ? `<span class="badge ${job.last_status === 'success' ? 'badge-success' : 'badge-danger'}">${job.last_status}</span>`
                : '<span class="text-muted">Never</span>'
            }
          </td>
          <td>
            <input type="checkbox" ${job.enabled ? 'checked' : ''} onchange="cronManager.toggleJob(${job.id}, this.checked)">
          </td>
          <td>
            <div class="flex-align gap-2">
              <button class="btn btn-secondary btn-sm" onclick="cronManager.runJobNow(${job.id})" title="Run job immediately">
                <i data-lucide="play" style="width: 13px; height: 13px; margin-right: 3px;"></i> Run
              </button>
              <button class="btn btn-danger btn-sm" onclick="cronManager.deleteJob(${job.id})" title="Delete job">
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
    const name = document.getElementById('cron-name').value;
    const expression = document.getElementById('cron-expression').value;
    const command = document.getElementById('cron-command').value;

    try {
      await API.post('/api/cron', { name, expression, command });
      API.toast('Cron job created', 'success');
      document.getElementById('modal-create-cron').classList.add('hidden');
      document.getElementById('create-cron-form').reset();
      this.loadJobs();
    } catch (e) {}
  },

  async toggleJob(id, enabled) {
    try {
      await API.put(`/api/cron/${id}/toggle`, { enabled });
      API.toast(`Cron job ${enabled ? 'enabled' : 'disabled'}`, 'info');
      this.loadJobs();
    } catch (e) {}
  },

  async runJobNow(id) {
    try {
      const result = await API.post(`/api/cron/${id}/run`);
      if (result.success) {
        API.toast('Job completed successfully', 'success');
      } else {
        API.toast(`Job failed: ${result.error}`, 'error');
      }
      this.loadJobs();
    } catch (e) {}
  },

  async deleteJob(id) {
    const confirmed = await UI.confirm(
      'Are you sure you want to delete this scheduled cron job?',
      'Delete Cron Job',
      { confirmText: 'Delete Job', cancelText: 'Cancel', type: 'danger' }
    );
    if (!confirmed) return;
    try {
      await API.delete(`/api/cron/${id}`);
      API.toast('Cron job deleted', 'info');
      this.loadJobs();
    } catch (e) {}
  }
};
