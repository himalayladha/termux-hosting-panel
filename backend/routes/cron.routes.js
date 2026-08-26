const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth/auth.middleware');
const cronService = require('../services/cron.service');

/**
 * List all cron jobs
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const jobs = await cronService.listCronJobs();
    return res.json(jobs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new cron job
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, expression, command } = req.body;
    if (!name || !expression || !command) {
      return res.status(400).json({ error: 'Name, expression, and command are required' });
    }

    const job = await cronService.createCronJob(name, expression, command);
    return res.status(201).json(job);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Toggle enable/disable
 */
router.put('/:id/toggle', requireAuth, async (req, res) => {
  try {
    const { enabled } = req.body;
    await cronService.toggleCronJob(req.params.id, enabled);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Delete cron job
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await cronService.deleteCronJob(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Run cron job immediately
 */
router.post('/:id/run', requireAuth, async (req, res) => {
  try {
    const result = await cronService.runCronJobNow(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
