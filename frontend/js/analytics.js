const analyticsManager = {
  currentWebsiteId: null,
  currentRange: '24h',
  livePollInterval: null,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const siteSelect = document.getElementById('analytics-site-select');
    if (siteSelect) {
      siteSelect.addEventListener('change', (e) => {
        this.currentWebsiteId = e.target.value ? parseInt(e.target.value, 10) : null;
        this.loadAnalytics();
      });
    }

    const rangeBtns = document.querySelectorAll('.analytics-range-btn');
    rangeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        rangeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentRange = btn.getAttribute('data-range') || '24h';
        this.loadAnalytics();
      });
    });

    const refreshBtn = document.getElementById('analytics-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadAnalytics());
    }
  },

  async onTabActive() {
    await this.populateWebsiteDropdown();
    await this.loadAnalytics();
    this.startLivePolling();
  },

  onTabInactive() {
    this.stopLivePolling();
  },

  async populateWebsiteDropdown() {
    const siteSelect = document.getElementById('analytics-site-select');
    if (!siteSelect) return;

    try {
      const sites = await API.get('/api/websites');
      const currentVal = siteSelect.value;
      siteSelect.innerHTML = `<option value="">All Websites (${sites.length})</option>` +
        sites.map((s) => `<option value="${s.id}">${s.name} (:${s.port})</option>`).join('');
      if (currentVal) siteSelect.value = currentVal;
    } catch (_) {}
  },

  async loadAnalytics() {
    const query = new URLSearchParams();
    if (this.currentWebsiteId) query.append('websiteId', this.currentWebsiteId);
    query.append('range', this.currentRange);

    try {
      const [summary, topPaths, hourly] = await Promise.all([
        API.get(`/api/analytics/summary?${query.toString()}`),
        API.get(`/api/analytics/top-paths?${query.toString()}&limit=8`),
        API.get(`/api/analytics/hourly?${query.toString()}`)
      ]);

      this.renderSummary(summary);
      this.renderTopPaths(topPaths);
      this.renderHourlyChart(hourly);
    } catch (err) {
      console.error('[Analytics] Load failed:', err);
    }
  },

  renderSummary(data) {
    if (!data) return;

    const totalReqEl = document.getElementById('stat-analytics-requests');
    const uniqueVisEl = document.getElementById('stat-analytics-visitors');
    const bandwidthEl = document.getElementById('stat-analytics-bandwidth');
    const avgLatencyEl = document.getElementById('stat-analytics-latency');
    const rpsEl = document.getElementById('stat-analytics-rps');

    if (totalReqEl) totalReqEl.textContent = Number(data.totalRequests || 0).toLocaleString();
    if (uniqueVisEl) uniqueVisEl.textContent = Number(data.uniqueVisitors || 0).toLocaleString();
    if (bandwidthEl) bandwidthEl.textContent = data.totalBytesFormatted || '0 B';
    if (avgLatencyEl) avgLatencyEl.textContent = `${data.avgLatencyMs || 0} ms`;
    if (rpsEl) rpsEl.textContent = `${data.liveRps || 0} req/s`;

    // Render Status Codes
    const statusContainer = document.getElementById('analytics-status-breakdown');
    if (statusContainer && data.statusBreakdown) {
      const b = data.statusBreakdown;
      const total = data.totalRequests || 1;
      const p2xx = Math.round((b.status2xx / total) * 100);
      const p3xx = Math.round((b.status3xx / total) * 100);
      const p4xx = Math.round((b.status4xx / total) * 100);
      const p5xx = Math.round((b.status5xx / total) * 100);

      statusContainer.innerHTML = `
        <div class="flex-between flex-wrap gap-2 text-sm mb-2">
          <span style="color: #4ade80; font-weight: 600;">● 2xx Success: <strong>${b.status2xx}</strong> (${p2xx}%)</span>
          <span style="color: #60a5fa; font-weight: 600;">● 3xx Redirect: <strong>${b.status3xx}</strong> (${p3xx}%)</span>
          <span style="color: #f59e0b; font-weight: 600;">● 4xx Client Err: <strong>${b.status4xx}</strong> (${p4xx}%)</span>
          <span style="color: #f87171; font-weight: 600;">● 5xx Server Err: <strong>${b.status5xx}</strong> (${p5xx}%)</span>
        </div>
        <div style="display: flex; height: 10px; border-radius: 6px; overflow: hidden; background: rgba(255,255,255,0.08);">
          <div style="width: ${p2xx}%; background: #4ade80;" title="2xx Success"></div>
          <div style="width: ${p3xx}%; background: #60a5fa;" title="3xx Redirect"></div>
          <div style="width: ${p4xx}%; background: #f59e0b;" title="4xx Client Error"></div>
          <div style="width: ${p5xx}%; background: #f87171;" title="5xx Server Error"></div>
        </div>
      `;
    }
  },

  renderTopPaths(paths) {
    const listEl = document.getElementById('analytics-top-paths-list');
    if (!listEl) return;

    if (!paths || paths.length === 0) {
      listEl.innerHTML = `<tr><td colspan="4" class="text-muted text-center p-3">No page views recorded in this time range.</td></tr>`;
      return;
    }

    listEl.innerHTML = paths
      .map(
        (p, idx) => `
        <tr>
          <td>
            <span class="badge ${idx === 0 ? 'badge-primary' : 'badge-secondary'}" style="font-size: 11px;">#${idx + 1}</span>
            <code style="margin-left: 6px; font-weight: 600;">${p.path}</code>
          </td>
          <td><strong>${Number(p.hits).toLocaleString()}</strong> hits</td>
          <td class="text-muted">${Number(p.uniqueVisitors).toLocaleString()}</td>
          <td class="text-muted">${p.bytesFormatted}</td>
        </tr>
      `
      )
      .join('');
  },

  renderHourlyChart(hourly) {
    const chartContainer = document.getElementById('analytics-hourly-chart');
    if (!chartContainer) return;

    if (!hourly || hourly.length === 0) {
      chartContainer.innerHTML = `<div class="text-muted text-center p-4">Traffic trend will appear here as visitors browse your websites.</div>`;
      return;
    }

    const maxReq = Math.max(...hourly.map((h) => h.requests), 5);
    const barsHtml = hourly
      .map((h) => {
        const heightPercent = Math.max(8, Math.round((h.requests / maxReq) * 100));
        const timeLabel = h.hour.split(' ')[1] || h.hour;
        return `
          <div style="flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 22px;">
            <div style="font-size: 10px; color: #94a3b8; margin-bottom: 4px;">${h.requests}</div>
            <div style="width: 14px; height: ${heightPercent}%; background: linear-gradient(180deg, #38bdf8 0%, #0284c7 100%); border-radius: 4px 4px 0 0;" title="${h.hour}: ${h.requests} requests, ${h.visitors} visitors"></div>
            <div style="font-size: 10px; color: #64748b; margin-top: 6px; transform: rotate(-45deg); white-space: nowrap;">${timeLabel}</div>
          </div>
        `;
      })
      .join('');

    chartContainer.innerHTML = `
      <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 160px; padding: 10px 0 24px 0; gap: 6px; border-bottom: 1px solid rgba(255,255,255,0.08);">
        ${barsHtml}
      </div>
    `;
  },

  startLivePolling() {
    this.stopLivePolling();
    this.livePollInterval = setInterval(async () => {
      try {
        const live = await API.get('/api/analytics/live');
        const rpsEl = document.getElementById('stat-analytics-rps');
        const activeVisitorsEl = document.getElementById('stat-analytics-active-visitors');
        if (rpsEl) rpsEl.textContent = `${live.rps || 0} req/s`;
        if (activeVisitorsEl) activeVisitorsEl.textContent = `~${live.activeVisitorsEstimate || 1} active`;
      } catch (_) {}
    }, 3000);
  },

  stopLivePolling() {
    if (this.livePollInterval) {
      clearInterval(this.livePollInterval);
      this.livePollInterval = null;
    }
  }
};
