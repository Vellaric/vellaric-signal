require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const webhookRouter = require('./routes/webhook');
const envRouter = require('./routes/env');
const projectsRouter = require('./routes/projects');
const { getDeploymentHistory } = require('./services/database');
const { getQueueStatus } = require('./services/deploymentQueue');
const { listDeployments, removeDeployment, cleanupDockerImages } = require('./services/cleanup');
const { getDeploymentLogs } = require('./services/deploymentLogs');
const backupService = require('./services/backupService');
const databaseManager = require('./services/databaseManager');
const { sessionMiddleware, requireAuth, handleLogin, handleLogout, checkAuth, handleChangePassword } = require('./middleware/auth');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Store socket.io instance globally for access from other modules
global.io = io;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

// Public routes (no auth required)
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Serve old HTML dashboard (backward compatibility)
app.use('/dashboard-old.html', express.static(path.join(__dirname, '../public')));

// Auth endpoints
app.post('/api/login', handleLogin);
app.post('/api/logout', handleLogout);
app.get('/api/auth/check', checkAuth);
app.post('/api/auth/change-password', requireAuth, handleChangePassword);

// Webhook route (no auth for GitLab webhooks)
app.use('/webhook', webhookRouter);

// Protected routes - require authentication
app.use(requireAuth);

// Projects API (requires auth)
app.use('/api/projects', projectsRouter);

// Environment variables API (requires auth)
app.use('/api/env', envRouter);

// Serve static files after auth check
app.use(express.static(path.join(__dirname, '../public')));

// Root endpoint - serve dashboard directly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});

// Dashboard endpoint - get recent deployments
app.get('/api/deployments', async (req, res) => {
  try {
    const project = req.query.project || null;
    const limit = parseInt(req.query.limit) || 50;
    
    const deployments = await getDeploymentHistory(project, limit);
    res.json({ deployments });
  } catch (error) {
    logger.error('Error fetching deployments:', error);
    res.status(500).json({ error: 'Failed to fetch deployments' });
  }
});

// Queue status endpoint
app.get('/api/queue', (req, res) => {
  const status = getQueueStatus();
  res.json(status);
});

// Get deployment logs
app.get('/api/deployments/:id/logs', (req, res) => {
  try {
    const { id } = req.params;
    const logs = getDeploymentLogs(id);
    res.json({ logs });
  } catch (error) {
    logger.error('Error fetching deployment logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// List active deployments
app.get('/api/deployments/active', async (req, res) => {
  try {
    const deployments = await listDeployments();
    res.json({ deployments });
  } catch (error) {
    logger.error('Error fetching active deployments:', error);
    res.status(500).json({ error: 'Failed to fetch active deployments' });
  }
});

// Remove deployment
app.delete('/api/deployments/:projectName/:branch?', async (req, res) => {
  try {
    const { projectName, branch = 'main' } = req.params;
    const result = await removeDeployment(projectName, branch);
    res.json(result);
  } catch (error) {
    logger.error('Error removing deployment:', error);
    res.status(500).json({ error: 'Failed to remove deployment' });
  }
});

// Cleanup unused Docker images
app.post('/api/cleanup', async (req, res) => {
  try {
    const result = await cleanupDockerImages();
    res.json(result);
  } catch (error) {
    logger.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Cleanup failed' });
  }
});

// List all running containers (for debugging)
app.get('/api/containers', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync('docker ps --format "{{.Names}}\t{{.Status}}\t{{.ID}}"');
    const containers = stdout.trim().split('\n').map(line => {
      const [name, status, id] = line.split('\t');
      return { name, status, id };
    }).filter(c => c.name);
    
    res.json({ containers });
  } catch (error) {
    logger.error('Error listing containers:', error);
    res.status(500).json({ error: 'Failed to list containers', details: error.message });
  }
});

// Get Docker container stats (CPU, RAM, Disk)
app.get('/api/containers/:containerName/stats', async (req, res) => {
  try {
    const { containerName } = req.params;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Check if container exists
    try {
      await execAsync(`docker inspect ${containerName}`);
    } catch (err) {
      return res.status(404).json({ error: 'Container not found', containerName });
    }
    
    // Get container stats (CPU, RAM)
    const { stdout: statsOutput } = await execAsync(
      `docker stats ${containerName} --no-stream --format "{{json .}}"`
    );
    
    const stats = JSON.parse(statsOutput);
    
    // Get container size (disk usage)
    const { stdout: sizeOutput } = await execAsync(
      `docker ps -a --filter "name=^/${containerName}$" --format "{{.Size}}"`
    );
    
    res.json({
      name: stats.Name,
      cpu: stats.CPUPerc,
      memory: stats.MemUsage,
      memoryPercent: stats.MemPerc,
      diskSize: sizeOutput.trim() || 'N/A',
      netIO: stats.NetIO,
      blockIO: stats.BlockIO
    });
  } catch (error) {
    logger.error('Error fetching container stats:', error);
    res.status(500).json({ error: 'Failed to fetch container stats', details: error.message });
  }
});

// Get Docker container logs (streaming)
app.get('/api/containers/:containerName/logs', async (req, res) => {
  try {
    const { containerName } = req.params;
    const { tail = '100', follow = 'false' } = req.query;
    const { exec, spawn } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Check if container exists
    try {
      await execAsync(`docker inspect ${containerName}`);
    } catch (err) {
      return res.status(404).send(`Container '${containerName}' not found\n`);
    }
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // If not following, just get the logs once
    if (follow === 'false') {
      try {
        const { stdout, stderr } = await execAsync(`docker logs ${containerName} --tail ${tail} 2>&1`);
        res.write(stdout || stderr || 'No logs available\n');
        res.end();
      } catch (err) {
        res.write(`Error fetching logs: ${err.message}\n`);
        res.end();
      }
      return;
    }
    
    // Following logs (streaming)
    const args = ['logs', containerName, '--tail', tail, '-f'];
    const logsProcess = spawn('docker', args);
    
    let hasData = false;
    
    logsProcess.stdout.on('data', (data) => {
      hasData = true;
      res.write(data);
    });
    
    logsProcess.stderr.on('data', (data) => {
      hasData = true;
      res.write(data);
    });
    
    logsProcess.on('error', (error) => {
      logger.error('Logs process error:', error);
      res.write(`Error: ${error.message}\n`);
      res.end();
    });
    
    logsProcess.on('close', (code) => {
      if (!hasData) {
        res.write('No logs available or container stopped\n');
      }
      res.end();
    });
    
    // Clean up on client disconnect
    req.on('close', () => {
      logsProcess.kill();
    });
    
    // Timeout after 5 seconds if no data
    const timeout = setTimeout(() => {
      if (!hasData) {
        logsProcess.kill();
        res.write('Timeout: No logs received\n');
        res.end();
      }
    }, 5000);
    
    logsProcess.once('data', () => {
      clearTimeout(timeout);
    });
    
  } catch (error) {
    logger.error('Error streaming container logs:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream logs', details: error.message });
    }
  }
});

