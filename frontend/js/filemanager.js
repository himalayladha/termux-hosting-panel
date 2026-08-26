const fileManager = {
  currentSiteId: null,
  currentPath: '/',
  activeEditingPath: null,

  init() {
    this.bindEvents();
    this.populateSiteSelector();
  },

  bindEvents() {
    const siteSelect = document.getElementById('fm-site-select');
    if (siteSelect) {
      siteSelect.addEventListener('change', (e) => {
        this.currentSiteId = e.target.value;
        this.currentPath = '/';
        this.loadFiles();
      });
    }

    const uploadBtn = document.getElementById('fm-upload-btn');
    const fileInput = document.getElementById('fm-file-input');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleUpload(e));
    }

    const newFolderBtn = document.getElementById('fm-new-folder-btn');
    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', () => this.handleNewFolder());
    }

    const newFileBtn = document.getElementById('fm-new-file-btn');
    if (newFileBtn) {
      newFileBtn.addEventListener('click', () => this.handleNewFile());
    }

    const saveEditorBtn = document.getElementById('editor-save-btn');
    if (saveEditorBtn) {
      saveEditorBtn.addEventListener('click', () => this.saveEditedFile());
    }
  },

  async populateSiteSelector() {
    try {
      const sites = await API.get('/api/websites');
      const select = document.getElementById('fm-site-select');
      if (!select) return;

      select.innerHTML = sites
        .map((s) => `<option value="${s.id}">${s.name} (${s.type})</option>`)
        .join('');

      if (sites.length > 0) {
        this.currentSiteId = sites[0].id;
        this.loadFiles();
      } else {
        document.getElementById('fm-table-body').innerHTML = `
          <tr><td colspan="4" class="text-muted text-center">No websites available. Create one first.</td></tr>
        `;
      }
    } catch (err) {
      console.error('Failed to load sites for file manager:', err);
    }
  },

  async loadFiles() {
    if (!this.currentSiteId) return;

    try {
      const data = await API.get(
        `/api/files/${this.currentSiteId}?path=${encodeURIComponent(this.currentPath)}`
      );
      this.renderBreadcrumbs(data.currentPath);
      this.renderFileList(data.items);
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  },

  renderBreadcrumbs(activePath) {
    const el = document.getElementById('fm-breadcrumbs');
    if (!el) return;

    const parts = (activePath || '/').split('/').filter((p) => p.length > 0);
    let accum = '';

    let html = `<span class="crumb" onclick="fileManager.navigateTo('/')">root</span>`;
    parts.forEach((part) => {
      accum += `/${part}`;
      const pathValue = accum;
      html += ` / <span class="crumb" onclick="fileManager.navigateTo('${pathValue}')">${part}</span>`;
    });

    el.innerHTML = html;
  },

  renderFileList(items) {
    const tbody = document.getElementById('fm-table-body');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-muted text-center">This folder is empty.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((item) => {
        const icon = item.isDirectory ? '📁' : '📄';
        const sizeFormatted = item.isDirectory ? '-' : this.formatBytes(item.size);
        const dateFormatted = new Date(item.modifiedAt).toLocaleString();

        return `
          <tr>
            <td>
              <span style="margin-right: 6px;">${icon}</span>
              ${
                item.isDirectory
                  ? `<a href="javascript:void(0)" onclick="fileManager.navigateTo('${item.relativePath}')"><strong>${item.name}</strong></a>`
                  : `<a href="javascript:void(0)" onclick="fileManager.openEditor('${item.relativePath}')">${item.name}</a>`
              }
            </td>
            <td class="text-muted">${sizeFormatted}</td>
            <td class="text-muted text-sm">${dateFormatted}</td>
            <td>
              <div class="flex-align gap-2">
                ${
                  !item.isDirectory
                    ? `<button class="btn btn-secondary btn-sm" onclick="fileManager.openEditor('${item.relativePath}')">✏ Edit</button>
                       <button class="btn btn-secondary btn-sm" onclick="fileManager.downloadFile('${item.relativePath}')">⬇</button>`
                    : ''
                }
                <button class="btn btn-secondary btn-sm" onclick="fileManager.renameItemPrompt('${item.relativePath}', '${item.name}')">Rename</button>
                <button class="btn btn-danger btn-sm" onclick="fileManager.deleteItem('${item.relativePath}')">🗑</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  },

  navigateTo(path) {
    this.currentPath = path;
    this.loadFiles();
  },

  async openEditor(relPath) {
    try {
      const data = await API.get(
        `/api/files/${this.currentSiteId}/read?path=${encodeURIComponent(relPath)}`
      );
      this.activeEditingPath = relPath;
      document.getElementById('editor-file-title').textContent = `Editing: ${relPath}`;
      document.getElementById('editor-textarea').value = data.content;
      document.getElementById('modal-file-editor').classList.remove('hidden');
    } catch (e) {}
  },

  async saveEditedFile() {
    if (!this.activeEditingPath) return;
    const content = document.getElementById('editor-textarea').value;

    try {
      await API.post(`/api/files/${this.currentSiteId}/write`, {
        path: this.activeEditingPath,
        content
      });
      API.toast('File saved successfully', 'success');
      document.getElementById('modal-file-editor').classList.add('hidden');
      this.loadFiles();
    } catch (e) {}
  },

  async handleUpload(e) {
    const file = e.target.files[0];
    if (!file || !this.currentSiteId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('destination', this.currentPath);

    try {
      await API.post(`/api/files/${this.currentSiteId}/upload`, formData);
      API.toast(`Uploaded ${file.name}`, 'success');
      e.target.value = '';
      this.loadFiles();
    } catch (e) {}
  },

  downloadFile(relPath) {
    window.open(
      `/api/files/${this.currentSiteId}/download?path=${encodeURIComponent(relPath)}`,
      '_blank'
    );
  },

  async handleNewFolder() {
    const folderName = prompt('Enter new folder name:');
    if (!folderName || !folderName.trim()) return;

    const targetPath = `${this.currentPath}/${folderName.trim()}`.replace(/\/+/g, '/');
    try {
      await API.post(`/api/files/${this.currentSiteId}/mkdir`, { path: targetPath });
      API.toast('Folder created', 'success');
      this.loadFiles();
    } catch (e) {}
  },

  async handleNewFile() {
    const fileName = prompt('Enter new file name: (e.g. script.js)');
    if (!fileName || !fileName.trim()) return;

    const targetPath = `${this.currentPath}/${fileName.trim()}`.replace(/\/+/g, '/');
    try {
      await API.post(`/api/files/${this.currentSiteId}/write`, { path: targetPath, content: '' });
      API.toast('File created', 'success');
      this.loadFiles();
      this.openEditor(targetPath);
    } catch (e) {}
  },

  async renameItemPrompt(oldRelPath, oldName) {
    const newName = prompt('Enter new name:', oldName);
    if (!newName || newName === oldName) return;

    const parentDir = oldRelPath.substring(0, oldRelPath.lastIndexOf('/'));
    const newPath = `${parentDir}/${newName.trim()}`.replace(/\/+/g, '/');

    try {
      await API.post(`/api/files/${this.currentSiteId}/rename`, {
        oldPath: oldRelPath,
        newPath
      });
      API.toast('Renamed item', 'success');
      this.loadFiles();
    } catch (e) {}
  },

  async deleteItem(relPath) {
    if (!confirm(`Are you sure you want to delete "${relPath}"?`)) return;

    try {
      await API.post(`/api/files/${this.currentSiteId}/delete`, { path: relPath });
      API.toast('Deleted item', 'info');
      this.loadFiles();
    } catch (e) {}
  },

  formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '-';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
};
