const express = require('express');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const config = require('./config/app.config');
const db = require('./database/db');
const processService = require('./services/process.service');
const systemService = require('./services/system.service');
const terminalService = require('./services/terminal.service');

// Route imports
const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const websitesRoutes = require('./routes/websites.routes');
const filesRoutes = require('./routes/files.routes');
const databasesRoutes = require('./routes/databases.routes');
const cronRoutes = require('./routes/cron.routes');
const logsRoutes = require('./routes/logs.routes');
const backupsRoutes = require('./routes/backups.routes');
const tunnelRoutes = require('./routes/tunnel.routes');
const domainsRoutes = require('./routes/domains.routes');
const settingsRoutes = require('./routes/settings.routes');
const webhooksRoutes = require('./routes/webhooks.routes');
const hardwareRoutes = require('./routes/hardware.routes');
const hardwareService = require('./services/hardware.service');
const securityRoutes = require('./routes/security.routes');
const { ipBanGuard } = require('./auth/ipban.middleware');

const app = express();
const server = http.createServer(app);

// Initialize WebSocket Terminal Server
terminalService.initTerminalServer(server);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false // Allow inline scripts/styles for administrative SPA
  })
);

// Cross-Origin Resource Sharing
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

// Body and Cookie Parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// IP Ban & Brute-Force Guard (Blocks banned IPs immediately)
app.use(ipBanGuard);

// Rate Limiting for Auth Endpoints (Brute Force Protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/websites', websitesRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/databases', databasesRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/backups', backupsRoutes);
app.use('/api/tunnel', tunnelRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/hardware', hardwareRoutes);
app.use('/api/security', securityRoutes);

// Serve Frontend Static Assets
const frontendPath = path.resolve(__dirname, '../frontend');
app.use(express.static(frontendPath));

// Fallback to SPA index.html for unknown non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const indexPath = path.join(frontendPath, 'index.html');
  res.sendFile(indexPath);
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Bootstrap Database & Start Server
async function startServer() {
  try {
    console.log('==============================================');
    console.log('            TERMUXPANEL HOSTING ENGINE        ');
    console.log('==============================================');

    await db.initDb();

    // Start Android Hardware & Battery Guard Watchdog
    hardwareService.startWatchdog(60);

    server.listen(config.PORT, async () => {
      const netUrls = systemService.getSystemMetrics ? (await systemService.getSystemMetrics()).network : null;
      console.log(`[TermuxPanel] Server is LIVE & Listening on 0.0.0.0:${config.PORT}`);
      console.log(`  • On Phone:           http://127.0.0.1:${config.PORT}`);
      if (netUrls && netUrls.networkUrl) {
        console.log(`  • On PC (Same Wi-Fi): ${netUrls.networkUrl}`);
      }
      console.log(`[TermuxPanel] Storage root: ${config.STORAGE_DIR}`);
      console.log(`[TermuxPanel] Ready for Cloudflare Tunnel connection`);
      console.log('----------------------------------------------');

      // Autostart websites configured for boot
      try {
        await processService.autostartWebsites();
      } catch (err) {
        console.warn('[TermuxPanel] Autostart error:', err.message);
      }
    });
  } catch (err) {
    console.error('[TermuxPanel] Startup failure:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, server, startServer };
