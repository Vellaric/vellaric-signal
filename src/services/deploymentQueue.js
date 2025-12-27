const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const logger = require('../utils/logger');
const { updateDeploymentStatus, getEnvironmentVariablesAsObject } = require('./database');
const { generateNginxConfig, reloadNginx } = require('../utils/nginx');
const { ensureSSLCertificate } = require('../utils/ssl');
const { setupDeploymentDns } = require('../utils/cloudflare');
const { addDeploymentLog } = require('./deploymentLogs');

/**
 * Inject GitLab credentials into repository URL
 * Supports both HTTPS with token and SSH
 */
function getAuthenticatedRepoUrl(repoUrl) {
  const gitlabToken = process.env.GITLAB_ACCESS_TOKEN;
  
  // If SSH URL, return as-is (assuming SSH keys are configured)
  if (repoUrl.startsWith('git@') || repoUrl.startsWith('ssh://')) {
    return repoUrl;
  }
  
  // If HTTPS and token is available, inject token
  if (gitlabToken && repoUrl.startsWith('http')) {
    const url = new URL(repoUrl);
    // GitLab format: https://oauth2:TOKEN@gitlab.com/user/repo.git
    url.username = 'oauth2';
    url.password = gitlabToken;
    return url.toString();
  }
  
  // Return original URL (for public repos)
  return repoUrl;
}

const execAsync = promisify(exec);

