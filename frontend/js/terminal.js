const terminalManager = {
  term: null,
  socket: null,
  fitAddon: null,
  isConnected: false,

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const reconnectBtn = document.getElementById('terminal-btn-reconnect');
    if (reconnectBtn) {
      reconnectBtn.addEventListener('click', () => this.connect());
    }

    const clearBtn = document.getElementById('terminal-btn-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (this.term) {
          this.term.clear();
          this.term.focus();
        }
      });
    }
  },

  getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  },

  openTerminal() {
    const container = document.getElementById('terminal-container');
    if (!container) return;

    if (!this.term) {
      if (typeof Terminal !== 'undefined') {
        this.term = new Terminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
          convertEol: true,
          theme: {
            background: '#090d16',
            foreground: '#f8fafc',
            cursor: '#38bdf8',
            selectionBackground: 'rgba(56, 189, 248, 0.3)',
            black: '#000000',
            red: '#f87171',
            green: '#4ade80',
            yellow: '#fbbf24',
            blue: '#60a5fa',
            magenta: '#c084fc',
            cyan: '#38bdf8',
            white: '#ffffff'
          }
        });

        if (typeof FitAddon !== 'undefined' && FitAddon.FitAddon) {
          this.fitAddon = new FitAddon.FitAddon();
          this.term.loadAddon(this.fitAddon);
        }

        this.term.open(container);

        this.term.onData((data) => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
          }
        });

        window.addEventListener('resize', () => {
          if (this.fitAddon) {
            try {
              this.fitAddon.fit();
            } catch (_) {}
          }
        });
      } else {
        container.innerHTML = '<div style="padding: 20px; color: #94a3b8;">Initializing terminal engine...</div>';
      }
    }

    setTimeout(() => {
      if (this.fitAddon) {
        try {
          this.fitAddon.fit();
        } catch (_) {}
      }
      if (this.term) this.term.focus();
    }, 100);

    if (!this.isConnected) {
      this.connect();
    }
  },

  connect() {
    const statusText = document.getElementById('terminal-status-indicator');
    if (this.socket) {
      try {
        this.socket.close();
      } catch (_) {}
    }

    const sessionToken = this.getCookie('tp_session') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws${sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : ''}`;

    if (statusText) {
      statusText.textContent = 'CONNECTING...';
      statusText.className = 'badge badge-secondary';
      statusText.style.color = '#f59e0b';
    }

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        if (statusText) {
          statusText.textContent = 'ONLINE (LIVE SHELL)';
          statusText.className = 'badge badge-success';
          statusText.style.color = '';
        }
        if (this.fitAddon) {
          try {
            this.fitAddon.fit();
          } catch (_) {}
        }
        if (this.term) this.term.focus();
      };

      this.socket.onmessage = (event) => {
        if (this.term) {
          this.term.write(event.data);
        }
      };

      this.socket.onclose = () => {
        this.isConnected = false;
        if (statusText) {
          statusText.textContent = 'DISCONNECTED';
          statusText.className = 'badge badge-danger';
          statusText.style.color = '';
        }
      };

      this.socket.onerror = () => {
        this.isConnected = false;
        if (statusText) {
          statusText.textContent = 'CONNECTION ERROR';
          statusText.className = 'badge badge-danger';
          statusText.style.color = '';
        }
      };
    } catch (err) {
      if (statusText) {
        statusText.textContent = 'FAILED TO CONNECT';
        statusText.className = 'badge badge-danger';
        statusText.style.color = '';
      }
    }
  }
};
