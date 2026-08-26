const API = {
  baseUrl: '',

  async request(endpoint, options = {}) {
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    if (options.body instanceof FormData) {
      delete defaultHeaders['Content-Type']; // Let browser set multipart boundary
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, config);

      if (response.status === 401) {
        // Unauthorized
        if (!endpoint.includes('/api/auth/status') && !endpoint.includes('/api/auth/login')) {
          app.showAuthModal(false);
          throw new Error('Session expired. Please log in again.');
        }
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      this.toast(err.message, 'error');
      throw err;
    }
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};

/**
 * Universal Modern Modal Dialogs (No Browser Alert / Confirm / Prompt)
 */
const UI = {
  alert(message, title = 'Notice', type = 'info') {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-app-dialog');
      if (!modal) {
        alert(message);
        return resolve(true);
      }

      const titleEl = document.getElementById('dialog-title');
      const msgEl = document.getElementById('dialog-message');
      const cancelBtn = document.getElementById('dialog-btn-cancel');
      const confirmBtn = document.getElementById('dialog-btn-confirm');
      const iconContainer = document.getElementById('dialog-icon-container');
      const iconEl = document.getElementById('dialog-icon');
      const promptContainer = document.getElementById('dialog-prompt-container');

      if (promptContainer) promptContainer.classList.add('hidden');
      if (cancelBtn) cancelBtn.classList.add('hidden');
      if (confirmBtn) {
        confirmBtn.className = 'btn btn-primary';
        confirmBtn.textContent = 'OK';
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;

      if (iconContainer && iconEl) {
        if (type === 'success') {
          iconContainer.style.background = 'rgba(34, 197, 94, 0.15)';
          iconContainer.style.color = '#22c55e';
          iconEl.setAttribute('data-lucide', 'check-circle-2');
        } else if (type === 'error' || type === 'danger') {
          iconContainer.style.background = 'rgba(239, 68, 68, 0.15)';
          iconContainer.style.color = '#ef4444';
          iconEl.setAttribute('data-lucide', 'alert-triangle');
        } else if (type === 'warning') {
          iconContainer.style.background = 'rgba(245, 158, 11, 0.15)';
          iconContainer.style.color = '#f59e0b';
          iconEl.setAttribute('data-lucide', 'alert-circle');
        } else {
          iconContainer.style.background = 'rgba(56, 189, 248, 0.15)';
          iconContainer.style.color = '#38bdf8';
          iconEl.setAttribute('data-lucide', 'info');
        }
      }

      if (window.lucide) lucide.createIcons();
      modal.classList.remove('hidden');

      const handleConfirm = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        modal.classList.add('hidden');
        resolve(true);
      };

      confirmBtn.addEventListener('click', handleConfirm);
    });
  },

  confirm(message, title = 'Confirm Action', { confirmText = 'Confirm', cancelText = 'Cancel', type = 'danger' } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-app-dialog');
      if (!modal) {
        return resolve(confirm(message));
      }

      const titleEl = document.getElementById('dialog-title');
      const msgEl = document.getElementById('dialog-message');
      const cancelBtn = document.getElementById('dialog-btn-cancel');
      const confirmBtn = document.getElementById('dialog-btn-confirm');
      const iconContainer = document.getElementById('dialog-icon-container');
      const iconEl = document.getElementById('dialog-icon');
      const promptContainer = document.getElementById('dialog-prompt-container');

      if (promptContainer) promptContainer.classList.add('hidden');
      if (cancelBtn) {
        cancelBtn.classList.remove('hidden');
        cancelBtn.textContent = cancelText;
      }
      if (confirmBtn) {
        confirmBtn.textContent = confirmText;
        confirmBtn.className = type === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;

      if (iconContainer && iconEl) {
        if (type === 'danger') {
          iconContainer.style.background = 'rgba(239, 68, 68, 0.15)';
          iconContainer.style.color = '#ef4444';
          iconEl.setAttribute('data-lucide', 'alert-triangle');
        } else {
          iconContainer.style.background = 'rgba(245, 158, 11, 0.15)';
          iconContainer.style.color = '#f59e0b';
          iconEl.setAttribute('data-lucide', 'help-circle');
        }
      }

      if (window.lucide) lucide.createIcons();
      modal.classList.remove('hidden');

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        modal.classList.add('hidden');
      };

      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
    });
  },

  prompt(message, title = 'Input Required', defaultValue = '', placeholder = '') {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-app-dialog');
      if (!modal) {
        return resolve(prompt(message, defaultValue));
      }

      const titleEl = document.getElementById('dialog-title');
      const msgEl = document.getElementById('dialog-message');
      const cancelBtn = document.getElementById('dialog-btn-cancel');
      const confirmBtn = document.getElementById('dialog-btn-confirm');
      const iconContainer = document.getElementById('dialog-icon-container');
      const iconEl = document.getElementById('dialog-icon');
      const promptContainer = document.getElementById('dialog-prompt-container');
      const promptInput = document.getElementById('dialog-prompt-input');

      if (promptContainer) promptContainer.classList.remove('hidden');
      if (promptInput) {
        promptInput.value = defaultValue;
        promptInput.placeholder = placeholder;
      }
      if (cancelBtn) {
        cancelBtn.classList.remove('hidden');
        cancelBtn.textContent = 'Cancel';
      }
      if (confirmBtn) {
        confirmBtn.textContent = 'OK';
        confirmBtn.className = 'btn btn-primary';
      }

      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;

      if (iconContainer && iconEl) {
        iconContainer.style.background = 'rgba(56, 189, 248, 0.15)';
        iconContainer.style.color = '#38bdf8';
        iconEl.setAttribute('data-lucide', 'edit-3');
      }

      if (window.lucide) lucide.createIcons();
      modal.classList.remove('hidden');
      if (promptInput) {
        setTimeout(() => promptInput.focus(), 100);
      }

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        if (promptInput) promptInput.removeEventListener('keydown', handleKey);
        modal.classList.add('hidden');
      };

      const handleConfirm = () => {
        const val = promptInput ? promptInput.value : '';
        cleanup();
        resolve(val);
      };

      const handleCancel = () => {
        cleanup();
        resolve(null);
      };

      const handleKey = (e) => {
        if (e.key === 'Enter') handleConfirm();
        if (e.key === 'Escape') handleCancel();
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
      if (promptInput) promptInput.addEventListener('keydown', handleKey);
    });
  }
};
