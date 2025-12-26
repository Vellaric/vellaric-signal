const { exec } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const path = require('path');
const logger = require('../utils/logger');
const { db } = require('./database');

const execAsync = promisify(exec);

class DatabaseManager {
  constructor() {
    this.baseDomain = process.env.BASE_DOMAIN || 'vellaric.com';
    this.postgresVersion = process.env.POSTGRES_VERSION || 'latest';
    this.dataDir = process.env.POSTGRES_DATA_DIR || '/var/vellaric/postgres';
  }

  /**
   * Generate secure random password
   */
  generatePassword(length = 24) {
    return crypto.randomBytes(length)
      .toString('base64')
      .slice(0, length)
      .replace(/\+/g, 'A')
      .replace(/\//g, 'B');
  }

  /**
   * Generate unique database ID
   */
  generateDatabaseId() {
    return `db-${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Create a new PostgreSQL database
   */
  async createDatabase(name, environment = 'production') {
    try {
      logger.info(`Creating database: ${name} (${environment})`);

      // Generate credentials
      const dbId = this.generateDatabaseId();
      const username = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const password = this.generatePassword();
      const containerName = `${username}-${environment}-postgres`;
      
      // Check if database with this name/environment already exists
      const existingDb = await this.getDatabaseByName(name, environment);
      if (existingDb) {
        throw new Error(`Database "${name}" already exists in ${environment} environment`);
      }
      
      // Generate host and volume path
      const host = `${containerName}.db.${this.baseDomain}`;
      const volumePath = path.join(this.dataDir, containerName);
      
      // Check if container already exists and clean it up
      try {
        const { stdout } = await execAsync(`docker ps -a --filter "name=^${containerName}$" --format "{{.Names}}"`);
        if (stdout.trim() === containerName) {
          logger.warn(`Container ${containerName} already exists, removing it and cleaning data...`);
          await execAsync(`docker rm -f ${containerName}`);
          // Remove old volume data to prevent version conflicts
          await execAsync(`rm -rf ${volumePath}`);
          logger.info(`Cleaned up old data for ${containerName}`);
        }
      } catch (err) {
        // Ignore error if container doesn't exist
      }
      
      // Find available port (starting from 5432)
      const port = await this.findAvailablePort(5432);
      
      // Create data directory
      await execAsync(`mkdir -p ${volumePath}`);
      
      logger.info(`Starting PostgreSQL container: ${containerName}`);
      
      // Create and start PostgreSQL container
      // Note: For PostgreSQL 18+, mount to /var/lib/postgresql (not /var/lib/postgresql/data)
      await execAsync(`
        docker run -d \
          --name ${containerName} \
          --restart unless-stopped \
          -e POSTGRES_USER=${username} \
          -e POSTGRES_PASSWORD=${password} \
          -e POSTGRES_DB=${username} \
          -p ${port}:5432 \
          -v ${volumePath}:/var/lib/postgresql \
          postgres:${this.postgresVersion}
      `);

      // Wait for database to be ready
      await this.waitForDatabase(containerName, username);

      // Store in database
      await this.saveDatabaseInfo({
        id: dbId,
        name,
        environment,
        container_name: containerName,
        host,
        port,
        username,
        password,
        database: username,
        volume_path: volumePath,
        ssl_mode: 'prefer',
        status: 'active',
        created_at: new Date().toISOString()
      });

      logger.info(`Database created successfully: ${containerName}`);

      return {
        id: dbId,
        name,
        environment,
        host,
        port,
        username,
        password,
        database: username,
        ssl_mode: 'prefer',
        container_name: containerName,
        status: 'active',
        created_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error creating database:', error);
      throw error;
    }
  }

  /**
   * Wait for database to be ready
   */
  async waitForDatabase(containerName, username, maxAttempts = 60) {
    logger.info(`Waiting for database ${containerName} to be ready...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check if container is running
        const { stdout: runningCheck } = await execAsync(
          `docker ps --filter "name=${containerName}" --filter "status=running" --format "{{.Names}}"`
        );
        
        if (!runningCheck.includes(containerName)) {
          // Container not running, check logs
          const { stdout: logs } = await execAsync(`docker logs ${containerName} 2>&1 | tail -20`);
          logger.error(`Container ${containerName} not running. Logs:\n${logs}`);
          throw new Error(`Container ${containerName} failed to start`);
        }
        
        // Try to connect
        const { stdout } = await execAsync(
          `docker exec ${containerName} pg_isready -U ${username} 2>&1`
        );
        
        if (stdout.includes('accepting connections')) {
          logger.info(`Database ${containerName} is ready!`);
          return true;
        }
      } catch (err) {
        // Continue waiting if it's just connection refused
        if (i % 10 === 0) {
          logger.info(`Still waiting for database ${containerName}... (${i}/${maxAttempts})`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Get final logs before failing
    try {
      const { stdout: logs } = await execAsync(`docker logs ${containerName} 2>&1 | tail -50`);
      logger.error(`Database ${containerName} failed to start after ${maxAttempts} attempts. Logs:\n${logs}`);
    } catch (e) {
      // Ignore log fetch errors
    }
    
    throw new Error(`Database failed to start after ${maxAttempts * 2} seconds`);
  }

  /**
   * Find available port
   */
  async findAvailablePort(startPort) {
    for (let port = startPort; port < startPort + 1000; port++) {
      try {
        const { stdout } = await execAsync(`lsof -i:${port} || echo "free"`);
        if (stdout.includes('free')) {
          return port;
        }
      } catch (err) {
        return port;
      }
    }
    throw new Error('No available ports');
  }

  /**
   * Save database info to SQLite
   */
  async saveDatabaseInfo(info) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO databases (id, name, environment, container_name, host, port, username, password, database, volume_path, ssl_mode, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          info.id,
          info.name,
          info.environment,
          info.container_name,
          info.host,
          info.port,
          info.username,
          info.password,
          info.database,
          info.volume_path,
          info.ssl_mode,
          info.status,
          info.created_at
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * List all databases
   */
  async listDatabases() {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM databases ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get database by ID
   */
  async getDatabaseById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM databases WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Get database by name and environment
   */
  async getDatabaseByName(name, environment) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM databases WHERE name = ? AND environment = ?', [name, environment], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(containerName) {
    try {
      // Get database info to retrieve username
      const dbInfo = await new Promise((resolve, reject) => {
        db.get('SELECT username, database FROM databases WHERE container_name = ?', [containerName], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!dbInfo) {
        throw new Error(`Database not found for container: ${containerName}`);
      }

      const username = dbInfo.username;
      const database = dbInfo.database;

      // Check if container is running
      const { stdout: inspectOutput } = await execAsync(
        `docker inspect ${containerName} --format='{{.State.Running}}'`
      );
      const isRunning = inspectOutput.trim() === 'true';

      if (!isRunning) {
        return {
          status: 'stopped',
          size: 'N/A',
          connections: 0,
          uptime: 'N/A'
        };
      }

      // Get database size
      const { stdout: sizeOutput } = await execAsync(
        `docker exec ${containerName} psql -U ${username} -d ${database} -t -c "SELECT pg_size_pretty(pg_database_size(current_database()))"`
      );

      // Get active connections
      const { stdout: connOutput } = await execAsync(
        `docker exec ${containerName} psql -U ${username} -d ${database} -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'"`
      );

      // Get container stats
      const { stdout: statsOutput } = await execAsync(
        `docker stats ${containerName} --no-stream --format "{{json .}}"`
      );
      const stats = JSON.parse(statsOutput);

      // Get uptime
      const { stdout: uptimeOutput } = await execAsync(
        `docker inspect ${containerName} --format='{{.State.StartedAt}}'`
      );
      const startTime = new Date(uptimeOutput.trim());
      const uptime = this.formatUptime(Date.now() - startTime.getTime());

      return {
        status: 'running',
        size: sizeOutput.trim(),
        connections: parseInt(connOutput.trim()) || 0,
        cpu: stats.CPUPerc,
        memory: stats.MemUsage,
        uptime
      };
    } catch (error) {
      logger.error(`Error getting database stats for ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Format uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  /**
   * Delete database
   */
  async deleteDatabase(id) {
    try {
      const dbInfo = await this.getDatabaseById(id);
      if (!dbInfo) {
        throw new Error('Database not found');
      }

      logger.info(`Deleting database: ${dbInfo.container_name}`);

      // Stop and remove container
      await execAsync(`docker stop ${dbInfo.container_name} 2>/dev/null || true`);
      await execAsync(`docker rm ${dbInfo.container_name} 2>/dev/null || true`);

      // Optionally remove volume (commented out for safety)
      // await execAsync(`rm -rf ${dbInfo.volume_path}`);

      // Remove from database
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM databases WHERE id = ?', [id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      logger.info(`Database deleted: ${dbInfo.container_name}`);
      return { success: true };
    } catch (error) {
      logger.error('Error deleting database:', error);
      throw error;
    }
  }

  /**
   * Start database container
   */
  async startDatabase(id) {
    const dbInfo = await this.getDatabaseById(id);
    if (!dbInfo) throw new Error('Database not found');

    await execAsync(`docker start ${dbInfo.container_name}`);
    logger.info(`Database started: ${dbInfo.container_name}`);
    return { success: true };
  }

  /**
   * Stop database container
   */
  async stopDatabase(id) {
    const dbInfo = await this.getDatabaseById(id);
    if (!dbInfo) throw new Error('Database not found');

    await execAsync(`docker stop ${dbInfo.container_name}`);
    logger.info(`Database stopped: ${dbInfo.container_name}`);
    return { success: true };
  }

  /**
   * Restart database container
   */
  async restartDatabase(id) {
    const dbInfo = await this.getDatabaseById(id);
    if (!dbInfo) throw new Error('Database not found');

    await execAsync(`docker restart ${dbInfo.container_name}`);
    logger.info(`Database restarted: ${dbInfo.container_name}`);
    return { success: true };
  }
}

module.exports = new DatabaseManager();
