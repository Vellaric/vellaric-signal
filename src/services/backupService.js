const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

class BackupService {
  constructor() {
    this.backupDir = process.env.BACKUP_LOCAL_DIR || '/tmp/vellaric-backups';
    this.s3Bucket = process.env.S3_BUCKET;
    this.s3Endpoint = process.env.S3_ENDPOINT; // For S3-compatible services
    this.s3AccessKey = process.env.S3_ACCESS_KEY;
    this.s3SecretKey = process.env.S3_SECRET_KEY;
    this.s3Region = process.env.S3_REGION || 'us-east-1';
  }

  /**
   * Get list of database containers
   */
  async getDatabaseContainers() {
    try {
      const { db } = require('./database');
      return new Promise((resolve, reject) => {
        db.all('SELECT container_name FROM databases WHERE status = "active" ORDER BY name', [], (err, rows) => {
          if (err) {
            logger.error('Error listing database containers:', err);
            resolve([]);
          } else {
            const containers = rows.map(row => row.container_name);
            resolve(containers);
          }
        });
      });
    } catch (error) {
      logger.error('Error listing database containers:', error);
      return [];
    }
  }

  /**
   * Create a backup of a PostgreSQL database
   */
  async createBackup(containerName, dbName = null) {
    try {
      // Get database credentials from database table
      const { db } = require('./database');
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
      const database = dbName || dbInfo.database;

      // Ensure backup directory exists
      await execAsync(`mkdir -p ${this.backupDir}`);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${containerName}_${timestamp}.sql`;
      const localPath = path.join(this.backupDir, filename);

      logger.info(`Creating backup: ${filename}`);

      // Create PostgreSQL dump with correct username and database
      await execAsync(
        `docker exec ${containerName} pg_dump -U ${username} ${database} > ${localPath}`
      );

      // Compress the backup
      const compressedFilename = `${filename}.gz`;
      const compressedPath = `${localPath}.gz`;
      await execAsync(`gzip ${localPath}`);

      logger.info(`Backup created and compressed: ${compressedFilename}`);

      // Upload to S3 if configured
      if (this.isS3Configured()) {
        await this.uploadToS3(compressedPath, compressedFilename);
        // Delete local copy after successful upload
        await fs.unlink(compressedPath);
        logger.info(`Backup uploaded to S3 and local copy removed`);
      }

      return {
        success: true,
        filename: compressedFilename,
        timestamp: new Date().toISOString(),
        size: await this.getFileSize(compressedPath).catch(() => 'uploaded'),
        location: this.isS3Configured() ? 's3' : 'local'
      };
    } catch (error) {
      logger.error(`Error creating backup for ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Upload backup to S3-compatible storage
   */
  async uploadToS3(filePath, filename) {
    if (!this.isS3Configured()) {
      throw new Error('S3 storage not configured');
    }

    try {
      // Use AWS CLI or s3cmd for upload
      const endpoint = this.s3Endpoint ? `--endpoint-url ${this.s3Endpoint}` : '';
      
      // Set AWS credentials as environment variables for the command
      const awsEnv = `AWS_ACCESS_KEY_ID=${this.s3AccessKey} AWS_SECRET_ACCESS_KEY=${this.s3SecretKey} AWS_DEFAULT_REGION=${this.s3Region}`;
      
      await execAsync(
        `${awsEnv} aws s3 cp ${filePath} s3://${this.s3Bucket}/backups/${filename} ${endpoint}`
      );

      logger.info(`Uploaded ${filename} to S3 bucket: ${this.s3Bucket}`);
    } catch (error) {
      logger.error('Error uploading to S3:', error);
      throw error;
    }
  }

  /**
   * List all backups
   */
  async listBackups() {
    try {
      if (this.isS3Configured()) {
        return await this.listS3Backups();
      } else {
        return await this.listLocalBackups();
      }
    } catch (error) {
      logger.error('Error listing backups:', error);
      throw error;
    }
  }

  /**
   * List backups from S3
   */
  async listS3Backups() {
    try {
      const endpoint = this.s3Endpoint ? `--endpoint-url ${this.s3Endpoint}` : '';
      const awsEnv = `AWS_ACCESS_KEY_ID=${this.s3AccessKey} AWS_SECRET_ACCESS_KEY=${this.s3SecretKey} AWS_DEFAULT_REGION=${this.s3Region}`;
      
      const { stdout } = await execAsync(
        `${awsEnv} aws s3 ls s3://${this.s3Bucket}/backups/ ${endpoint} --recursive`
      );

      const backups = stdout.trim().split('\n')
        .filter(line => line.includes('.sql.gz'))
        .map(line => {
          const parts = line.trim().split(/\s+/);
          const date = parts[0];
          const time = parts[1];
          const size = parseInt(parts[2]);
          const filename = parts.slice(3).join(' ').replace('backups/', '');
          
          // Parse container name from filename
          const containerName = filename.split('_')[0];
          
          return {
            filename,
            containerName,
            date,
            time,
            size,
            sizeFormatted: this.formatBytes(size),
            timestamp: new Date(`${date} ${time}`).toISOString(),
            location: 's3'
          };
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return backups;
    } catch (error) {
      logger.error('Error listing S3 backups:', error);
      return [];
    }
  }

  /**
   * List local backups
   */
  async listLocalBackups() {
    try {
      await execAsync(`mkdir -p ${this.backupDir}`);
      const files = await fs.readdir(this.backupDir);
      
      const backups = await Promise.all(
        files
          .filter(file => file.endsWith('.sql.gz'))
          .map(async (file) => {
            const filePath = path.join(this.backupDir, file);
            const stats = await fs.stat(filePath);
            const containerName = file.split('_')[0];
            
            return {
              filename: file,
              containerName,
              date: stats.mtime.toISOString().split('T')[0],
              time: stats.mtime.toISOString().split('T')[1].split('.')[0],
              size: stats.size,
              sizeFormatted: this.formatBytes(stats.size),
              timestamp: stats.mtime.toISOString(),
              location: 'local'
            };
          })
      );

      return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      logger.error('Error listing local backups:', error);
      return [];
    }
  }

  /**
   * Restore a backup
   */
  async restoreBackup(filename, containerName, dbName = null) {
    try {
      // Get database credentials from database table
      const { db } = require('./database');
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
      const database = dbName || dbInfo.database;

      logger.info(`Restoring backup: ${filename} to ${containerName}`);

      let localPath = path.join(this.backupDir, filename);

      // Download from S3 if needed
      if (this.isS3Configured()) {
        await this.downloadFromS3(filename, localPath);
      }

      // Decompress
      const decompressedPath = localPath.replace('.gz', '');
      await execAsync(`gunzip -c ${localPath} > ${decompressedPath}`);

      // Restore to database with correct username and database
      await execAsync(
        `docker exec -i ${containerName} psql -U ${username} ${database} < ${decompressedPath}`
      );

      // Cleanup
      await fs.unlink(decompressedPath);
      if (this.isS3Configured()) {
        await fs.unlink(localPath);
      }

      logger.info(`Backup restored successfully: ${filename}`);
      return { success: true, message: 'Backup restored successfully' };
    } catch (error) {
      logger.error(`Error restoring backup ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Download backup from S3
   */
  async downloadFromS3(filename, localPath) {
    try {
      const endpoint = this.s3Endpoint ? `--endpoint-url ${this.s3Endpoint}` : '';
      const awsEnv = `AWS_ACCESS_KEY_ID=${this.s3AccessKey} AWS_SECRET_ACCESS_KEY=${this.s3SecretKey} AWS_DEFAULT_REGION=${this.s3Region}`;
      
      await execAsync(
        `${awsEnv} aws s3 cp s3://${this.s3Bucket}/backups/${filename} ${localPath} ${endpoint}`
      );

      logger.info(`Downloaded ${filename} from S3`);
    } catch (error) {
      logger.error('Error downloading from S3:', error);
      throw error;
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(filename) {
    try {
      if (this.isS3Configured()) {
        const endpoint = this.s3Endpoint ? `--endpoint-url ${this.s3Endpoint}` : '';
        const awsEnv = `AWS_ACCESS_KEY_ID=${this.s3AccessKey} AWS_SECRET_ACCESS_KEY=${this.s3SecretKey} AWS_DEFAULT_REGION=${this.s3Region}`;
        
        await execAsync(
          `${awsEnv} aws s3 rm s3://${this.s3Bucket}/backups/${filename} ${endpoint}`
        );
      } else {
        const localPath = path.join(this.backupDir, filename);
        await fs.unlink(localPath);
      }

      logger.info(`Deleted backup: ${filename}`);
      return { success: true, message: 'Backup deleted successfully' };
    } catch (error) {
      logger.error(`Error deleting backup ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Check if S3 is configured
   */
  isS3Configured() {
    return !!(this.s3Bucket && this.s3AccessKey && this.s3SecretKey);
  }

  /**
   * Get file size
   */
  async getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return this.formatBytes(stats.size);
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = new BackupService();
