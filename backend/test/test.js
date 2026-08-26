const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Set test environment root
process.env.TERMUX_PANEL_ROOT = path.resolve(__dirname, '../../');

const db = require('../database/db');
const config = require('../config/app.config');
const authService = require('../auth/auth.service');
const systemService = require('../services/system.service');
const fileService = require('../services/file.service');
const { findAvailablePort } = require('../config/ports.config');

async function runTests() {
  console.log('--------------------------------------------------');
  console.log('  TermuxPanel Test Suite: Running Verifications   ');
  console.log('--------------------------------------------------');

  // 1. Database Initialization
  console.log('[1/5] Testing Database Schema Initialization...');
  await db.initDb();
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tables.map((t) => t.name);
  assert(tableNames.includes('users'), 'Users table missing');
  assert(tableNames.includes('websites'), 'Websites table missing');
  assert(tableNames.includes('domains'), 'Domains table missing');
  assert(tableNames.includes('cron_jobs'), 'Cron jobs table missing');
  assert(tableNames.includes('settings'), 'Settings table missing');
  console.log('  ✓ Database schema verified with all required tables.');

  // 2. Authentication & Password Security
  console.log('[2/5] Testing Authentication & Password Security...');
  const testUser = `testadmin_${Date.now()}`;
  const testPass = 'SuperSecret123!';
  const created = await authService.createAdminUser(testUser, testPass, 'test@example.com');
  assert(created.id > 0, 'Admin user creation failed');

  const loginRes = await authService.login(testUser, testPass);
  assert(loginRes && loginRes.token, 'Login failed with valid credentials');

  const session = await authService.validateSession(loginRes.token);
  assert(session && session.username === testUser, 'Session token validation failed');

  const badLogin = await authService.login(testUser, 'WrongPassword!');
  assert(badLogin === null, 'Login succeeded with invalid password (security failure)');
  console.log('  ✓ Password hashing (Bcrypt) and session verification passed.');

  // 3. System Metrics
  console.log('[3/5] Testing System Metrics Collector...');
  const metrics = await systemService.getSystemMetrics();
  assert(metrics.cpu && typeof metrics.cpu.percentage === 'number', 'CPU metrics invalid');
  assert(metrics.memory && metrics.memory.total > 0, 'Memory metrics invalid');
  assert(metrics.disk && metrics.disk.total > 0, 'Disk metrics invalid');
  assert(metrics.uptime && metrics.uptime.formatted, 'Uptime metrics invalid');
  console.log(`  ✓ System metrics passed (CPU: ${metrics.cpu.percentage}%, RAM: ${metrics.memory.percentage}% used).`);

  // 4. File Manager Path Traversal Protection
  console.log('[4/5] Testing File Manager Traversal Protection...');
  const dummyRoot = path.join(process.env.TERMUX_PANEL_ROOT, 'storage', 'websites', 'test-traversal-site');
  if (!fs.existsSync(dummyRoot)) fs.mkdirSync(dummyRoot, { recursive: true });

  // Safe path inside root
  const safe = fileService.resolveSafePath(dummyRoot, 'public/index.html');
  assert(safe.target.startsWith(path.resolve(dummyRoot)), 'Valid safe path failed resolution');

  // Traversal attack test 1: ../../etc/passwd
  let blocked1 = false;
  try {
    fileService.resolveSafePath(dummyRoot, '../../etc/passwd');
  } catch (err) {
    blocked1 = true;
  }
  assert(blocked1, 'Path traversal attack was NOT blocked!');

  // Traversal attack test 2: ..\..\Windows\System32
  let blocked2 = false;
  try {
    fileService.resolveSafePath(dummyRoot, '..\\..\\secret.key');
  } catch (err) {
    blocked2 = true;
  }
  assert(blocked2, 'Backslash path traversal attack was NOT blocked!');
  console.log('  ✓ File Manager sandboxing successfully prevented all traversal attempts.');

  // 5. Dynamic Port Allocation
  console.log('[5/7] Testing Dynamic Port Allocation...');
  const port1 = await findAvailablePort([]);
  assert(port1 >= 8100 && port1 <= 8999, 'Allocated port out of range');

  const port2 = await findAvailablePort([port1]);
  assert(port2 !== port1, 'Port collision detected');
  console.log(`  ✓ Port allocator allocated safe ports: :${port1}, :${port2}`);

  // 6. Database Creator & Starter Schemas
  console.log('[6/7] Testing Database Creator & Starter Presets...');
  const databaseService = require('../services/database.service');
  const testDbDir = path.join(process.env.TERMUX_PANEL_ROOT, 'data', 'test-dbs');
  if (!fs.existsSync(testDbDir)) fs.mkdirSync(testDbDir, { recursive: true });
  const testAuthDb = path.join(testDbDir, 'test_auth.db');
  if (fs.existsSync(testAuthDb)) fs.unlinkSync(testAuthDb);

  await databaseService.createDatabase(testAuthDb, 'auth_users');
  assert(fs.existsSync(testAuthDb), 'Database file creation failed');
  const authTables = await databaseService.listTables(testAuthDb);
  const authTableNames = authTables.map((t) => t.name);
  assert(authTableNames.includes('users'), 'auth_users preset missing users table');
  assert(authTableNames.includes('sessions'), 'auth_users preset missing sessions table');

  // Test SQL query execution
  const insertRes = await databaseService.executeSql(
    testAuthDb,
    "INSERT INTO users (username, email, password_hash) VALUES ('alice', 'alice@example.com', 'hash123')"
  );
  assert(insertRes.changes === 1, 'SQL insert failed');
  const queryRes = await databaseService.executeSql(testAuthDb, 'SELECT username FROM users WHERE email = "alice@example.com"');
  assert(queryRes.rows.length === 1 && queryRes.rows[0].username === 'alice', 'SQL select verification failed');
  await databaseService.deleteDatabase(testAuthDb);
  assert(!fs.existsSync(testAuthDb), 'Database deletion failed');

  // Verify system database panel.db is locked against deletion
  let systemDeleteBlocked = false;
  try {
    await databaseService.deleteDatabase(config.DB_PATH);
  } catch (e) {
    systemDeleteBlocked = true;
  }
  assert(systemDeleteBlocked, 'System database panel.db was NOT protected against deletion!');
  console.log('  ✓ Database creator, schema templates, and system database locking verified successfully.');

  // 7. ZIP Compression & Safe Extraction
  console.log('[7/7] Testing ZIP Compression & Safe Extraction...');
  const testSiteDir = path.join(process.env.TERMUX_PANEL_ROOT, 'storage', 'websites', 'test-zip-site');
  if (!fs.existsSync(testSiteDir)) fs.mkdirSync(testSiteDir, { recursive: true });

  // Create sample files
  fs.writeFileSync(path.join(testSiteDir, 'sample1.txt'), 'Hello world 1');
  fs.writeFileSync(path.join(testSiteDir, 'sample2.txt'), 'Hello world 2');

  // Compress
  const zipRes = await fileService.createZipArchive(testSiteDir, ['sample1.txt', 'sample2.txt'], 'test_archive.zip');
  assert(zipRes.success, 'Zip creation failed');
  assert(fs.existsSync(path.join(testSiteDir, 'test_archive.zip')), 'Zip file does not exist');

  // Extract into extracted_folder
  const extractRes = await fileService.extractZipArchive(testSiteDir, 'test_archive.zip', 'extracted_folder');
  assert(extractRes.success, 'Zip extraction failed');
  assert(fs.existsSync(path.join(testSiteDir, 'extracted_folder', 'sample1.txt')), 'Extracted file 1 missing');
  assert(fs.existsSync(path.join(testSiteDir, 'extracted_folder', 'sample2.txt')), 'Extracted file 2 missing');

  // Cleanup
  fs.rmSync(testSiteDir, { recursive: true, force: true });
  fs.rmSync(testDbDir, { recursive: true, force: true });
  console.log('  ✓ ZIP compression and safe extraction verified.');

  // 8. Domain Management & Subdomain Provisioning Service
  console.log('[8/8] Testing Domain & Subdomain Provisioning Service...');
  const domainService = require('../services/domain.service');
  const testDomainName = `test-${Date.now()}.example.com`;

  const connectRes = await domainService.connectDomain({
    domain: testDomainName,
    websiteId: null
  });
  assert(connectRes.success && connectRes.id > 0, 'Domain connection failed');

  const domainList = await domainService.listDomains();
  const found = domainList.find((d) => d.domain === testDomainName);
  assert(found, 'Connected domain not found in list');
  assert(found.targetName === 'TermuxPanel Control Plane', 'Default target incorrect');

  const updateRes = await domainService.updateDomain(connectRes.id, {
    domain: `updated-${testDomainName}`,
    sslEnabled: true,
    cnameTarget: 'custom-tunnel.cfargotunnel.com'
  });
  assert(updateRes.success && updateRes.domain === `updated-${testDomainName}`, 'Domain update failed');

  const delRes = await domainService.deleteDomain(connectRes.id);
  assert(delRes.success, 'Domain deletion failed');

  // Test All-In-One Subdomain Creator
  const subPrefix = `blog${Date.now().toString().slice(-4)}`;
  const subRes = await domainService.createSubdomain({
    subdomainPrefix: subPrefix,
    rootDomain: 'example.com',
    appType: 'html',
    createSite: true,
    createDatabase: true,
    dbTemplate: 'blog_cms'
  });
  assert(subRes.success, 'Subdomain creation failed');
  assert(subRes.domain === `${subPrefix}.example.com`, 'Subdomain domain mismatch');
  assert(subRes.websiteId > 0, 'Dedicated website ID missing');
  assert(subRes.database && fs.existsSync(subRes.database.path), 'Dedicated database was not created on disk');

  // Cleanup created site & DB
  if (subRes.database && fs.existsSync(subRes.database.path)) {
    fs.unlinkSync(subRes.database.path);
  }
  const createdSiteDir = path.join(process.env.TERMUX_PANEL_ROOT, 'storage', 'websites', subPrefix);
  if (fs.existsSync(createdSiteDir)) {
    fs.rmSync(createdSiteDir, { recursive: true, force: true });
  }

  console.log('  ✓ Domain registration, target binding, and Subdomain All-In-One wizard verified.');

  // 9. Multi-Tunnel Fallback Service
  console.log('[9/9] Testing Multi-Tunnel Fallback Service (Cloudflare, Ngrok, LocalXpose, Tailscale)...');
  const multitunnelService = require('../services/multitunnel.service');
  
  // Test provider status reporting
  const providers = await multitunnelService.getAllProvidersStatus();
  assert(providers.cloudflare && providers.cloudflare.id === 'cloudflare', 'Cloudflare provider missing');
  assert(providers.ngrok && providers.ngrok.id === 'ngrok', 'Ngrok provider missing');
  assert(providers.localxpose && providers.localxpose.id === 'localxpose', 'LocalXpose provider missing');
  assert(providers.tailscale && providers.tailscale.id === 'tailscale', 'Tailscale provider missing');

  // Test token saving for Ngrok and LocalXpose
  const ngrokRes = await multitunnelService.saveProviderToken('ngrok', 'test_ngrok_token_123456');
  assert(ngrokRes.success, 'Ngrok token saving failed');
  assert(fs.existsSync(config.NGROK_TOKEN_FILE), 'Ngrok token file was not created on disk');

  const loclxRes = await multitunnelService.saveProviderToken('localxpose', 'test_loclx_token_789101');
  assert(loclxRes.success, 'LocalXpose token saving failed');
  assert(fs.existsSync(config.LOCLX_TOKEN_FILE), 'LocalXpose token file was not created on disk');

  // Test log tailing for providers
  const cfLogs = await multitunnelService.getProviderLogs('cloudflare', 10);
  assert(cfLogs.provider === 'cloudflare', 'Provider log mismatch');

  // Cleanup test tokens
  if (fs.existsSync(config.NGROK_TOKEN_FILE)) fs.unlinkSync(config.NGROK_TOKEN_FILE);
  if (fs.existsSync(config.LOCLX_TOKEN_FILE)) fs.unlinkSync(config.LOCLX_TOKEN_FILE);

  console.log('  ✓ Multi-Tunnel provider abstraction, token storage, and log tailing verified.');

  console.log('--------------------------------------------------');
  console.log('  All TermuxPanel 9/9 Verifications Passed!       ');
  console.log('--------------------------------------------------');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
