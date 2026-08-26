const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Set test environment root
process.env.TERMUX_PANEL_ROOT = path.resolve(__dirname, '../../');

const db = require('../database/db');
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
  console.log('[5/5] Testing Dynamic Port Allocation...');
  const port1 = await findAvailablePort([]);
  assert(port1 >= 8100 && port1 <= 8999, 'Allocated port out of range');

  const port2 = await findAvailablePort([port1]);
  assert(port2 !== port1, 'Port collision detected');
  console.log(`  ✓ Port allocator allocated safe ports: :${port1}, :${port2}`);

  console.log('--------------------------------------------------');
  console.log('  All TermuxPanel Core Tests Passed Successfully! ');
  console.log('--------------------------------------------------');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
