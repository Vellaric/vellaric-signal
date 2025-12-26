const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

const dbPath = path.join(__dirname, '../../deployments.db');
const db = new sqlite3.Database(dbPath);

// Initialize database
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      project_path TEXT,
      repo_url TEXT,
      branch TEXT,
      commit_hash TEXT,
      commit_message TEXT,
      author TEXT,
      status TEXT NOT NULL,
      queued_at TEXT,
      deployed_at TEXT,
      failed_at TEXT,
      error TEXT,
      domain TEXT,
      port INTEGER,
      container_name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add missing columns to existing tables (migration)
  db.run(`ALTER TABLE deployments ADD COLUMN domain TEXT`, () => {});
  db.run(`ALTER TABLE deployments ADD COLUMN port INTEGER`, () => {});
  db.run(`ALTER TABLE deployments ADD COLUMN container_name TEXT`, () => {});

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_deployments_project 
    ON deployments(project_name)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_deployments_status 
    ON deployments(status)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_deployments_created 
    ON deployments(created_at DESC)
  `);

  // Create databases table
  db.run(`
    CREATE TABLE IF NOT EXISTS databases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      environment TEXT NOT NULL,
      container_name TEXT UNIQUE NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      database TEXT NOT NULL,
      volume_path TEXT NOT NULL,
      ssl_mode TEXT DEFAULT 'prefer',
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_databases_name 
    ON databases(name)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_databases_status 
    ON databases(status)
  `);
});

/**
 * Log a new deployment request
 */
function logDeployment(deploymentData) {
  return new Promise((resolve, reject) => {
    const { projectName, projectPath, repoUrl, branch, commit, commitMessage, author, timestamp } = deploymentData;
    
    const id = `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    db.run(
      `INSERT INTO deployments (
        id, project_name, project_path, repo_url, branch, commit_hash, 
        commit_message, author, status, queued_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectName, projectPath, repoUrl, branch, commit, commitMessage, author, 'queued', timestamp],
      (err) => {
        if (err) {
          logger.error('Database error:', err);
          reject(err);
        } else {
          resolve(id);
        }
      }
    );
  });
}

/**
 * Update deployment status
 */
function updateDeploymentStatus(deploymentId, status, additionalData = {}) {
  return new Promise((resolve, reject) => {
    const updates = { status, ...additionalData };
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);

    db.run(
      `UPDATE deployments SET ${fields} WHERE id = ?`,
      [...values, deploymentId],
      (err) => {
        if (err) {
          logger.error('Database update error:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Get deployment history
 */
function getDeploymentHistory(projectName = null, limit = 50) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM deployments';
    const params = [];

    if (projectName) {
      query += ' WHERE project_name = ?';
      params.push(projectName);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    db.all(query, params, (err, rows) => {
      if (err) {
        logger.error('Database query error:', err);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Get deployment by ID
 */
function getDeploymentById(deploymentId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM deployments WHERE id = ?',
      [deploymentId],
      (err, row) => {
        if (err) {
          logger.error('Database query error:', err);
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

module.exports = {
  logDeployment,
  updateDeploymentStatus,
  getDeploymentHistory,
  getDeploymentById,
  db,
};
