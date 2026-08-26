const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/app.config');
const authService = require('../auth/auth.service');

// Helper to parse cookies from header
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

// Detect default shell
function getDefaultShell() {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe';
  }

  const termuxBash = '/data/data/com.termux/files/usr/bin/bash';
  if (fs.existsSync(termuxBash)) return termuxBash;

  const usrBash = '/usr/bin/bash';
  if (fs.existsSync(usrBash)) return usrBash;

  const binBash = '/bin/bash';
  if (fs.existsSync(binBash)) return binBash;

  return process.env.SHELL || '/bin/sh';
}

function initTerminalServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/api/terminal/ws') {
      // 1. Authenticate WebSocket upgrade
      const cookies = parseCookies(request.headers.cookie);
      const token = cookies.token || new URL(request.url, `http://${request.headers.host}`).searchParams.get('token');

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const user = await authService.verifySession(token);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, user);
      });
    }
  });

  wss.on('connection', (ws, req, user) => {
    const shell = getDefaultShell();
    const workingDir = process.env.HOME || config.ROOT_DIR;

    // Banner message
    const welcomeBanner = `\r\n\x1b[1;36m==================================================\x1b[0m\r\n` +
      `\x1b[1;32m  📱 TermuxPanel Interactive Web Terminal\x1b[0m\r\n` +
      `  User: \x1b[1;33m${user.username}\x1b[0m | Shell: \x1b[1;35m${path.basename(shell)}\x1b[0m\r\n` +
      `  Root: \x1b[1;34m${workingDir}\x1b[0m\r\n` +
      `\x1b[1;36m==================================================\x1b[0m\r\n\r\n`;

    ws.send(welcomeBanner);

    // Spawn interactive shell process
    let shellProcess = null;
    try {
      shellProcess = spawn(shell, [], {
        cwd: workingDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LINES: '30',
          COLUMNS: '100'
        }
      });
    } catch (err) {
      ws.send(`\r\n\x1b[1;31mFailed to spawn shell: ${err.message}\x1b[0m\r\n`);
      ws.close();
      return;
    }

    // Pipe stdout and stderr to WebSocket
    shellProcess.stdout.on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data.toString('utf8'));
      }
    });

    shellProcess.stderr.on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data.toString('utf8'));
      }
    });

    shellProcess.on('exit', (code) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n\x1b[1;33m[Process exited with code ${code}]\x1b[0m\r\n`);
        ws.close();
      }
    });

    shellProcess.on('error', (err) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n\x1b[1;31m[Process error: ${err.message}]\x1b[0m\r\n`);
      }
    });

    // Handle messages from client
    ws.on('message', (message) => {
      try {
        const text = message.toString('utf8');
        // Check if message is a JSON control command
        if (text.startsWith('{') && text.endsWith('}')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.type === 'input' && parsed.data) {
              shellProcess.stdin.write(parsed.data);
              return;
            }
          } catch (_) {}
        }
        shellProcess.stdin.write(text);
      } catch (err) {
        console.error('[Terminal] Stdin write error:', err.message);
      }
    });

    ws.on('close', () => {
      if (shellProcess && !shellProcess.killed) {
        try {
          shellProcess.kill();
        } catch (_) {}
      }
    });
  });

  return wss;
}

module.exports = {
  initTerminalServer,
  getDefaultShell
};
