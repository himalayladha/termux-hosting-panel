const path = require('path');
const dotenv = require('dotenv');

const ROOT_DIR = process.env.TERMUX_PANEL_ROOT || path.resolve(__dirname, '../../');

// Explicitly load config/panel.env
const envPath = path.join(ROOT_DIR, 'config', 'panel.env');
dotenv.config({ path: envPath });

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 9000,
  HOST: process.env.HOST || '0.0.0.0',
  SESSION_SECRET: process.env.SESSION_SECRET || 'termux-panel-default-secret-change-in-production',
  ROOT_DIR,
  DATA_DIR: path.join(ROOT_DIR, 'data'),
  DB_PATH: path.join(ROOT_DIR, 'data', 'panel.db'),
  BACKUP_DIR: path.join(ROOT_DIR, 'data', 'backups'),
  STORAGE_DIR: path.join(ROOT_DIR, 'storage', 'websites'),
  LOGS_DIR: path.join(ROOT_DIR, 'logs'),
  PANEL_LOG_FILE: path.join(ROOT_DIR, 'logs', 'panel.log'),
  CLOUDFLARE_LOG_FILE: path.join(ROOT_DIR, 'logs', 'cloudflared.log'),
  CONFIG_DIR: path.join(ROOT_DIR, 'config'),
  CLOUDFLARE_TOKEN_FILE: path.join(ROOT_DIR, 'config', 'cloudflare-token'),
  CLOUDFLARE_API_TOKEN_FILE: path.join(ROOT_DIR, 'config', 'cloudflare-api-token'),
  NGROK_TOKEN_FILE: path.join(ROOT_DIR, 'config', 'ngrok-token'),
  NGROK_LOG_FILE: path.join(ROOT_DIR, 'logs', 'ngrok.log'),
  LOCLX_TOKEN_FILE: path.join(ROOT_DIR, 'config', 'loclx-token'),
  LOCLX_LOG_FILE: path.join(ROOT_DIR, 'logs', 'loclx.log'),
  TAILSCALE_LOG_FILE: path.join(ROOT_DIR, 'logs', 'tailscale.log'),
  TEMPLATES_DIR: path.join(ROOT_DIR, 'templates'),
  PORT_RANGE_START: 8100,
  PORT_RANGE_END: 8999,
  APP_VERSION: '1.0.0'
};