// Stop Docker container
app.post('/api/containers/:containerName/stop', async (req, res) => {
  try {
    const { containerName } = req.params;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync(`docker stop ${containerName}`);
    logger.info(`Container stopped: ${containerName}`);
    
    res.json({ success: true, message: `Container ${containerName} stopped successfully` });
  } catch (error) {
    logger.error('Error stopping container:', error);
    res.status(500).json({ error: 'Failed to stop container' });
  }
});

// Start Docker container
app.post('/api/containers/:containerName/start', async (req, res) => {
  try {
    const { containerName } = req.params;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync(`docker start ${containerName}`);
    logger.info(`Container started: ${containerName}`);
    
    res.json({ success: true, message: `Container ${containerName} started successfully` });
  } catch (error) {
    logger.error('Error starting container:', error);
    res.status(500).json({ error: 'Failed to start container' });
  }
});

// Restart Docker container
app.post('/api/containers/:containerName/restart', async (req, res) => {
  try {
    const { containerName } = req.params;
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync(`docker restart ${containerName}`);
    logger.info(`Container restarted: ${containerName}`);
    
    res.json({ success: true, message: `Container ${containerName} restarted successfully` });
  } catch (error) {
    logger.error('Error restarting container:', error);
    res.status(500).json({ error: 'Failed to restart container' });
  }
});

// Backup endpoints
// List all database containers
app.get('/api/backups/databases', async (req, res) => {
  try {
    const databases = await backupService.getDatabaseContainers();
    res.json({ databases });
  } catch (error) {
    logger.error('Error listing databases:', error);
    res.status(500).json({ error: 'Failed to list databases' });
  }
});

// Create a backup
app.post('/api/backups/create', async (req, res) => {
  try {
    const { containerName, dbName } = req.body;
    
    if (!containerName) {
      return res.status(400).json({ error: 'Container name is required' });
    }
    
    const result = await backupService.createBackup(containerName, dbName);
    res.json(result);
  } catch (error) {
    logger.error('Error creating backup:', error);
    res.status(500).json({ error: 'Failed to create backup', details: error.message });
  }
});

