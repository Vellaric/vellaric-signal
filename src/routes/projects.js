const express = require('express');
const {
  createProject,
  getAllProjects,
  getProjectById,
  getProjectByName,
  updateProject,
  deleteProject,
} = require('../services/database');
const { queueDeployment } = require('../services/deploymentQueue');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Get all projects
 * GET /api/projects
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const projects = await getAllProjects();
    res.json({ success: true, data: projects });
  } catch (error) {
    logger.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * Get project by ID
 * GET /api/projects/:id
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const project = await getProjectById(id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ success: true, data: project });
  } catch (error) {
    logger.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

/**
 * Create a new project
 * POST /api/projects
 * Body: { name, repoUrl, defaultBranch, enabledBranches, autoDeploy, description, gitlabProjectId }
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, repoUrl, defaultBranch, enabledBranches, autoDeploy, description, gitlabProjectId } = req.body;
    
    // Validate required fields
    if (!name || !repoUrl) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, repoUrl' 
      });
    }
    
    // Validate name format (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      return res.status(400).json({ 
        error: 'Invalid project name. Use alphanumeric characters, hyphens, and underscores only.' 
      });
    }
    
    // Check if project with same name already exists
    const existing = await getProjectByName(name);
    if (existing) {
      return res.status(409).json({ 
        error: 'Project with this name already exists' 
      });
    }
    
    const project = await createProject({
      name,
      repoUrl,
      defaultBranch: defaultBranch || 'production',
      enabledBranches: enabledBranches || 'production,master,dev',
      autoDeploy: autoDeploy !== false, // default true
      description: description || '',
      gitlabProjectId: gitlabProjectId || null,
    });
    
    logger.info(`Project created: ${name}`);
    res.json({ success: true, data: project });
  } catch (error) {
    logger.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * Update project
 * PUT /api/projects/:id
 * Body: { name, repoUrl, defaultBranch, enabledBranches, autoDeploy, description }
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check if project exists
    const project = await getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // If updating name, check for conflicts
    if (updates.name && updates.name !== project.name) {
      const existing = await getProjectByName(updates.name);
      if (existing) {
        return res.status(409).json({ 
          error: 'Project with this name already exists' 
        });
      }
    }
    
    // Convert autoDeploy to integer if provided
    if ('autoDeploy' in updates) {
      updates.auto_deploy = updates.autoDeploy ? 1 : 0;
      delete updates.autoDeploy;
    }
    
    // Convert camelCase to snake_case for database
    if (updates.defaultBranch) {
      updates.default_branch = updates.defaultBranch;
      delete updates.defaultBranch;
    }
    if (updates.enabledBranches) {
      updates.enabled_branches = updates.enabledBranches;
      delete updates.enabledBranches;
    }
    if (updates.repoUrl) {
      updates.repo_url = updates.repoUrl;
      delete updates.repoUrl;
    }
    if (updates.gitlabProjectId) {
      updates.gitlab_project_id = updates.gitlabProjectId;
      delete updates.gitlabProjectId;
    }
    
    await updateProject(id, updates);
    
    logger.info(`Project updated: ${id}`);
    res.json({ success: true, message: 'Project updated successfully' });
  } catch (error) {
    logger.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * Delete project (soft delete)
 * DELETE /api/projects/:id
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if project exists
    const project = await getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    await deleteProject(id);
    
    logger.info(`Project deleted: ${id}`);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    logger.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/**
 * Trigger manual deployment
 * POST /api/projects/:id/deploy
 * Body: { branch, commit }
 */
router.post('/:id/deploy', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { branch, commit } = req.body;
    
    // Get project
    const project = await getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Validate branch
    const enabledBranches = project.enabled_branches.split(',');
    if (!enabledBranches.includes(branch)) {
      return res.status(400).json({ 
        error: `Branch '${branch}' is not enabled for this project. Enabled branches: ${project.enabled_branches}` 
      });
    }
    
    // Queue deployment
    const deploymentData = {
      projectName: project.name,
      projectPath: project.name,
      repoUrl: project.repo_url,
      branch: branch || project.default_branch,
      commit: commit || 'manual',
      commitMessage: 'Manual deployment from dashboard',
      author: req.session?.username || 'dashboard-user',
      timestamp: new Date().toISOString(),
    };
    
    const deploymentId = await queueDeployment(deploymentData);
    
    logger.info(`Manual deployment queued: ${deploymentId} for ${project.name}/${branch}`);
    res.json({ 
      success: true, 
      message: 'Deployment queued successfully',
      deploymentId,
      project: project.name,
      branch 
    });
  } catch (error) {
    logger.error('Error triggering deployment:', error);
    res.status(500).json({ error: 'Failed to trigger deployment' });
  }
});

/**
 * Get GitLab projects (if GitLab token is configured)
 * GET /api/projects/gitlab/list
 */
router.get('/gitlab/list', requireAuth, async (req, res) => {
  try {
    const gitlabToken = process.env.GITLAB_ACCESS_TOKEN;
    
    if (!gitlabToken) {
      return res.status(400).json({ 
        error: 'GitLab access token not configured. Please set GITLAB_ACCESS_TOKEN in .env' 
      });
    }
    
    // Fetch projects from GitLab API
    const fetch = require('node-fetch');
    const response = await fetch('https://gitlab.com/api/v4/projects?membership=true&per_page=100', {
      headers: {
        'Authorization': `Bearer ${gitlabToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`GitLab API error: ${response.status}`);
    }
    
    const projects = await response.json();
    
    // Format response
    const formattedProjects = projects.map(p => ({
      id: p.id,
      name: p.path,
      fullName: p.path_with_namespace,
      description: p.description,
      httpUrl: p.http_url_to_repo,
      sshUrl: p.ssh_url_to_repo,
      defaultBranch: p.default_branch,
      visibility: p.visibility,
    }));
    
    res.json({ success: true, data: formattedProjects });
  } catch (error) {
    logger.error('Error fetching GitLab projects:', error);
    res.status(500).json({ error: 'Failed to fetch GitLab projects: ' + error.message });
  }
});

module.exports = router;
