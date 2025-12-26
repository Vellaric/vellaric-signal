const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../utils/logger');
const { removeNginxConfig } = require('../utils/nginx');
const { deleteCertificate } = require('../utils/ssl');
const { deleteDnsRecord } = require('../utils/cloudflare');

const execAsync = promisify(exec);

/**
 * Remove a deployed application
 */
async function removeDeployment(projectName, branch = 'main') {
  const containerName = `${projectName.replace(/\s+/g, '-').toLowerCase()}-${branch}`;
  
  // Generate subdomain based on branch
  const baseProjectName = projectName.replace(/\s+/g, '-').toLowerCase();
  let subdomain = baseProjectName;
  if (branch === 'dev') {
    subdomain = `${baseProjectName}-dev`;
  } else if (branch === 'production') {
    subdomain = `${baseProjectName}-production`;
  }
  
  const domain = `${subdomain}.${process.env.BASE_DOMAIN || 'example.com'}`;

  try {
    logger.info(`Removing deployment: ${containerName}`);

    // Stop and remove container
    await execAsync(`docker stop ${containerName} 2>/dev/null || true`);
    await execAsync(`docker rm ${containerName} 2>/dev/null || true`);
    logger.info(`Container removed: ${containerName}`);

    // Remove Docker image
    const imageName = `${projectName.replace(/\s+/g, '-').toLowerCase()}:${branch}`;
    await execAsync(`docker rmi ${imageName} 2>/dev/null || true`);
    logger.info(`Image removed: ${imageName}`);

    // Remove nginx config
    await removeNginxConfig(domain);
    logger.info(`Nginx config removed for: ${domain}`);

    // Remove DNS record (if Cloudflare API configured)
    await deleteDnsRecord(domain);
    logger.info(`DNS record removed for: ${domain}`);

    // Remove SSL certificate (optional - may want to keep for future use)
    // await deleteCertificate(domain);
    // logger.info(`SSL certificate removed for: ${domain}`);

    logger.info(`Deployment removed successfully: ${projectName}`);
    return { success: true, message: 'Deployment removed' };

  } catch (error) {
    logger.error(`Error removing deployment ${projectName}:`, error);
    throw error;
  }
}

/**
 * List all deployed applications
 */
async function listDeployments() {
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    const containers = stdout.trim().split('\n').filter(Boolean);
    
    const deployments = [];
    for (const container of containers) {
      // Skip database containers (ending with -postgres)
      if (container.endsWith('-postgres')) {
        continue;
      }
      
      try {
        const { stdout: portOutput } = await execAsync(`docker inspect ${container} --format='{{range .NetworkSettings.Ports}}{{range .}}{{.HostPort}}{{end}}{{end}}'`);
        const { stdout: idOutput } = await execAsync(`docker inspect ${container} --format='{{.Id}}'`);
        const port = portOutput.trim();
        const containerId = idOutput.trim();
        
        // Parse container name to extract project and branch
        // Format: projectname-branch
        const parts = container.split('-');
        const branch = parts[parts.length - 1];
        const projectName = parts.slice(0, -1).join('-');
        const domain = `${container}.${process.env.BASE_DOMAIN || 'example.com'}`;
        
        deployments.push({
          project_name: projectName,
          branch: branch,
          container_id: containerId,
          domain: domain,
          port: parseInt(port) || 0,
        });
      } catch (err) {
        // Skip containers that can't be inspected
      }
    }

    return deployments;
  } catch (error) {
    logger.error('Error listing deployments:', error);
    return [];
  }
}

/**
 * Clean up old unused Docker images
 */
async function cleanupDockerImages() {
  try {
    logger.info('Cleaning up unused Docker images...');
    await execAsync('docker image prune -a -f');
    logger.info('Docker cleanup complete');
    return { success: true };
  } catch (error) {
    logger.error('Error cleaning up Docker images:', error);
    throw error;
  }
}

module.exports = {
  removeDeployment,
  listDeployments,
  cleanupDockerImages,
};
