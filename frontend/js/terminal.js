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
        if (this.term) this.term.clear();
      });
    }
  },

  openTerminal() {
    const container = document.getElementById('terminal-container');
    if (!container) return;

    if (!this.term) {
      if (typeof Terminal !== 'undefined') {
        this.term = new Terminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
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
        if (this.fitAddon) this.fitAddon.fit();

        this.term.onData((data) => {
          if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
          }
        });

        window.addEventListener('resize', () => {
          if (this.fitAddon) this.fitAddon.fit();
        });
      } else {
        // Fallback simple pre element if xterm.js not yet loaded
        container.innerHTML = '<div style="padding: 20px; color: #94a3b8;">Initializing terminal engine...</div>';
      }
    }

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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/terminal/ws`;

    if (statusText) {
      statusText.textContent = 'CONNECTING...';
      statusText.style.color = '#f59e0b';
    }

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        this.isConnected = true;
        if (statusText) {
          statusText.textContent = 'CONNECTED (LIVE SHELL)';
          statusText.style.color = '#22c55e';
        }
        if (this.fitAddon) this.fitAddon.fit();
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
          statusText.style.color = '#f87171';
        }
        if (this.term) {
          this.term.write('\r\n\x1b[1;31m[Session closed. Click "Reconnect" above to start a new shell session]\x1b[0m\r\n');
        }
      };

      this.socket.onerror = () => {
        this.isConnected = false;
        if (statusText) {
          statusText.textContent = 'CONNECTION ERROR';
          statusText.style.color = '#f87171';
        }
      };
    } catch (err) {
      if (statusText) {
        statusText.textContent = 'FAILED TO CONNECT';
        statusText.style.color = '#f87171';
      }
    }
  }
};
