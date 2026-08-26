const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const db = require('../database/db');

/**
 * List all cron jobs
 */
async function listCronJobs() {
  return db.all('SELECT * FROM cron_jobs ORDER BY created_at DESC');
}

/**
 * Add a new cron job
 */
async function createCronJob(name, expression, command) {
  const result = await db.run(
    'INSERT INTO cron_jobs (name, expression, command, enabled) VALUES (?, ?, ?, 1)',
    [name.trim(), expression.trim(), command.trim()]
  );
  await syncSystemCrontab();
  return { id: result.lastID, name, expression, command, enabled: 1 };
}

/**
 * Toggle enable/disable or delete cron job
 */
async function toggleCronJob(id, enabled) {
  await db.run('UPDATE cron_jobs SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  await syncSystemCrontab();
}

async function deleteCronJob(id) {
  await db.run('DELETE FROM cron_jobs WHERE id = ?', [id]);
  await syncSystemCrontab();
}

/**
 * Manually trigger execution of a cron job
 */
async function runCronJobNow(id) {
  const job = await db.get('SELECT * FROM cron_jobs WHERE id = ?', [id]);
  if (!job) {
    throw new Error('Cron job not found');
  }

  const startTime = new Date().toISOString();
  try {
    const { stdout, stderr } = await execPromise(job.command);
    await db.run(
      'UPDATE cron_jobs SET last_run = ?, last_status = "success" WHERE id = ?',
      [startTime, id]
    );
    return { success: true, output: stdout || stderr || 'Executed with code 0' };
  } catch (err) {
    await db.run(
      'UPDATE cron_jobs SET last_run = ?, last_status = "error" WHERE id = ?',
      [startTime, id]
    );
    return { success: false, error: err.message };
  }
}

/**
 * Sync active enabled cron jobs to system crontab (crond/cronie)
 */
async function syncSystemCrontab() {
  try {
    const enabledJobs = await db.all('SELECT * FROM cron_jobs WHERE enabled = 1');
    const header = '# TermuxPanel Managed Cron Jobs - Do not edit manually\n';
    const lines = enabledJobs.map(
      (job) => `${job.expression} ${job.command} # tp_job_${job.id}`
    );
    const crontabContent = header + lines.join('\n') + '\n';

    if (process.platform !== 'win32') {
      // Apply crontab via stdin
      const child = exec('crontab -', (err) => {
        if (err) {
          console.warn('[Cron] Crontab sync warning (crond might not be running):', err.message);
        }
      });
      child.stdin.write(crontabContent);
      child.stdin.end();
    }
  } catch (err) {
    console.warn('[Cron] Sync exception:', err.message);
  }
}

module.exports = {
  listCronJobs,
  createCronJob,
  toggleCronJob,
  deleteCronJob,
  runCronJobNow,
  syncSystemCrontab
};
