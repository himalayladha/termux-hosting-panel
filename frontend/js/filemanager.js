const fileManager = {
  currentSiteId: null,
  currentPath: '/',
  activeEditingPath: null,
  selectedFiles: new Set(),

  init() {
    this.bindEvents();
    this.setupDragAndDrop();
    this.populateSiteSelector();
  },

  bindEvents() {
    const siteSelect = document.getElementById('fm-site-select');
    if (siteSelect) {
      siteSelect.addEventListener('change', (e) => {
        this.currentSiteId = e.target.value;
        this.currentPath = '/';
        this.selectedFiles.clear();
        this.updateBatchBar();
        this.loadFiles();
      });
    }

    // Upload Multi-Files
    const uploadFilesBtn = document.getElementById('fm-upload-files-btn');
    const filesInput = document.getElementById('fm-files-input');
    if (uploadFilesBtn && filesInput) {
      uploadFilesBtn.addEventListener('click', () => filesInput.click());
      filesInput.addEventListener('change', (e) => this.handleMultiUpload(e.target.files));
    }

    // Upload ZIP
    const uploadZipBtn = document.getElementById('fm-upload-zip-btn');
    const zipInput = document.getElementById('fm-zip-input');
    if (uploadZipBtn && zipInput) {
      uploadZipBtn.addEventListener('click', () => zipInput.click());
      zipInput.addEventListener('change', (e) => this.handleMultiUpload(e.target.files, true));
    }

    // New Folder
    const newFolderBtn = document.getElementById('fm-new-folder-btn');
    if (newFolderBtn) {
      newFolderBtn.addEventListener('click', () => this.handleNewFolder());
    }

    // New File
    const newFileBtn = document.getElementById('fm-new-file-btn');
    if (newFileBtn) {
      newFileBtn.addEventListener('click', () => this.handleNewFile());
    }

    // Editor Save
    const saveEditorBtn = document.getElementById('editor-save-btn');
    if (saveEditorBtn) {
      saveEditorBtn.addEventListener('click', () => this.saveEditedFile());
    }

    // Select All Checkbox
    const selectAllCb = document.getElementById('fm-select-all');
    if (selectAllCb) {
      selectAllCb.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.fm-row-checkbox');
        checkboxes.forEach((cb) => {
          cb.checked = e.target.checked;
          const relPath = cb.getAttribute('data-path');
          if (e.target.checked) {
            this.selectedFiles.add(relPath);
          } else {
            this.selectedFiles.delete(relPath);
          }
        });
        this.updateBatchBar();
      });
    }

    // Batch Actions
    const batchDeleteBtn = document.getElementById('fm-batch-delete-btn');
    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener('click', () => this.handleBatchDelete());
    }

    const batchCompressBtn = document.getElementById('fm-batch-compress-btn');
    if (batchCompressBtn) {
      batchCompressBtn.addEventListener('click', () => this.handleBatchCompress());
    }
  },

  setupDragAndDrop() {
    const dropzone = document.getElementById('fm-dropzone');
    if (!dropzone) return;

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-over');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        const autoExtractCb = document.getElementById('fm-auto-extract-toggle');
        const autoExtract = autoExtractCb ? autoExtractCb.checked : true;
        this.handleMultiUpload(files, autoExtract);
      }
    });
  },

  async populateSiteSelector() {
    try {
      const sites = await API.get('/api/websites');
      const select = document.getElementById('fm-site-select');
      if (!select) return;

      select.innerHTML = sites
        .map((s) => `<option value="${s.id}">${s.name} (${s.type.toUpperCase()})</option>`)
        .join('');

      if (sites.length > 0) {
        this.currentSiteId = sites[0].id;
        this.loadFiles();
      } else {
        document.getElementById('fm-table-body').innerHTML = `
          <tr><td colspan="5" class="text-muted text-center" style="padding: 24px;">No websites available. Create one first.</td></tr>
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
      this.selectedFiles.clear();
      this.updateBatchBar();
      const selectAll = document.getElementById('fm-select-all');
      if (selectAll) selectAll.checked = false;
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  },

  renderBreadcrumbs(activePath) {
    const el = document.getElementById('fm-breadcrumbs');
    if (!el) return;

    const parts = (activePath || '/').split('/').filter((p) => p.length > 0);
    let accum = '';

    let html = `<span class="crumb" onclick="fileManager.navigateTo('/')"><i data-lucide="home" style="width: 13px; height: 13px; display: inline-block; vertical-align: middle; margin-right: 2px;"></i> root</span>`;
    parts.forEach((part) => {
      accum += `/${part}`;
      const pathValue = accum;
      html += ` <span class="crumb-separator">/</span> <span class="crumb" onclick="fileManager.navigateTo('${pathValue}')">${part}</span>`;
    });

    el.innerHTML = html;
    if (window.lucide) lucide.createIcons();
  },

  renderFileList(items) {
    const tbody = document.getElementById('fm-table-body');
    if (!tbody) return;

    if (!items || items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted text-center" style="padding: 24px;">This folder is empty. Drag and drop files above or click Upload.</td></tr>`;
      return;
    }

    tbody.innerHTML = items
      .map((item) => {
        let iconName = 'file';
        if (item.isDirectory) {
          iconName = 'folder';
        } else if (item.isZip) {
          iconName = 'file-archive';
        } else if (item.name.endsWith('.js') || item.name.endsWith('.json')) {
          iconName = 'file-code';
        } else if (item.name.endsWith('.html') || item.name.endsWith('.css')) {
          iconName = 'file-code';
        } else if (item.name.endsWith('.py') || item.name.endsWith('.php')) {
          iconName = 'file-code';
        } else if (['.png', '.jpg', '.jpeg', '.svg', '.webp'].some((ext) => item.name.endsWith(ext))) {
          iconName = 'image';
        } else if (item.name.endsWith('.db') || item.name.endsWith('.sqlite')) {
          iconName = 'database';
        }

        const sizeFormatted = item.isDirectory ? '-' : this.formatBytes(item.size);
        const dateFormatted = new Date(item.modifiedAt).toLocaleString();

        return `
          <tr>
            <td>
              <input type="checkbox" class="fm-row-checkbox" data-path="${item.relativePath}" onchange="fileManager.toggleFileSelection('${item.relativePath}', this.checked)">
            </td>
            <td>
              <div class="flex-align gap-2">
                <i data-lucide="${iconName}" style="width: 16px; height: 16px; color: ${item.isDirectory ? '#38bdf8' : (item.isZip ? '#f59e0b' : '#94a3b8')};"></i>
                ${
                  item.isDirectory
                    ? `<a href="javascript:void(0)" onclick="fileManager.navigateTo('${item.relativePath}')" style="font-weight: 600;">${item.name}</a>`
                    : `<a href="javascript:void(0)" onclick="fileManager.openEditor('${item.relativePath}')">${item.name}</a>`
                }
              </div>
            </td>
            <td class="text-muted text-sm">${sizeFormatted}</td>
            <td class="text-muted text-sm">${dateFormatted}</td>
            <td style="text-align: right;">
              <div class="flex-align gap-1" style="justify-content: flex-end;">
                ${
                  item.isZip
                    ? `<button class="btn btn-secondary btn-sm" onclick="fileManager.extractZipPrompt('${item.relativePath}')" title="Extract ZIP archive">
                         <i data-lucide="archive-restore" style="width: 13px; height: 13px; margin-right: 3px;"></i> Extract
                       </button>`
                    : ''
                }
                ${
                  !item.isDirectory
                    ? `<button class="btn btn-secondary btn-sm" onclick="fileManager.openEditor('${item.relativePath}')" title="Edit file">
                         <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i>
                       </button>
                       <button class="btn btn-secondary btn-sm" onclick="fileManager.downloadFile('${item.relativePath}')" title="Download">
                         <i data-lucide="download" style="width: 13px; height: 13px;"></i>
                       </button>`
                    : ''
                }
                <button class="btn btn-secondary btn-sm" onclick="fileManager.renameItemPrompt('${item.relativePath}', '${item.name}')" title="Rename">
                  <i data-lucide="edit" style="width: 13px; height: 13px;"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="fileManager.deleteItem('${item.relativePath}')" title="Delete">
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

  toggleFileSelection(relPath, isChecked) {
    if (isChecked) {
      this.selectedFiles.add(relPath);
    } else {
      this.selectedFiles.delete(relPath);
    }
    this.updateBatchBar();
  },

  updateBatchBar() {
    const bar = document.getElementById('fm-batch-bar');
    const text = document.getElementById('fm-selected-count-text');
    if (!bar || !text) return;

    const count = this.selectedFiles.size;
    if (count > 0) {
      bar.classList.remove('hidden');
      text.textContent = `${count} item${count > 1 ? 's' : ''} selected`;
    } else {
      bar.classList.add('hidden');
    }
  },

  navigateTo(path) {
    this.currentPath = path;
    this.loadFiles();
  },

  async handleMultiUpload(files, forceAutoExtract = false) {
    if (!files || files.length === 0 || !this.currentSiteId) return;

    const autoExtractCb = document.getElementById('fm-auto-extract-toggle');
    const autoExtract = forceAutoExtract || (autoExtractCb ? autoExtractCb.checked : false);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('destination', this.currentPath);
    formData.append('autoExtract', autoExtract);

    const progressBox = document.getElementById('fm-upload-progress');
    const statusText = document.getElementById('fm-upload-status-text');
    const percentText = document.getElementById('fm-upload-percent-text');
    const progressBar = document.getElementById('fm-upload-progress-bar');

    if (progressBox) {
      progressBox.classList.remove('hidden');
      if (statusText) statusText.textContent = `Uploading ${files.length} file(s)...`;
      if (percentText) percentText.textContent = '100%';
      if (progressBar) progressBar.style.width = '100%';
    }

    try {
      const res = await API.post(`/api/files/${this.currentSiteId}/upload`, formData);
      API.toast(`Successfully uploaded ${res.count || files.length} item(s)${autoExtract ? ' (Auto-extracted archives)' : ''}!`, 'success');
      this.loadFiles();
    } catch (e) {
      // Toast displayed by API
    } finally {
      setTimeout(() => {
        if (progressBox) progressBox.classList.add('hidden');
      }, 1000);
    }
  },

  async extractZipPrompt(zipRelPath) {
    if (!confirm(`Extract archive "${zipRelPath}" into current folder?`)) return;

    try {
      await API.post(`/api/files/${this.currentSiteId}/extract`, {
        path: zipRelPath,
        destination: this.currentPath
      });
      API.toast('Archive extracted successfully!', 'success');
      this.loadFiles();
    } catch (e) {}
  },

  async handleBatchCompress() {
    if (this.selectedFiles.size === 0) return;

    const zipName = prompt('Enter ZIP archive filename:', 'archive.zip');
    if (!zipName || !zipName.trim()) return;

    try {
      await API.post(`/api/files/${this.currentSiteId}/compress`, {
        paths: Array.from(this.selectedFiles),
        zipName: zipName.trim(),
        destination: this.currentPath
      });
      API.toast('ZIP archive created successfully!', 'success');
      this.loadFiles();
    } catch (e) {}
  },

  async handleBatchDelete() {
    const count = this.selectedFiles.size;
    if (count === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${count} selected item(s)?`)) return;

    try {
      await API.post(`/api/files/${this.currentSiteId}/batch-delete`, {
        paths: Array.from(this.selectedFiles)
      });
      API.toast(`Deleted ${count} items`, 'info');
      this.loadFiles();
    } catch (e) {}
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
