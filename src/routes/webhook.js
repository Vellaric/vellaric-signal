const express = require('express');
const crypto = require('crypto');
const { verifyWebhookSignature } = require('../utils/security');
const { queueDeployment } = require('../services/deploymentQueue');
const { logDeployment, getProjectByName } = require('../services/database');
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

    const projectName = project?.name || project?.path || repository?.name;
    const repoUrl = repository?.git_http_url || repository?.url || project?.http_url_to_repo;
    
    // Check if project exists in database (try by name first, then by repo URL)
    let dbProject = await getProjectByName(projectName);
    
    // If not found by name, try to find by repository URL
    if (!dbProject && repoUrl) {
      const { getAllProjects } = require('../services/database');
      const allProjects = await getAllProjects();
      dbProject = allProjects.find(p => {
        // Normalize URLs for comparison (remove .git, trailing slashes, etc)
        const normalizeUrl = (url) => url?.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
        return normalizeUrl(p.repo_url) === normalizeUrl(repoUrl);
      });
      
      if (dbProject) {
        logger.info(`Project matched by repository URL: ${dbProject.name} (webhook name: ${projectName})`);
      }
    }
    
    if (!dbProject) {
      logger.warn(`Webhook received for unknown project: "${projectName}" (repo: ${repoUrl}). Please add this project in the dashboard first.`);
      return res.status(404).json({ 
        error: 'Project not found',
        message: 'Please add this project in the Vellaric-Signal dashboard before deploying. Make sure the repository URL matches.',
        receivedProjectName: projectName,
        receivedRepoUrl: repoUrl,
        hint: 'Check that the repository URL in your dashboard matches the one from GitLab'
      });
    }
    
    // Check if project has auto-deploy enabled
    if (!dbProject.auto_deploy) {
      logger.info(`Auto-deploy disabled for project: ${projectName}`);
      return res.status(200).json({ 
        message: 'Auto-deploy is disabled for this project. Use manual deployment from dashboard.' 
      });
    }
    
    // Check if branch is enabled for this project
    const enabledBranches = dbProject.enabled_branches.split(',');
    if (!enabledBranches.includes(branch)) {
      logger.info(`Branch ${branch} not enabled for project ${projectName}. Enabled: ${dbProject.enabled_branches}`);
      return res.status(200).json({ 
        message: 'Branch not enabled for deployment',
        branch,
        enabledBranches: dbProject.enabled_branches
      });
    }

    const deploymentData = {
      projectName: dbProject.name,
      projectPath: project?.path_with_namespace || repository?.homepage,
      repoUrl: dbProject.repo_url,
      branch,
      commit: commits?.[0]?.id || 'unknown',
      commitMessage: commits?.[0]?.message || '',
      author: user_name || commits?.[0]?.author?.name,
      timestamp: new Date().toISOString(),
    };

    logger.info(`Received push event for ${dbProject.name} on ${branch}`);

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
