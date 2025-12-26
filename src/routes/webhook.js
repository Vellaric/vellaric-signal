const express = require('express');
const crypto = require('crypto');
const { verifyWebhookSignature } = require('../utils/security');
const { queueDeployment } = require('../services/deploymentQueue');
const { logDeployment } = require('../services/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GitLab Webhook Handler
 * POST /webhook/gitlab
 */
router.post('/gitlab', async (req, res) => {
  try {
    const signature = req.headers['x-gitlab-token'];
    const event = req.headers['x-gitlab-event'];
    const payload = req.body;

    // Verify webhook signature
    if (!verifyWebhookSignature(signature)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Only handle push events
    if (event !== 'Push Hook') {
      logger.info(`Ignoring event: ${event}`);
      return res.status(200).json({ message: 'Event ignored' });
    }

    // Extract repository info
    const { project, repository, ref, commits, user_name } = payload;
    const branch = ref ? ref.replace('refs/heads/', '') : null;

    // Only deploy from main/master/dev branches
    if (branch !== 'production' && branch !== 'master' && branch !== 'dev') {
      logger.info(`Ignoring push to branch: ${branch}`);
      return res.status(200).json({ message: 'Branch ignored' });
    }

    const deploymentData = {
      projectName: project?.name || repository?.name,
      projectPath: project?.path_with_namespace || repository?.homepage,
      repoUrl: repository?.git_http_url || repository?.url,
      branch,
      commit: commits?.[0]?.id || 'unknown',
      commitMessage: commits?.[0]?.message || '',
      author: user_name || commits?.[0]?.author?.name,
      timestamp: new Date().toISOString(),
    };

    logger.info(`Received push event for ${deploymentData.projectName} on ${branch}`);

    // Log deployment request
    await logDeployment(deploymentData);

    // Queue deployment
    const deploymentId = await queueDeployment(deploymentData);

    res.status(200).json({
      message: 'Deployment queued',
      deploymentId,
      project: deploymentData.projectName,
      branch,
      commit: deploymentData.commit.substring(0, 8),
    });

  } catch (error) {
    logger.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Health Check Endpoint
 * GET /webhook/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
