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
        listEl.innerHTML = '<li class="text-muted">No tables found</li>';
        document.getElementById('db-results-container').innerHTML = '<p class="text-muted">Database is empty.</p>';
        return;
      }

      listEl.innerHTML = tables
        .map(
          (t) => `
          <li onclick="databases.selectTable('${t.name}')" id="table-btn-${t.name}">
            <span>${t.type === 'view' ? '👁️' : '📋'} ${t.name}</span>
          </li>
        `
        )
        .join('');

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
      container.innerHTML = `<h4>${tableName} (0 rows)</h4><p class="text-muted">Table contains no records.</p>`;
      return;
    }

    const columns = Object.keys(data.rows[0]);

    container.innerHTML = `
      <div class="flex-between mb-2">
        <h4>${tableName} (${data.total} total rows)</h4>
        <span class="text-muted text-sm">Page ${data.page} of ${data.totalPages}</span>
      </div>
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
    `;
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
        container.innerHTML = `<div class="alert alert-info">Query executed. Rows affected: ${result.changes}, Last Insert ID: ${result.lastID || 'N/A'}</div>`;
        this.loadTables();
      } else if (result.type === 'select') {
        if (!result.rows || result.rows.length === 0) {
          container.innerHTML = `<p class="text-muted">Query returned 0 rows.</p>`;
          return;
        }

        const columns = Object.keys(result.rows[0]);
        container.innerHTML = `
          <h4>Query Result (${result.rowCount} rows)</h4>
          <table class="table mt-2">
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
        `;
      }
    } catch (e) {}
  }
};
