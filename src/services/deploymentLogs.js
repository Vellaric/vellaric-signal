/**
 * In-memory deployment logs storage
 * Stores logs for active and recent deployments
 */

const MAX_LOGS_PER_DEPLOYMENT = 500;
const LOG_RETENTION_MS = 30 * 60 * 1000; // 30 minutes

class DeploymentLogs {
  constructor() {
    this.logs = new Map(); // deploymentId -> array of log entries
    this.startCleanupInterval();
  }

  /**
   * Add a log entry for a deployment
   */
  addLog(deploymentId, level, message) {
    if (!this.logs.has(deploymentId)) {
      this.logs.set(deploymentId, []);
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    const logs = this.logs.get(deploymentId);
    logs.push(logEntry);

    // Keep only last MAX_LOGS_PER_DEPLOYMENT entries
    if (logs.length > MAX_LOGS_PER_DEPLOYMENT) {
      logs.shift();
    }

    // Emit real-time log update via Socket.IO
    if (global.io) {
      global.io.emit('deployment:log', {
        deploymentId,
        log: logEntry
      });
    }
  }

  /**
   * Get logs for a deployment
   */
  getLogs(deploymentId) {
    return this.logs.get(deploymentId) || [];
  }

  /**
   * Clear logs for a deployment
   */
  clearLogs(deploymentId) {
    this.logs.delete(deploymentId);
  }

  /**
   * Get all active deployment IDs with logs
   */
  getActiveDeployments() {
    return Array.from(this.logs.keys());
  }

  /**
   * Cleanup old logs periodically
   */
  startCleanupInterval() {
    setInterval(() => {
      const now = Date.now();
      for (const [deploymentId, logs] of this.logs.entries()) {
        if (logs.length === 0) continue;
        
        const lastLog = logs[logs.length - 1];
        const lastLogTime = new Date(lastLog.timestamp).getTime();
        
        // Remove logs older than retention period
        if (now - lastLogTime > LOG_RETENTION_MS) {
          this.logs.delete(deploymentId);
        }
      }
    }, 5 * 60 * 1000); // Run every 5 minutes
  }
}

// Singleton instance
const deploymentLogs = new DeploymentLogs();

module.exports = {
  addDeploymentLog: (id, level, msg) => deploymentLogs.addLog(id, level, msg),
  getDeploymentLogs: (id) => deploymentLogs.getLogs(id),
  clearDeploymentLogs: (id) => deploymentLogs.clearLogs(id),
  getActiveDeployments: () => deploymentLogs.getActiveDeployments(),
};