class DeploymentQueue {
  constructor() {
    this.queue = [];
    this.buildingDeployments = new Map(); // Track deployments currently building
    this.processing = false;
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_DEPLOYS) || 3;
    this.activeDeployments = 0;
  }

  async queueDeployment(deploymentData) {
    const deploymentId = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const deployment = {
      id: deploymentId,
      ...deploymentData,
      status: 'queued',
      queuedAt: new Date().toISOString(),
    };

    this.queue.push(deployment);
    logger.info(`Deployment queued: ${deploymentId} for ${deploymentData.projectName}`);

    // Start processing if not already running
    this.processQueue();

    return deploymentId;
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    if (this.activeDeployments >= this.maxConcurrent) {
      logger.info(`Max concurrent deployments reached (${this.maxConcurrent})`);
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.activeDeployments < this.maxConcurrent) {
      const deployment = this.queue.shift();
      this.activeDeployments++;
      
      // Mark as building and track it
      deployment.status = 'building';
      this.buildingDeployments.set(deployment.id, deployment);
      
      // Deploy asynchronously
      this.deploy(deployment)
        .then(() => {
          this.buildingDeployments.delete(deployment.id);
          this.activeDeployments--;
          this.processQueue(); // Process next in queue
        })
        .catch((error) => {
          logger.error(`Deployment ${deployment.id} failed:`, error);
          this.buildingDeployments.delete(deployment.id);
          this.activeDeployments--;
          this.processQueue();
        });
    }

    this.processing = false;
  }

  async deploy(deployment) {
    const { id, projectName, repoUrl, branch, commit } = deployment;
    
    const logStep = (message) => {
      logger.info(message);
      addDeploymentLog(id, 'info', message);
    };
    
    // Update status in tracked deployment
    deployment.status = 'building';
    if (this.buildingDeployments.has(id)) {
      this.buildingDeployments.get(id).status = 'building';
    }
    
    logStep(`Starting deployment: ${id}`);
    await updateDeploymentStatus(id, 'building');
    
    // Emit real-time update
    if (global.io) {
      global.io.emit('deployment:status', {
        id,
        projectName,
        branch,
        status: 'building'
      });
    }

    const deployPath = path.join(
      process.env.DEPLOY_BASE_PATH || '/var/www/apps',
      projectName
    );

    const dockerImageName = projectName.replace(/\s+/g, '-').toLowerCase();
    const containerName = `${dockerImageName}-${branch}`;
    
    // Generate subdomain based on branch
    let subdomain = dockerImageName;
    if (branch === 'dev') {
      subdomain = `${dockerImageName}-dev`;
    } else if (branch === 'production') {
      subdomain = `${dockerImageName}-production`;
    }
    // For main/master branches, use base domain without suffix
    
    const domain = `${subdomain}.${process.env.BASE_DOMAIN || 'example.com'}`;

    try {
      // Check if project directory exists
      const projectExists = await fs.access(deployPath).then(() => true).catch(() => false);

      if (!projectExists) {
        // Clone repository
        logStep(`📥 Cloning repository to ${deployPath}`);
        const authRepoUrl = getAuthenticatedRepoUrl(repoUrl);
        await execAsync(`git clone ${authRepoUrl} "${deployPath}"`);
      } else {
        // Pull latest changes
        logStep(`🔄 Pulling latest changes in ${deployPath}`);
        const gitlabToken = process.env.GITLAB_ACCESS_TOKEN;
        
        // Configure git credentials if token is available
        const gitCredentials = gitlabToken 
          ? `cd "${deployPath}" && git config credential.helper store && echo "https://oauth2:${gitlabToken}@gitlab.com" > ~/.git-credentials && `
          : `cd "${deployPath}" && `;
        
        await execAsync(`${gitCredentials}git fetch origin && git checkout ${branch} && git reset --hard origin/${branch}`);
      }

      // Check if Dockerfile exists
      const dockerfilePath = path.join(deployPath, 'Dockerfile');
      const hasDockerfile = await fs.access(dockerfilePath).then(() => true).catch(() => false);
      
      if (!hasDockerfile) {
        throw new Error('No Dockerfile found in repository');
      }

      // Detect exposed port from Dockerfile
      let appPort = process.env.APP_PORT || 3000;
      try {
        const dockerfileContent = await fs.readFile(dockerfilePath, 'utf-8');
        const exposeMatch = dockerfileContent.match(/EXPOSE\s+(\d+)/i);
        if (exposeMatch) {
          appPort = parseInt(exposeMatch[1]);
          logger.info(`Detected EXPOSE port from Dockerfile: ${appPort}`);
        } else {
          logger.warn(`No EXPOSE directive found in Dockerfile, using default: ${appPort}`);
        }
      } catch (err) {
        logger.warn(`Could not read Dockerfile to detect port, using default: ${appPort}`);
      }

      // Stop and remove old container before building
      logStep(`🧹 Cleaning up old resources for: ${containerName}`);
      await execAsync(`docker stop ${containerName} 2>/dev/null || true`);
      await execAsync(`docker rm ${containerName} 2>/dev/null || true`);
      
      // Remove old image to force fresh build
      logStep(`🗑️  Removing old image: ${dockerImageName}:${branch}`);
      await execAsync(`docker rmi ${dockerImageName}:${branch} 2>/dev/null || true`);

      // Build Docker image with no cache
      logStep(`🐳 Building Docker image: ${dockerImageName}:${branch}`);
      await execAsync(`cd "${deployPath}" && docker build --no-cache -t ${dockerImageName}:${branch} .`);

      // Find available port (starting from 3000)
      const port = await this.findAvailablePort(3000 + Math.floor(Math.random() * 1000));
      
      // Get environment variables from database
      logger.info(`Fetching environment variables for project: "${projectName}", branch: "${branch}"`);
      const envVarsFromDb = await getEnvironmentVariablesAsObject(projectName, branch);
      logger.info(`Fetched ${Object.keys(envVarsFromDb).length} environment variables from database`);
      
      // Log the variables (masked for secrets)
      Object.keys(envVarsFromDb).forEach(key => {
        const value = key.toLowerCase().includes('secret') || key.toLowerCase().includes('password') || key.toLowerCase().includes('key') 
          ? '***MASKED***' 
          : envVarsFromDb[key];
        logger.info(`  - ${key} = ${value}`);
      });
      
      // Check if project has .env file
      const envFilePath = path.join(deployPath, '.env');
      const hasEnvFile = await fs.access(envFilePath).then(() => true).catch(() => false);
      
      // Merge env vars: DB variables take precedence over .env file
      // Also add deployment-specific env vars
      const containerEnvVars = {
        ...envVarsFromDb,
        DEPLOY_BRANCH: branch,
        DEPLOY_COMMIT: commit,
        DEPLOY_DOMAIN: domain,
      };
      
      // Create a temporary .env file with all environment variables
      const tempEnvPath = path.join(os.tmpdir(), `${containerName}.env`);
      const envFileContent = Object.entries(containerEnvVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      await fs.writeFile(tempEnvPath, envFileContent);
      logStep(`📝 Created environment file with ${Object.keys(containerEnvVars).length} variables`);
      logger.info(`📄 Environment file content preview:\n${envFileContent.split('\n').slice(0, 5).join('\n')}${envFileContent.split('\n').length > 5 ? '\n...' : ''}`);
      
      if (hasEnvFile) {
        logger.info(`Project has .env file, but using database environment variables (${Object.keys(envVarsFromDb).length} vars)`);
      }
      
      // Start new container with environment variables
      logStep(`🚀 Starting container: ${containerName} on port ${port}`);
      await execAsync(`docker run -d --name ${containerName} --restart unless-stopped -p ${port}:${appPort} --env-file "${tempEnvPath}" ${dockerImageName}:${branch}`);
      
      // Clean up temporary env file
      try {
        await fs.unlink(tempEnvPath);
      } catch (err) {
        logger.warn(`Could not delete temporary env file: ${tempEnvPath}`);
      }

      // Wait for container to be healthy
      await this.waitForContainer(containerName, id);

      // Setup DNS (Cloudflare API if configured, otherwise assumes wildcard)
      logStep(`🌐 Setting up DNS for ${domain}`);
      await setupDeploymentDns(domain);

      // Generate nginx configuration
      logStep(`⚙️  Configuring nginx for ${domain}`);
      await generateNginxConfig(domain, port, containerName);

      // Reload nginx to apply HTTP config
      await reloadNginx();

      // Try to set up SSL with DNS propagation check
      logStep(`🔒 Setting up SSL for ${domain}`);
      try {
        // Wait for DNS propagation (30 seconds)
        logStep(`⏳ Waiting for DNS propagation...`);
        await this.waitForDnsPropagation(domain, 30);
        
        // Obtain SSL certificate
        await ensureSSLCertificate(domain);
        await reloadNginx();
        logStep(`✅ SSL certificate obtained for ${domain}`);
      } catch (sslError) {
        logger.warn(`⚠️  SSL setup failed for ${domain}: ${sslError.message}`);
        logger.warn(`Deployment will continue with HTTP only. Configure DNS and run certbot manually for HTTPS.`);
        logger.warn(`To add SSL later: sudo certbot --nginx -d ${domain}`);
        addDeploymentLog(id, 'warn', `⚠️  SSL not configured - using HTTP only. Run: sudo certbot --nginx -d ${domain}`);
      }

      logStep(`✅ Deployment successful!`);
      await updateDeploymentStatus(id, 'success', {
        deployed_at: new Date().toISOString(),
        commit_hash: commit,
        domain,
        port,
        container_name: containerName,
      });

      // Emit real-time success update
      if (global.io) {
        global.io.emit('deployment:status', {
          id,
          projectName,
          branch,
          status: 'success',
          domain,
          port
        });
      }

      return { success: true, deploymentId: id, domain, port };

    } catch (error) {
      logger.error(`Deployment failed: ${id}`, error);
      addDeploymentLog(id, 'error', `❌ Deployment failed: ${error.message}`);
      await updateDeploymentStatus(id, 'failed', {
        error: error.message,
        failed_at: new Date().toISOString(),
      });

      // Emit real-time failure update
      if (global.io) {
        global.io.emit('deployment:status', {
          id,
          projectName,
          branch,
          status: 'failed',
          error: error.message
        });
      }

      throw error;
    }
  }

  async findAvailablePort(startPort) {
    for (let port = startPort; port < startPort + 100; port++) {
      try {
        const { stdout } = await execAsync(`lsof -i:${port} || echo "free"`);
        if (stdout.includes('free')) {
          return port;
        }
      } catch (error) {
        return port;
      }
    }
    throw new Error('No available ports found');
  }

  async waitForDnsPropagation(domain, maxWaitSeconds = 30) {
    logger.info(`Checking DNS propagation for ${domain}...`);
    
    for (let i = 0; i < maxWaitSeconds; i++) {
      try {
        const { stdout } = await execAsync(`dig +short ${domain} @8.8.8.8`);
        const ipAddress = stdout.trim();
        
        if (ipAddress) {
          logger.info(`✅ DNS resolved for ${domain}: ${ipAddress}`);
          return true;
        }
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    logger.warn(`⚠️  DNS not fully propagated for ${domain} after ${maxWaitSeconds}s`);
    return false;
  }

  async waitForContainer(containerName, deploymentId, maxAttempts = 60) {
    const logStep = (msg) => {
      logger.info(msg);
      if (deploymentId) addDeploymentLog(deploymentId, 'info', msg);
    };
    
    logStep(`⏳ Waiting for container ${containerName} to start (max ${maxAttempts}s)...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check if container has health check
        const { stdout: healthStatus } = await execAsync(`docker inspect --format='{{.State.Health.Status}}' ${containerName} 2>/dev/null || echo "none"`);
        
        if (healthStatus.trim() === 'healthy') {
          logger.info(`✅ Container ${containerName} is healthy`);
          return;
        }
        
        // Check if container is running
        const { stdout: isRunning } = await execAsync(`docker inspect --format='{{.State.Running}}' ${containerName}`);
        
        if (isRunning.trim() === 'true') {
          // Container is running
          if (i >= 30) {
            // Container has been running for 30+ seconds - consider it healthy
            logger.info(`✅ Container ${containerName} has been running for ${i} seconds - marking as healthy`);
            return;
          }
          
          // Check logs for "server running" message
          if (i >= 15 && i % 5 === 0) {
            try {
              const { stdout: logs } = await execAsync(`docker logs --tail 20 ${containerName} 2>&1`);
              if (logs.match(/server running|listening|started|ready/i)) {
                logger.info(`✅ Container ${containerName} logs show server started - marking as healthy`);
                return;
              }
            } catch (err) {
              // Ignore log read errors
            }
          }
        } else if (isRunning.trim() === 'false') {
          // Container stopped
          const { stdout: logs } = await execAsync(`docker logs --tail 50 ${containerName} 2>&1`);
          logger.error(`❌ Container ${containerName} stopped. Last logs:\n${logs}`);
          throw new Error('Container stopped unexpectedly');
        }
      } catch (error) {
        if (error.message === 'Container stopped unexpectedly') {
          throw error;
        }
        // Other errors - continue waiting
        logger.warn(`Error checking container status (attempt ${i + 1}/${maxAttempts}): ${error.message}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Container failed to start properly - timed out waiting for health check');
  }

  getQueueStatus() {
    // Combine queued and building deployments
    const allQueuedDeployments = [
      ...this.queue,
      ...Array.from(this.buildingDeployments.values())
    ];
    
    return {
      queue: allQueuedDeployments,
      queued: this.queue.length,
      building: this.buildingDeployments.size,
      active: this.activeDeployments,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Singleton instance
const deploymentQueue = new DeploymentQueue();

module.exports = {
  queueDeployment: (data) => deploymentQueue.queueDeployment(data),
  getQueueStatus: () => deploymentQueue.getQueueStatus(),
};
