const emailManager = {
  forwarders: [],
  currentMode: 'cf-api', // 'cf-api' or 'manual'

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const openBtn = document.getElementById('open-email-setup-btn');
    if (openBtn) {
      openBtn.addEventListener('click', () => this.openSetupModal());
    }

    // Modal Mode Tab Switcher
    const modeTabs = document.querySelectorAll('.email-mode-tab-btn');
    modeTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        this.switchSetupTab(mode);
      });
    });

    // Cloudflare API Form
    const cfForm = document.getElementById('form-email-cf-setup');
    if (cfForm) {
      cfForm.addEventListener('submit', (e) => this.handleCloudflareApiSetup(e));
    }

    // Manual Setup Form
    const manualForm = document.getElementById('form-email-manual-setup');
    if (manualForm) {
      manualForm.addEventListener('submit', (e) => this.handleManualSave(e));
    }

    // Manual domain inputs live preview generator
    const manualDomainInput = document.getElementById('manual-email-domain');
    const manualBrevoCodeInput = document.getElementById('manual-brevo-code');
    const manualDmarcInput = document.getElementById('manual-dmarc-email');

    if (manualDomainInput) {
      manualDomainInput.addEventListener('input', () => this.refreshManualDnsPreview());
    }
    if (manualBrevoCodeInput) {
      manualBrevoCodeInput.addEventListener('input', () => this.refreshManualDnsPreview());
    }
    if (manualDmarcInput) {
      manualDmarcInput.addEventListener('input', () => this.refreshManualDnsPreview());
    }

    // DNS Inspector Trigger
    const inspectBtn = document.getElementById('btn-inspect-email-dns');
    if (inspectBtn) {
      inspectBtn.addEventListener('click', () => {
        const domain = document.getElementById('inspect-dns-domain-input').value.trim();
        if (domain) this.runLiveDnsCheck(domain);
      });
    }
  },

  async loadForwarders() {
    try {
      this.forwarders = await API.get('/api/email/forwarders');
      this.renderForwarders();
    } catch (err) {
      console.error('[Email] Failed to load forwarders:', err);
    }
  },

  renderForwarders() {
    const tbody = document.getElementById('email-forwarders-table-body');
    if (!tbody) return;

    if (!this.forwarders || this.forwarders.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center p-4">No custom email forwarders configured yet. Click "+ Setup Professional Email" above to get started for free.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.forwarders
      .map(
        (f) => `
        <tr>
          <td>
            <div class="flex-align gap-2">
              <i data-lucide="mail" style="width: 16px; height: 16px; color: #38bdf8;"></i>
              <strong style="color: #f1f5f9; font-size: 14px;">${f.custom_email}</strong>
            </div>
          </td>
          <td>
            <div class="flex-align gap-1" style="color: #4ade80;">
              <i data-lucide="arrow-right" style="width: 13px; height: 13px;"></i>
              <span>${f.destination_email}</span>
            </div>
          </td>
          <td>
            <span class="badge ${f.mode === 'cloudflare_api' ? 'badge-primary' : 'badge-secondary'}" style="font-size: 11px;">
              ${f.mode === 'cloudflare_api' ? 'Cloudflare API' : 'Manual DNS'}
            </span>
          </td>
          <td>
            <span class="badge ${f.brevo_configured ? 'badge-success' : 'badge-warning'}" style="font-size: 11px;">
              ${f.brevo_configured ? 'DKIM Active' : 'Pending Brevo'}
            </span>
          </td>
          <td style="text-align: right;">
            <div class="flex-align gap-2" style="justify-content: flex-end;">
              <button class="btn btn-secondary btn-sm" onclick="emailManager.inspectDomain('${f.domain}')" title="Inspect live DNS & deliverability">
                <i data-lucide="activity" style="width: 13px; height: 13px; margin-right: 3px;"></i> Inspect DNS
              </button>
              <button class="btn btn-danger btn-sm" onclick="emailManager.deleteForwarder(${f.id}, '${f.custom_email}')" title="Delete forwarder">
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

  async openSetupModal() {
    const modal = document.getElementById('modal-email-setup');
    if (!modal) return;

    // Populate Domain Dropdowns from connected domains
    try {
      const domains = await API.get('/api/domains');
      const cfSelect = document.getElementById('cf-email-domain-select');
      const manualDomainInput = document.getElementById('manual-email-domain');

      if (cfSelect && domains.length > 0) {
        cfSelect.innerHTML = domains.map((d) => `<option value="${d.domain}">${d.domain}</option>`).join('');
      }
      if (manualDomainInput && domains.length > 0 && !manualDomainInput.value) {
        manualDomainInput.value = domains[0].domain;
      }
    } catch (_) {}

    modal.classList.remove('hidden');
    this.switchSetupTab('cf-api');
    this.refreshManualDnsPreview();
    if (window.lucide) lucide.createIcons();
  },

  switchSetupTab(mode) {
    this.currentMode = mode;
    const tabBtns = document.querySelectorAll('.email-mode-tab-btn');
    tabBtns.forEach((btn) => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    });

    const panelCf = document.getElementById('panel-email-cf-api');
    const panelManual = document.getElementById('panel-email-manual');

    if (mode === 'cf-api') {
      if (panelCf) panelCf.classList.remove('hidden');
      if (panelManual) panelManual.classList.add('hidden');
    } else {
      if (panelCf) panelCf.classList.add('hidden');
      if (panelManual) panelManual.classList.remove('hidden');
      this.refreshManualDnsPreview();
    }
  },

  async handleCloudflareApiSetup(e) {
    e.preventDefault();
    const domain = document.getElementById('cf-email-domain-select').value.trim();
    const customUser = document.getElementById('cf-email-user-input').value.trim();
    const destGmail = document.getElementById('cf-email-dest-input').value.trim();

    if (!domain || !customUser || !destGmail) return;

    const customEmail = `${customUser}@${domain}`.toLowerCase();
    const btn = document.getElementById('btn-cf-email-submit');
    const logBox = document.getElementById('cf-email-setup-logs');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Provisioning Cloudflare Email Routing...`;
      if (window.lucide) lucide.createIcons();
    }
    if (logBox) {
      logBox.classList.remove('hidden');
      logBox.innerHTML = '<p class="text-muted text-sm">Connecting to Cloudflare API...</p>';
    }

    try {
      API.toast('Enabling Cloudflare Email Routing & generating rules...', 'info');
      const res = await API.post('/api/email/cloudflare-setup', {
        domain,
        customEmail,
        destinationEmail: destGmail
      });

      if (logBox && res.logs) {
        logBox.innerHTML = res.logs.map((l) => `<div style="font-family: monospace; font-size: 12px; color: #4ade80;">${l}</div>`).join('');
      }

      await UI.alert(
        `Email Routing successfully configured for "${customEmail}"!\n\n` +
        `IMPORTANT STEP:\nCloudflare has dispatched a verification email to ${destGmail}.\n` +
        `Please open your Gmail and click the verification link to begin receiving forwarded emails!`,
        'Email Routing Active',
        'success'
      );

      this.loadForwarders();
      document.getElementById('modal-email-setup').classList.add('hidden');
    } catch (err) {
      if (logBox) {
        logBox.innerHTML = `<div style="font-family: monospace; font-size: 12px; color: #f87171;">Error: ${err.message}</div>`;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="zap" style="width: 14px; height: 14px; margin-right: 4px;"></i> 1-Click Enable Email Routing`;
        if (window.lucide) lucide.createIcons();
      }
    }
  },

  async handlePushBrevoDns() {
    const domain = document.getElementById('cf-email-domain-select').value.trim() || document.getElementById('manual-email-domain').value.trim();
    const brevoCode = document.getElementById('cf-brevo-code-input').value.trim();

    if (!domain) {
      API.toast('Please select a domain first', 'warning');
      return;
    }

    try {
      API.toast(`Pushing Brevo DKIM & DMARC records to Cloudflare for ${domain}...`, 'info');
      const res = await API.post('/api/email/cloudflare-brevo-dns', {
        domain,
        brevoCode: brevoCode || 'brevo-code:pending'
      });

      await UI.alert(
        `Brevo DKIM, Subdomain CNAMEs, and DMARC records were successfully added to Cloudflare DNS!\n\n` +
        `Records Added:\n${(res.added && res.added.join('\n')) || 'All records synced as DNS Only.'}\n\n` +
        `You can now click "Verify Records" in your Brevo dashboard.`,
        'Brevo DNS Pushed',
        'success'
      );
      this.loadForwarders();
    } catch (err) {}
  },

  async refreshManualDnsPreview() {
    const domainInput = document.getElementById('manual-email-domain');
    const brevoCodeInput = document.getElementById('manual-brevo-code');
    const dmarcInput = document.getElementById('manual-dmarc-email');

    const domain = domainInput ? domainInput.value.trim() : 'example.com';
    const brevoCode = brevoCodeInput ? brevoCodeInput.value.trim() : '';
    const dmarcEmail = dmarcInput ? dmarcInput.value.trim() : '';

    if (!domain) return;

    try {
      const data = await API.get(`/api/email/dns-templates?domain=${encodeURIComponent(domain)}&brevoCode=${encodeURIComponent(brevoCode)}&dmarcEmail=${encodeURIComponent(dmarcEmail)}`);
      this.renderManualDnsTable(data.records);
      this.currentBindZoneText = data.bindZoneText;
    } catch (_) {}
  },

  renderManualDnsTable(records) {
    const container = document.getElementById('manual-dns-records-list');
    if (!container) return;

    container.innerHTML = records
      .map(
        (r) => `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px;">
          <div class="flex-between flex-wrap gap-2 mb-1">
            <div class="flex-align gap-2">
              <span class="badge ${r.type === 'MX' ? 'badge-primary' : (r.type === 'CNAME' ? 'badge-success' : 'badge-secondary')}" style="font-size: 11px; font-weight: 700;">
                ${r.type}
              </span>
              <strong style="color: #f1f5f9; font-size: 13px;">${r.name}</strong>
              ${r.priority ? `<span class="text-muted text-sm">(Priority: ${r.priority})</span>` : ''}
            </div>
            <span class="badge badge-secondary" style="font-size: 10px; color: #94a3b8;">DNS ONLY (Grey Cloud ☁️)</span>
          </div>
          <div class="flex-between flex-wrap gap-2 mt-2" style="background: #070a14; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
            <code style="font-size: 12px; color: #38bdf8; word-break: break-all;">${r.value}</code>
            <button type="button" class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${r.value.replace(/'/g, "\\'")}').then(() => API.toast('Copied to clipboard!', 'success'))" title="Copy Record Value" style="padding: 2px 6px;">
              <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
          <div class="text-muted text-sm mt-1" style="font-size: 11px;">${r.purpose}</div>
        </div>
      `
      )
      .join('');

    if (window.lucide) lucide.createIcons();
  },

  downloadBindZoneFile() {
    const domain = (document.getElementById('manual-email-domain') && document.getElementById('manual-email-domain').value.trim()) || 'domain';
    if (!this.currentBindZoneText) return;

    const blob = new Blob([this.currentBindZoneText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cloudflare-email-${domain}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    API.toast('BIND Zone File downloaded! Import it in Cloudflare DNS ➔ Records ➔ Import', 'success');
  },

  async handleManualSave(e) {
    e.preventDefault();
    const domain = document.getElementById('manual-email-domain').value.trim();
    const customUser = document.getElementById('manual-email-user').value.trim();
    const destGmail = document.getElementById('manual-email-dest').value.trim();
    const brevoDone = document.getElementById('manual-brevo-configured').checked;

    if (!domain || !customUser || !destGmail) return;

    const customEmail = `${customUser}@${domain}`.toLowerCase();

    try {
      await API.post('/api/email/forwarders', {
        domain,
        customEmail,
        destinationEmail: destGmail,
        mode: 'manual',
        brevoConfigured: brevoDone ? 1 : 0
      });

      API.toast(`Forwarder ${customEmail} saved!`, 'success');
      document.getElementById('modal-email-setup').classList.add('hidden');
      this.loadForwarders();
    } catch (err) {}
  },

  async runLiveDnsCheck(domain) {
    const resultBox = document.getElementById('email-dns-inspection-results');
    if (resultBox) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = '<p class="text-muted text-sm"><i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Querying live global DNS servers for MX, SPF, DKIM, and DMARC records...</p>';
      if (window.lucide) lucide.createIcons();
    }

    try {
      const data = await API.post('/api/email/verify-dns', { domain });
      this.renderDnsInspectionResults(data);
    } catch (err) {
      if (resultBox) {
        resultBox.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      }
    }
  },

  renderDnsInspectionResults(data) {
    const resultBox = document.getElementById('email-dns-inspection-results');
    if (!resultBox) return;

    const mxBadge = data.mx.passed ? '<span class="badge badge-success">✓ PASS (Cloudflare MX Active)</span>' : '<span class="badge badge-danger">✗ FAIL (Missing MX)</span>';
    const spfBadge = data.spf.passed ? '<span class="badge badge-success">✓ PASS (Single Record)</span>' : (data.spf.count > 1 ? '<span class="badge badge-danger">✗ MULTIPLE SPF CONFLICT</span>' : '<span class="badge badge-warning">! Unresolved</span>');
    const dkimBadge = data.dkim.passed ? '<span class="badge badge-success">✓ PASS (DKIM CNAME Mapped)</span>' : '<span class="badge badge-warning">! Unresolved / DNS Only</span>';
    const dmarcBadge = data.dmarc.passed ? '<span class="badge badge-success">✓ PASS (DMARC1 Active)</span>' : '<span class="badge badge-warning">! Pending TXT</span>';

    resultBox.innerHTML = `
      <div class="card p-3 mt-3" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08);">
        <div class="flex-between flex-wrap gap-2 mb-3">
          <h4 style="margin: 0; font-size: 15px;">DNS & Deliverability Report for <strong style="color: #38bdf8;">${data.domain}</strong></h4>
          <span class="badge ${data.overallScore >= 80 ? 'badge-success' : 'badge-warning'}" style="font-size: 12px;">
            Deliverability Score: ${data.overallScore}%
          </span>
        </div>

        ${data.spf.warning ? `<div class="alert alert-danger mb-3">${data.spf.warning}</div>` : ''}

        <div class="grid grid-2 gap-3 text-sm">
          <div style="background: #070a14; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div class="flex-between mb-1">
              <strong>1. Inbound MX Records:</strong>
              ${mxBadge}
            </div>
            <div class="text-muted text-sm" style="font-size: 11.5px;">${data.mx.details.length > 0 ? data.mx.details.map((r) => r.exchange).join(', ') : 'No MX records found'}</div>
          </div>

          <div style="background: #070a14; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div class="flex-between mb-1">
              <strong>2. SPF Validation:</strong>
              ${spfBadge}
            </div>
            <div class="text-muted text-sm" style="font-size: 11.5px;">${data.spf.details || 'No SPF TXT record'} (Count: ${data.spf.count})</div>
          </div>

          <div style="background: #070a14; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div class="flex-between mb-1">
              <strong>3. Brevo DKIM (brevo1._domainkey):</strong>
              ${dkimBadge}
            </div>
            <div class="text-muted text-sm" style="font-size: 11.5px;">${data.dkim.details || 'CNAME record not yet resolved'}</div>
          </div>

          <div style="background: #070a14; padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div class="flex-between mb-1">
              <strong>4. DMARC Policy (_dmarc):</strong>
              ${dmarcBadge}
            </div>
            <div class="text-muted text-sm" style="font-size: 11.5px;">${data.dmarc.details || 'DMARC1 record not yet resolved'}</div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) lucide.createIcons();
  },

  inspectDomain(domain) {
    const input = document.getElementById('inspect-dns-domain-input');
    if (input) input.value = domain;
    this.runLiveDnsCheck(domain);
  },

  async deleteForwarder(id, email) {
    const confirmed = await UI.confirm(
      `Are you sure you want to remove the forwarder for "${email}"?`,
      'Delete Email Forwarder',
      { confirmText: 'Delete Forwarder', cancelText: 'Cancel', type: 'danger' }
    );
    if (!confirmed) return;

    try {
      await API.delete(`/api/email/forwarders/${id}`);
      API.toast(`Deleted forwarder for ${email}`, 'info');
      this.loadForwarders();
    } catch (err) {}
  }
};
