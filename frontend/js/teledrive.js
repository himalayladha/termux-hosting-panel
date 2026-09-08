const teledriveManager = {
 currentCategory: 'all',
 searchQuery: '',
 stats: null,
 config: null,
 filesList: [],

 init() {
 this.bindEvents();
 },

 bindEvents() {
 // Category Filter Buttons
 document.querySelectorAll('.teledrive-filter-btn').forEach((btn) => {
 btn.addEventListener('click', (e) => {
 document.querySelectorAll('.teledrive-filter-btn').forEach((b) => b.classList.remove('active'));
 btn.classList.add('active');
 this.currentCategory = btn.getAttribute('data-category') || 'all';
 this.loadFiles();
 });
 });

 // Search Input
 const searchInput = document.getElementById('teledrive-search-input');
 if (searchInput) {
 let debounceTimer = null;
 searchInput.addEventListener('input', (e) => {
 clearTimeout(debounceTimer);
 debounceTimer = setTimeout(() => {
 this.searchQuery = e.target.value.trim();
 this.loadFiles();
 }, 300);
 });
 }

 // Refresh Button
 const refreshBtn = document.getElementById('teledrive-refresh-btn');
 if (refreshBtn) {
 refreshBtn.addEventListener('click', () => this.loadDrive());
 }

 // Connect / Config Modal Form
 const configForm = document.getElementById('teledrive-config-form');
 if (configForm) {
 configForm.addEventListener('submit', (e) => this.handleSaveConfig(e));
 }

 // Test Connection Button
 const testBtn = document.getElementById('teledrive-test-btn');
 if (testBtn) {
 testBtn.addEventListener('click', () => this.handleTestConnection());
 }

 // Upload Form
 const uploadForm = document.getElementById('teledrive-upload-form');
 if (uploadForm) {
 uploadForm.addEventListener('submit', (e) => this.handleUploadFile(e));
 }

 // Export Website Form
 const exportForm = document.getElementById('teledrive-export-form');
 if (exportForm) {
 exportForm.addEventListener('submit', (e) => this.handleExportWebsite(e));
 }

 // Deploy Website Form
 const deployForm = document.getElementById('teledrive-deploy-form');
 if (deployForm) {
 deployForm.addEventListener('submit', (e) => this.handleDeployWebsite(e));
 }
 },

 async loadDrive() {
 await this.loadConfigAndStats();
 await this.loadFiles();
 },

 async loadConfigAndStats() {
 try {
 const [cfg, stats] = await Promise.all([
 API.get('/api/teledrive/config'),
 API.get('/api/teledrive/stats')
 ]);

 this.config = cfg;
 this.stats = stats;

 this.renderHeaderAndStats();
 } catch (err) {
 console.error('[TeleDrive] Failed to load config/stats:', err);
 }
 },

 renderHeaderAndStats() {
 const banner = document.getElementById('teledrive-status-banner');
 const totalFilesEl = document.getElementById('teledrive-stat-files');
 const totalSizeEl = document.getElementById('teledrive-stat-size');
 const channelBadge = document.getElementById('teledrive-channel-badge');
 const pruningBadge = document.getElementById('teledrive-pruning-badge');

 if (totalFilesEl) totalFilesEl.textContent = this.stats ? this.stats.totalFiles : '0';
 if (totalSizeEl) totalSizeEl.textContent = this.stats ? this.stats.totalBytesFormatted : '0 B';

 if (channelBadge) {
 if (this.config && this.config.isConfigured) {
 channelBadge.innerHTML = `<span class="badge badge-success"><i data-lucide="check-circle" style="width: 12px; height: 12px; margin-right: 4px;"></i> Connected: ${this.config.channelUsername || this.config.chatId}</span>`;
 } else {
 channelBadge.innerHTML = `<span class="badge badge-warning"><i data-lucide="alert-triangle" style="width: 12px; height: 12px; margin-right: 4px;"></i> Not Connected</span>`;
 }
 }

 if (pruningBadge) {
 pruningBadge.innerHTML = `<span class="badge badge-primary"><i data-lucide="shield-check" style="width: 12px; height: 12px; margin-right: 4px;"></i> 7-Day Auto-Pruning Active</span>`;
 }

 if (banner) {
 if (!this.config || !this.config.isConfigured) {
 banner.classList.remove('hidden');
 } else {
 banner.classList.add('hidden');
 }
 }

 if (window.lucide) lucide.createIcons();
 },

 async loadFiles() {
 const tbody = document.getElementById('teledrive-table-body');
 if (!tbody) return;

 tbody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-muted"><i data-lucide="loader" style="width: 16px; height: 16px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Loading Telegram Cloud files...</td></tr>`;
 if (window.lucide) lucide.createIcons();

 try {
 const query = new URLSearchParams();
 if (this.currentCategory && this.currentCategory !== 'all') {
 query.append('category', this.currentCategory);
 }
 if (this.searchQuery) {
 query.append('search', this.searchQuery);
 }

 const res = await API.get(`/api/teledrive/files?${query.toString()}`);
 this.filesList = res.files || [];

 this.renderFilesTable();
 } catch (err) {
 tbody.innerHTML = `<tr><td colspan="6" class="text-center p-4 text-danger">Failed to load files: ${err.message}</td></tr>`;
 }
 },

 renderFilesTable() {
 const tbody = document.getElementById('teledrive-table-body');
 if (!tbody) return;

 if (!this.filesList || this.filesList.length === 0) {
 tbody.innerHTML = `
 <tr>
 <td colspan="6" style="padding: 40px 20px; text-align: center;">
 <div style="max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;">
 <div class="empty-state-icon" style="width: 56px; height: 56px; margin: 0 auto 12px auto; border-radius: 16px;">
 <i data-lucide="cloud" style="width: 28px; height: 28px; color: #38bdf8;"></i>
 </div>
 <h4 style="font-size: 16px; margin-bottom: 6px; color: var(--text-main); text-align: center;">No Cloud Files Stored Yet</h4>
 <p class="text-muted text-sm mb-3" style="text-align: center;">Upload assets, push automated database/site backups, or export websites to your free unlimited Telegram Cloud drive.</p>
 <div class="empty-state-actions" style="margin-bottom: 0;">
 <button class="btn btn-primary btn-sm" onclick="teledriveManager.openUploadModal()">
 <i data-lucide="upload" style="width: 13px; height: 13px; margin-right: 3px;"></i> Upload to Cloud
 </button>
 <button class="btn btn-secondary btn-sm" onclick="teledriveManager.openExportModal()">
 <i data-lucide="package" style="width: 13px; height: 13px; margin-right: 3px;"></i> Export Website
 </button>
 </div>
 </div>
 </td>
 </tr>
 `;
 if (window.lucide) lucide.createIcons();
 return;
 }

 tbody.innerHTML = this.filesList
 .map((f) => {
 let catIcon = 'file';
 let catBadge = 'badge-secondary';

 if (f.category === 'backup') {
 catIcon = 'archive';
 catBadge = 'badge-primary';
 } else if (f.category === 'static_site') {
 catIcon = 'globe';
 catBadge = 'badge-success';
 } else if (f.category === 'media') {
 catIcon = 'image';
 catBadge = 'badge-warning';
 } else if (f.category === 'documents') {
 catIcon = 'file-text';
 catBadge = 'badge-secondary';
 }

 const isZip = f.fileName.toLowerCase().endsWith('.zip') || f.category === 'static_site';
 const dateStr = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : 'Just now';

 return `
 <tr>
 <td>
 <div class="flex-align gap-2">
 <i data-lucide="${catIcon}" style="width: 16px; height: 16px; color: #38bdf8;"></i>
 <div>
 <strong style="color: var(--text-main); font-size: 13.5px;">${f.fileName}</strong>
 ${f.caption ? `<div class="text-muted text-sm" style="font-size: 11px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${f.caption}</div>` : ''}
 </div>
 </div>
 </td>
 <td>
 <span class="badge ${catBadge}" style="font-size: 10.5px; text-transform: uppercase;">${f.category}</span>
 </td>
 <td><code style="font-weight: 600;">${f.fileSizeFormatted}</code></td>
 <td class="text-muted" style="font-size: 12px;">${dateStr}</td>
 <td class="text-muted" style="font-size: 11px; font-family: monospace;">#${f.telegramMessageId || 'N/A'}</td>
 <td class="text-right">
 <div class="flex-align gap-1 justify-end">
 <a href="/api/teledrive/download/${encodeURIComponent(f.telegramFileId)}" target="_blank" class="btn btn-secondary btn-sm" title="Download File">
 <i data-lucide="download" style="width: 13px; height: 13px;"></i>
 </a>
 ${
 isZip
 ? `<button class="btn btn-secondary btn-sm" onclick="teledriveManager.openDeployModal('${f.telegramFileId}', '${f.fileName.replace(/'/g, "\\'")}')" title="1-Click Deploy as Website" style="color: #4ade80;">
 <i data-lucide="play" style="width: 13px; height: 13px; margin-right: 3px;"></i> Deploy
 </button>`
 : ''
 }
 <button class="btn btn-secondary btn-sm" onclick="teledriveManager.deleteFile(${f.id}, '${f.fileName.replace(/'/g, "\\'")}')" title="Delete File" style="color: #ef4444;">
 <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
 </button>
 </div>
 </td>
 </tr>
 `;
 })
 .join('');

 if (window.lucide) lucide.createIcons();
 },

 openConfigModal() {
 const modal = document.getElementById('modal-teledrive-config');
 if (!modal) return;

 if (this.config) {
 document.getElementById('teledrive-bot-token-input').value = this.config.botToken || '';
 document.getElementById('teledrive-chat-id-input').value = this.config.chatId || '';
 document.getElementById('teledrive-channel-username-input').value = this.config.channelUsername || '';
 }

 modal.classList.remove('hidden');
 if (window.lucide) lucide.createIcons();
 },

 async handleTestConnection() {
 const botToken = document.getElementById('teledrive-bot-token-input').value.trim();
 const chatId = document.getElementById('teledrive-chat-id-input').value.trim();
 const resultEl = document.getElementById('teledrive-test-result');

 if (!botToken) {
 API.toast('Please enter a Bot Token first', 'error');
 return;
 }

 if (resultEl) {
 resultEl.innerHTML = `<span class="text-muted"><i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> Testing Telegram connection...</span>`;
 if (window.lucide) lucide.createIcons();
 }

 try {
 const res = await API.post('/api/teledrive/test', { botToken, chatId });
 if (resultEl) {
 resultEl.innerHTML = `<span class="text-success"><i data-lucide="check-circle" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> ${res.message}</span>`;
 if (window.lucide) lucide.createIcons();
 }
 API.toast(res.message, 'success');
 } catch (err) {
 if (resultEl) {
 resultEl.innerHTML = `<span class="text-danger"><i data-lucide="alert-circle" style="width: 14px; height: 14px; margin-right: 4px; display: inline-block; vertical-align: middle;"></i> ${err.message}</span>`;
 if (window.lucide) lucide.createIcons();
 }
 API.toast(err.message, 'error');
 }
 },

 async handleSaveConfig(e) {
 e.preventDefault();
 const botToken = document.getElementById('teledrive-bot-token-input').value.trim();
 const chatId = document.getElementById('teledrive-chat-id-input').value.trim();
 const channelUsername = document.getElementById('teledrive-channel-username-input').value.trim();

 try {
 await API.post('/api/teledrive/config', {
 botToken,
 chatId,
 channelUsername,
 enabled: true
 });

 API.toast('Telegram Cloud credentials saved successfully!', 'success');
 document.getElementById('modal-teledrive-config').classList.add('hidden');
 await this.loadDrive();
 } catch (err) {
 API.toast(err.message, 'error');
 }
 },

 openUploadModal() {
 const modal = document.getElementById('modal-teledrive-upload');
 if (!modal) return;

 document.getElementById('teledrive-upload-form').reset();
 modal.classList.remove('hidden');
 if (window.lucide) lucide.createIcons();
 },

 async handleUploadFile(e) {
 e.preventDefault();
 const fileInput = document.getElementById('teledrive-file-input');
 const categorySelect = document.getElementById('teledrive-category-select');
 const captionInput = document.getElementById('teledrive-caption-input');
 const submitBtn = document.getElementById('teledrive-upload-submit-btn');

 if (!fileInput.files || fileInput.files.length === 0) {
 API.toast('Please select a file to upload', 'error');
 return;
 }

 const formData = new FormData();
 formData.append('file', fileInput.files[0]);
 formData.append('category', categorySelect.value || 'general');
 formData.append('caption', captionInput.value.trim());

 if (submitBtn) {
 submitBtn.disabled = true;
 submitBtn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Uploading to Telegram...`;
 if (window.lucide) lucide.createIcons();
 }

 try {
 const response = await fetch('/api/teledrive/upload', {
 method: 'POST',
 body: formData
 });

 const data = await response.json();
 if (!response.ok) {
 throw new Error(data.error || 'Upload failed');
 }

 API.toast('File uploaded to Telegram Cloud successfully!', 'success');
 document.getElementById('modal-teledrive-upload').classList.add('hidden');
 await this.loadDrive();
 } catch (err) {
 API.toast(err.message, 'error');
 } finally {
 if (submitBtn) {
 submitBtn.disabled = false;
 submitBtn.innerHTML = `<i data-lucide="upload" style="width: 14px; height: 14px; margin-right: 4px;"></i> Upload to Telegram`;
 if (window.lucide) lucide.createIcons();
 }
 }
 },

 async openExportModal() {
 const modal = document.getElementById('modal-teledrive-export');
 const select = document.getElementById('teledrive-export-site-select');
 if (!modal || !select) return;

 try {
 const sites = await API.get('/api/websites');
 select.innerHTML = sites.map((s) => `<option value="${s.id}">${s.name} (Port :${s.port} - ${s.type.toUpperCase()})</option>`).join('');
 if (sites.length === 0) {
 select.innerHTML = `<option value="">No websites available. Create one first.</option>`;
 }
 } catch (_) {}

 modal.classList.remove('hidden');
 if (window.lucide) lucide.createIcons();
 },

 async handleExportWebsite(e) {
 e.preventDefault();
 const websiteId = document.getElementById('teledrive-export-site-select').value;
 const submitBtn = document.getElementById('teledrive-export-submit-btn');

 if (!websiteId) {
 API.toast('Please select a website to export', 'error');
 return;
 }

 if (submitBtn) {
 submitBtn.disabled = true;
 submitBtn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Bundling & Uploading...`;
 if (window.lucide) lucide.createIcons();
 }

 try {
 const res = await API.post('/api/teledrive/export-website', { websiteId });
 API.toast(`Website "${res.siteName}" exported to Telegram Cloud! (${res.fileSizeFormatted})`, 'success');
 document.getElementById('modal-teledrive-export').classList.add('hidden');
 await this.loadDrive();
 } catch (err) {
 API.toast(err.message, 'error');
 } finally {
 if (submitBtn) {
 submitBtn.disabled = false;
 submitBtn.innerHTML = `<i data-lucide="package" style="width: 14px; height: 14px; margin-right: 4px;"></i> Export to Telegram`;
 if (window.lucide) lucide.createIcons();
 }
 }
 },

 openDeployModal(fileId, fileName) {
 const modal = document.getElementById('modal-teledrive-deploy');
 if (!modal) return;

 document.getElementById('teledrive-deploy-file-id').value = fileId;
 document.getElementById('teledrive-deploy-file-name-text').textContent = fileName;

 // Suggest clean name
 const cleanName = fileName.replace(/\.zip$/i, '').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
 document.getElementById('teledrive-deploy-site-name-input').value = cleanName;

 modal.classList.remove('hidden');
 if (window.lucide) lucide.createIcons();
 },

 async handleDeployWebsite(e) {
 e.preventDefault();
 const fileId = document.getElementById('teledrive-deploy-file-id').value;
 const siteName = document.getElementById('teledrive-deploy-site-name-input').value.trim();
 const domain = document.getElementById('teledrive-deploy-domain-input').value.trim();
 const submitBtn = document.getElementById('teledrive-deploy-submit-btn');

 if (!fileId || !siteName) {
 API.toast('Website name is required', 'error');
 return;
 }

 if (submitBtn) {
 submitBtn.disabled = true;
 submitBtn.innerHTML = `<i data-lucide="loader" style="width: 14px; height: 14px; margin-right: 4px;"></i> Downloading & Deploying...`;
 if (window.lucide) lucide.createIcons();
 }

 try {
 const res = await API.post('/api/teledrive/deploy-website', {
 fileId,
 siteName,
 domain: domain || null
 });

 API.toast(res.message, 'success');
 document.getElementById('modal-teledrive-deploy').classList.add('hidden');
 if (window.websites) websites.loadWebsites();
 app.switchTab('websites');
 } catch (err) {
 API.toast(err.message, 'error');
 } finally {
 if (submitBtn) {
 submitBtn.disabled = false;
 submitBtn.innerHTML = `<i data-lucide="rocket" style="width: 14px; height: 14px; margin-right: 4px;"></i> Launch Website`;
 if (window.lucide) lucide.createIcons();
 }
 }
 },

 async triggerBackupAndSync() {
 if (!confirm('Generate a full server backup archive and push it to Telegram Cloud with 7-day retention auto-pruning?')) {
 return;
 }

 try {
 API.toast('Creating full server backup...', 'info');
 const backup = await API.post('/api/backups/create', { type: 'full' });

 API.toast('Dispatching backup to Telegram Cloud & pruning old archives...', 'info');
 const syncRes = await API.post('/api/teledrive/backup-sync', { filename: backup.filename });

 API.toast(syncRes.message, 'success');
 await this.loadDrive();
 } catch (err) {
 API.toast(`Backup sync failed: ${err.message}`, 'error');
 }
 },

 async deleteFile(fileId, fileName) {
 if (!confirm(`Delete "${fileName}" from TeleDrive index and Telegram Channel?`)) {
 return;
 }

 try {
 await API.delete(`/api/teledrive/files/${fileId}`);
 API.toast(`"${fileName}" deleted from TeleDrive`, 'success');
 await this.loadDrive();
 } catch (err) {
 API.toast(err.message, 'error');
 }
 }
};
