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
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

// Detect default shell and appropriate interactive arguments
function getShellConfig() {
  if (process.platform === 'win32') {
    const comspec = process.env.COMSPEC || 'powershell.exe';
    return {
      command: comspec,
      args: comspec.toLowerCase().includes('powershell') ? ['-NoLogo'] : []
    };
  }

  const termuxBash = '/data/data/com.termux/files/usr/bin/bash';
  if (fs.existsSync(termuxBash)) {
    return { command: termuxBash, args: ['-i'] };
  }

  const usrBash = '/usr/bin/bash';
  if (fs.existsSync(usrBash)) {
    return { command: usrBash, args: ['-i'] };
  }

  const binBash = '/bin/bash';
  if (fs.existsSync(binBash)) {
    return { command: binBash, args: ['-i'] };
  }

  return { command: process.env.SHELL || '/bin/sh', args: ['-i'] };
}

function getDefaultShell() {
  return getShellConfig().command;
}

function initTerminalServer(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    try {
      const urlObj = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
      const pathname = urlObj.pathname;

      if (pathname === '/api/terminal/ws') {
        // Extract session token from cookies or query string
        const cookies = parseCookies(request.headers.cookie);
        const token = cookies.tp_session || cookies.token || urlObj.searchParams.get('token');

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        const user = await authService.validateSession(token);
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request, user);
        });
      }
    } catch (err) {
      console.error('[Terminal Upgrade Error]', err);
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req, user) => {
    const shellConf = getShellConfig();
    const workingDir = process.env.HOME || config.ROOT_DIR;

    // Welcome banner
    const welcomeBanner = `\r\n\x1b[1;36m==================================================\x1b[0m\r\n` +
      `\x1b[1;32m  📱 TermuxPanel Interactive Web Terminal\x1b[0m\r\n` +
      `  User: \x1b[1;33m${user.username}\x1b[0m | Shell: \x1b[1;35m${path.basename(shellConf.command)}\x1b[0m\r\n` +
      `  Root: \x1b[1;34m${workingDir}\x1b[0m\r\n` +
      `\x1b[1;36m==================================================\x1b[0m\r\n\r\n`;

    ws.send(welcomeBanner);

    // Spawn shell process
    let shellProcess = null;
    try {
      shellProcess = spawn(shellConf.command, shellConf.args, {
        cwd: workingDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LINES: '30',
          COLUMNS: '100',
          PS1: '\\[\\033[01;32m\\]termux@android\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ '
        }
      });
    } catch (err) {
      ws.send(`\r\n\x1b[1;31mFailed to spawn shell (${shellConf.command}): ${err.message}\x1b[0m\r\n`);
      ws.close();
      return;
    }

    // Forward stdout
    shellProcess.stdout.on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data.toString('utf8'));
      }
    });

    // Forward stderr
    shellProcess.stderr.on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data.toString('utf8'));
      }
    });

    shellProcess.on('exit', (code) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n\x1b[1;33m[Shell process exited with code ${code}]\x1b[0m\r\n`);
        ws.close();
      }
    });

    shellProcess.on('error', (err) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n\x1b[1;31m[Process error: ${err.message}]\x1b[0m\r\n`);
      }
    });

    // Handle incoming terminal input
    ws.on('message', (message) => {
      try {
        const text = message.toString('utf8');
        // Handle control JSON or raw input
        if (text.startsWith('{') && text.endsWith('}')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.type === 'input' && parsed.data !== undefined) {
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