// List all backups
app.get('/api/backups', async (req, res) => {
  try {
    const backups = await backupService.listBackups();
    res.json({ backups });
  } catch (error) {
    logger.error('Error listing backups:', error);
    res.status(500).json({ error: 'Failed to list backups' });
  }
});

// Restore a backup
app.post('/api/backups/restore', async (req, res) => {
  try {
    const { filename, containerName, dbName } = req.body;
    
    if (!filename || !containerName) {
      return res.status(400).json({ error: 'Filename and container name are required' });
    }
    
    const result = await backupService.restoreBackup(filename, containerName, dbName);
    res.json(result);
  } catch (error) {
    logger.error('Error restoring backup:', error);
    res.status(500).json({ error: 'Failed to restore backup', details: error.message });
  }
});

// Delete a backup
app.delete('/api/backups/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const result = await backupService.deleteBackup(filename);
    res.json(result);
  } catch (error) {
    logger.error('Error deleting backup:', error);
    res.status(500).json({ error: 'Failed to delete backup' });
  }
});

// ========== Database Management Endpoints ==========

// Create a new database
app.post('/api/databases', async (req, res) => {
  try {
    const { name, environment } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Database name is required' });
    }
    
    const database = await databaseManager.createDatabase(name, environment || 'production');
    res.json(database);
  } catch (error) {
    logger.error('Error creating database:', error);
    res.status(500).json({ error: 'Failed to create database', details: error.message });
  }
});

// List all databases
app.get('/api/databases', async (req, res) => {
  try {
    const databases = await databaseManager.listDatabases();
    res.json({ databases });
  } catch (error) {
    logger.error('Error listing databases:', error);
    res.status(500).json({ error: 'Failed to list databases' });
  }
});

// Get database details by ID
app.get('/api/databases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await databaseManager.getDatabaseById(id);
    
    if (!database) {
      return res.status(404).json({ error: 'Database not found' });
    }
    
    res.json(database);
  } catch (error) {
    logger.error('Error getting database:', error);
    res.status(500).json({ error: 'Failed to get database' });
  }
});

// Get database statistics
app.get('/api/databases/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const database = await databaseManager.getDatabaseById(id);
    
    if (!database) {
      return res.status(404).json({ error: 'Database not found' });
    }
    
    const stats = await databaseManager.getDatabaseStats(database.container_name);
    res.json(stats);
  } catch (error) {
    logger.error('Error getting database stats:', error);
    res.status(500).json({ error: 'Failed to get database stats', details: error.message });
  }
});

// Start database
app.post('/api/databases/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await databaseManager.startDatabase(id);
    res.json(result);
  } catch (error) {
    logger.error('Error starting database:', error);
    res.status(500).json({ error: 'Failed to start database', details: error.message });
  }
});

// Stop database
app.post('/api/databases/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await databaseManager.stopDatabase(id);
    res.json(result);
  } catch (error) {
    logger.error('Error stopping database:', error);
    res.status(500).json({ error: 'Failed to stop database', details: error.message });
  }
});

// Restart database
app.post('/api/databases/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await databaseManager.restartDatabase(id);
    res.json(result);
  } catch (error) {
    logger.error('Error restarting database:', error);
    res.status(500).json({ error: 'Failed to restart database', details: error.message });
  }
});

// Delete database
app.delete('/api/databases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await databaseManager.deleteDatabase(id);
    res.json(result);
  } catch (error) {
    logger.error('Error deleting database:', error);
    res.status(500).json({ error: 'Failed to delete database', details: error.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Vellaric-Signal',
    description: 'GitLab Webhook Deployment Server with Docker & HTTPS',
    version: '2.0.0',
    features: [
      'Docker container deployment',
      'Automatic HTTPS with Let\'s Encrypt',
      'Nginx reverse proxy',
      'Multi-branch support (main/master/dev)',
      'Subdomain management',
    ],
    endpoints: {
      webhook: 'POST /webhook/gitlab',
      health: 'GET /webhook/health',
      deployments: 'GET /api/deployments',
      activeDeployments: 'GET /api/deployments/active',
      removeDeployment: 'DELETE /api/deployments/:project/:branch',
      queue: 'GET /api/queue',
      cleanup: 'POST /api/cleanup',
    },
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// SPA fallback - serve React index.html for all other routes
const reactIndexPath = path.join(__dirname, '../public-react/index.html');
if (fs.existsSync(reactIndexPath)) {
  app.get('*', (req, res) => {
    res.sendFile(reactIndexPath);
  });
} else {
  // Fallback to old dashboard
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/dashboard.html'));
  });
}

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Vellaric-Signal server running on port ${PORT}`);
  logger.info(`📋 Webhook endpoint: http://localhost:${PORT}/webhook/gitlab`);
  logger.info(`🔍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
