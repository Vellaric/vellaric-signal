const express = require('express');
const {
  saveEnvironmentVariable,
  getEnvironmentVariables,
  getAllEnvironmentVariables,
  deleteEnvironmentVariable,
  getProjectById,
  getProjectByName,
} = require('../services/database');
const { queueDeployment } = require('../services/deploymentQueue');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Get environment variables for a specific project and branch
 * GET /api/env/:projectName/:branch
 */
router.get('/:projectName/:branch', requireAuth, async (req, res) => {
  try {
    const { projectName, branch } = req.params;
    const envVars = await getEnvironmentVariables(projectName, branch);
    
    // Mask secret values in the response
    const maskedVars = envVars.map(v => ({
      ...v,
      value: v.is_secret ? '••••••••' : v.value,
    }));
    
    res.json({ success: true, data: maskedVars });
  } catch (error) {
    logger.error('Error fetching environment variables:', error);
    res.status(500).json({ error: 'Failed to fetch environment variables' });
  }
});

/**
 * Get all environment variables for a project (all branches)
 * GET /api/env/:projectName
 */
router.get('/:projectName', requireAuth, async (req, res) => {
  try {
    const { projectName } = req.params;
    const envVars = await getAllEnvironmentVariables(projectName);
    
    // Mask secret values in the response
    const maskedVars = envVars.map(v => ({
      ...v,
      value: v.is_secret ? '••••••••' : v.value,
    }));
    
    res.json({ success: true, data: maskedVars });
  } catch (error) {
    logger.error('Error fetching environment variables:', error);
    res.status(500).json({ error: 'Failed to fetch environment variables' });
  }
});

/**
 * Save or update environment variable
 * POST /api/env
 * Body: { projectName, projectId, branch, key, value, isSecret, description, triggerRedeploy }
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { projectName, projectId, branch, key, value, isSecret, description, triggerRedeploy } = req.body;
    
    // Get project (support both projectId and projectName for backward compatibility)
    let project = null;
    if (projectId) {
      project = await getProjectById(projectId);
    } else if (projectName) {
      project = await getProjectByName(projectName);
    }
    
    if (!project) {
      return res.status(404).json({ 
        error: 'Project not found. Please add the project first.' 
      });
    }
    
    // Validate required fields
    if (!branch || !key || value === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: branch, key, value' 
      });
    }
    
    // Validate key format (alphanumeric, underscores only)
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      return res.status(400).json({ 
        error: 'Invalid key format. Use alphanumeric characters and underscores only (e.g., NODE_ENV, API_KEY)' 
      });
    }
    
    const result = await saveEnvironmentVariable(
      project.id,
      branch,
      key,
      value,
      isSecret || false,
      description || ''
    );
    
    logger.info(`Environment variable saved: ${project.name}/${branch}/${key}`);
    
    // Trigger redeployment if requested
    if (triggerRedeploy) {
      try {
        const deploymentData = {
          projectName: project.name,
          projectPath: project.name,
          repoUrl: project.repo_url,
          branch,
          commit: 'env-update',
          commitMessage: `Environment variable updated: ${key}`,
          author: req.session?.username || 'dashboard-user',
          timestamp: new Date().toISOString(),
        };
        
        const deploymentId = await queueDeployment(deploymentData);
        logger.info(`Redeployment queued: ${deploymentId} (env var updated)`);
        
        return res.json({ 
          success: true, 
          data: result,
          redeployed: true,
          deploymentId 
        });
      } catch (deployError) {
        logger.error('Error triggering redeployment:', deployError);
        return res.json({ 
          success: true, 
          data: result,
          redeployed: false,
          redeployError: deployError.message
        });
      }
    }
    
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error saving environment variable:', error);
    res.status(500).json({ error: 'Failed to save environment variable' });
  }
});

/**
 * Delete environment variable
 * DELETE /api/env/:id
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    await deleteEnvironmentVariable(id);
    
    logger.info(`Environment variable deleted: ${id}`);
    res.json({ success: true, message: 'Environment variable deleted' });
  } catch (error) {
    logger.error('Error deleting environment variable:', error);
    res.status(500).json({ error: 'Failed to delete environment variable' });
  }
});

/**
 * Bulk save environment variables
 * POST /api/env/bulk
 * Body: { projectName, branch, variables: [{ key, value, isSecret, description }] }
 */
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const { projectName, branch, variables } = req.body;
    
    if (!projectName || !branch || !Array.isArray(variables)) {
      return res.status(400).json({ 
        error: 'Missing required fields: projectName, branch, variables (array)' 
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const variable of variables) {
      try {
        const { key, value, isSecret, description } = variable;
        
        if (!key || value === undefined) {
          errors.push({ key, error: 'Missing key or value' });
          continue;
        }
        
        const result = await saveEnvironmentVariable(
          projectName,
          branch,
          key,
          value,
          isSecret || false,
          description || ''
        );
        
        results.push(result);
      } catch (error) {
        errors.push({ key: variable.key, error: error.message });
      }
    }
    
    logger.info(`Bulk environment variables saved: ${projectName}/${branch} (${results.length} succeeded, ${errors.length} failed)`);
    
    res.json({ 
      success: true, 
      saved: results.length,
      failed: errors.length,
      results,
      errors 
    });
  } catch (error) {
    logger.error('Error bulk saving environment variables:', error);
    res.status(500).json({ error: 'Failed to bulk save environment variables' });
  }
});

module.exports = router;
