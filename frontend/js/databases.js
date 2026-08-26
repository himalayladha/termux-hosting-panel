const databases = {
  dbList: [],
  currentDbId: null,
  currentTable: null,

  init() {
    this.bindEvents();
    this.loadDatabases();
  },

  bindEvents() {
    const dbSelect = document.getElementById('db-select');
    if (dbSelect) {
      dbSelect.addEventListener('change', (e) => {
        this.currentDbId = e.target.value;
        this.loadTables();
      });
    }

    const runSqlBtn = document.getElementById('db-run-sql-btn');
    if (runSqlBtn) {
      runSqlBtn.addEventListener('click', () => this.runCustomSql());
    }

    const exportBtn = document.getElementById('db-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (this.currentDbId) {
          window.open(`/api/databases/export?dbId=${encodeURIComponent(this.currentDbId)}`, '_blank');
        }
      });
    }

    const deleteBtn = document.getElementById('db-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => this.handleDeleteCurrentDb());
    }

    const openCreateBtn = document.getElementById('open-create-db-btn');
    if (openCreateBtn) {
      openCreateBtn.addEventListener('click', () => this.openCreateModal());
    }

    const createDbForm = document.getElementById('create-db-form');
    if (createDbForm) {
      createDbForm.addEventListener('submit', (e) => this.handleCreateDatabase(e));
    }

    const templateSelect = document.getElementById('db-starter-template');
    if (templateSelect) {
      templateSelect.addEventListener('change', (e) => {
        const descEl = document.getElementById('db-template-desc');
        if (!descEl) return;
        const descriptions = {
          blank: 'Blank SQLite database ready for custom tables.',
          auth_users: 'Pre-creates "users" (username, email, password_hash, role) and "sessions" tables.',
          key_value: 'Pre-creates "key_value_store" (key, value, type) for quick app configuration.',
          blog_cms: 'Pre-creates "posts", "categories", and "comments" with foreign key relations.',
          ecommerce: 'Pre-creates "products", "customers", and "orders" tables.'
        };
        descEl.textContent = descriptions[e.target.value] || '';
      });
    }
  },

  async openCreateModal() {
    const targetSelect = document.getElementById('db-website-target');
    if (targetSelect) {
      try {
        const sites = await API.get('/api/websites');
        targetSelect.innerHTML = `
          <option value="">System Data Directory (data/)</option>
          ${sites.map((s) => `<option value="${s.id}">Website: ${s.name} (~/termux-panel/storage/websites/${s.name}/)</option>`).join('')}
        `;
      } catch (e) {}
    }
    document.getElementById('modal-create-db').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
  },

  async handleCreateDatabase(e) {
    e.preventDefault();
    const websiteId = document.getElementById('db-website-target').value || null;
    const dbName = document.getElementById('new-db-name').value.trim();
    const template = document.getElementById('db-starter-template').value;

    if (!dbName) return;

    try {
      const res = await API.post('/api/databases/create', {
        websiteId,
        dbName,
        template
      });
      API.toast(res.message || 'Database created successfully!', 'success');
      document.getElementById('modal-create-db').classList.add('hidden');
      document.getElementById('create-db-form').reset();
      await this.loadDatabases();
      if (res.dbId) {
        this.currentDbId = res.dbId;
        const select = document.getElementById('db-select');
        if (select) select.value = res.dbId;
        this.loadTables();
      }
    } catch (err) {
      // toast shown by API
    }
  },

  async handleDeleteCurrentDb() {
    if (!this.currentDbId) return;
    if (this.currentDbId === 'panel_db') {
      API.toast('Cannot delete system panel.db', 'warning');
      return;
    }

    const currentDb = this.dbList.find((d) => d.id === this.currentDbId);
    const dbName = currentDb ? currentDb.name : 'this database';

    if (!confirm(`Are you sure you want to permanently delete ${dbName}? This action cannot be undone.`)) {
      return;
    }

    try {
      await API.post('/api/databases/delete', { dbId: this.currentDbId });
      API.toast(`Database deleted successfully`, 'info');
      this.loadDatabases();
    } catch (e) {}
  },

  async loadDatabases() {
    try {
      this.dbList = await API.get('/api/databases');
      const select = document.getElementById('db-select');
      if (!select) return;

      select.innerHTML = this.dbList
        .map((db) => `<option value="${db.id}">${db.name}</option>`)
        .join('');

      if (this.dbList.length > 0) {
        this.currentDbId = this.dbList[0].id;
        this.loadTables();
      } else {
        document.getElementById('db-tables-list').innerHTML = '<li class="text-muted">No databases found</li>';
        document.getElementById('db-results-container').innerHTML = '<p class="text-muted">Click "+ Create Database" above to add one.</p>';
      }
    } catch (err) {
      console.error('Failed to load databases:', err);
    }
  },

  async loadTables() {
    if (!this.currentDbId) return;

    try {
      const tables = await API.get(`/api/databases/tables?dbId=${encodeURIComponent(this.currentDbId)}`);
      const listEl = document.getElementById('db-tables-list');
      if (!listEl) return;

      if (!tables || tables.length === 0) {
        listEl.innerHTML = '<li class="text-muted" style="padding: 10px;">No tables found</li>';
        document.getElementById('db-results-container').innerHTML = `
          <div class="card p-4 text-center">
            <p class="text-muted">Database has no tables yet. Run a <code>CREATE TABLE</code> SQL query above.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = tables
        .map(
          (t) => `
          <li onclick="databases.selectTable('${t.name}')" id="table-btn-${t.name}">
            <div class="flex-align gap-2">
              <i data-lucide="${t.type === 'view' ? 'eye' : 'table'}" style="width: 14px; height: 14px; color: ${t.type === 'view' ? '#a855f7' : '#38bdf8'};"></i>
              <span>${t.name}</span>
            </div>
          </li>
        `
        )
        .join('');

      if (window.lucide) lucide.createIcons();

      // Auto-select first table
      this.selectTable(tables[0].name);
    } catch (e) {}
  },

  async selectTable(tableName) {
    this.currentTable = tableName;
    document.querySelectorAll('#db-tables-list li').forEach((el) => el.classList.remove('active'));
    const activeBtn = document.getElementById(`table-btn-${tableName}`);
    if (activeBtn) activeBtn.classList.add('active');

    try {
      const data = await API.get(
        `/api/databases/data?dbId=${encodeURIComponent(this.currentDbId)}&table=${encodeURIComponent(tableName)}`
      );
      this.renderTableData(tableName, data);
    } catch (e) {}
  },

  renderTableData(tableName, data) {
    const container = document.getElementById('db-results-container');
    if (!container) return;

    if (!data.rows || data.rows.length === 0) {
      container.innerHTML = `
        <div class="flex-between mb-2">
          <h4><i data-lucide="table" style="width: 16px; height: 16px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> ${tableName} (0 rows)</h4>
        </div>
        <p class="text-muted">Table contains no records.</p>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    const columns = Object.keys(data.rows[0]);

    container.innerHTML = `
      <div class="flex-between mb-2 flex-wrap gap-2">
        <h4 style="margin: 0;"><i data-lucide="table" style="width: 16px; height: 16px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> ${tableName} (${data.total} total rows)</h4>
        <span class="text-muted text-sm">Page ${data.page} of ${data.totalPages}</span>
      </div>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.rows
              .map(
                (row) => `
              <tr>
                ${columns.map((c) => `<td>${row[c] !== null ? String(row[c]) : '<em class="text-muted">NULL</em>'}</td>`).join('')}
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  async runCustomSql() {
    const query = document.getElementById('db-sql-input').value;
    if (!query || !query.trim() || !this.currentDbId) return;

    try {
      const result = await API.post('/api/databases/query', {
        dbId: this.currentDbId,
        query
      });

      const container = document.getElementById('db-results-container');
      if (result.type === 'mutation') {
        API.toast(`Query executed successfully! (${result.changes} rows changed)`, 'success');
        container.innerHTML = `
          <div class="alert alert-info">
            <i data-lucide="check-circle" style="width: 16px; height: 16px; margin-right: 6px; display: inline-block; vertical-align: middle;"></i>
            Query executed successfully. Rows affected: ${result.changes}, Last Insert ID: ${result.lastID || 'N/A'}
          </div>
        `;
        this.loadTables();
      } else if (result.type === 'select') {
        if (!result.rows || result.rows.length === 0) {
          container.innerHTML = `<p class="text-muted">Query returned 0 rows.</p>`;
          return;
        }

        const columns = Object.keys(result.rows[0]);
        container.innerHTML = `
          <h4 class="mb-2"><i data-lucide="list" style="width: 16px; height: 16px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Query Result (${result.rowCount} rows)</h4>
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${result.rows
                  .map(
                    (row) => `
                  <tr>
                    ${columns.map((c) => `<td>${row[c] !== null ? String(row[c]) : '<em class="text-muted">NULL</em>'}</td>`).join('')}
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      }
      if (window.lucide) lucide.createIcons();
    } catch (e) {}
  }
};
