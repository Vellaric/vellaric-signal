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

  // Create environment_variables table
  db.run(`
    CREATE TABLE IF NOT EXISTS environment_variables (
      id TEXT PRIMARY KEY,
      project_name TEXT NOT NULL,
      branch TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      is_secret INTEGER DEFAULT 0,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_name, branch, key)
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_env_vars_project_branch 
    ON environment_variables(project_name, branch)
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

/**
 * Save environment variable for a project
 */
function saveEnvironmentVariable(projectName, branch, key, value, isSecret = false, description = '') {
  return new Promise((resolve, reject) => {
    const id = `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    db.run(
      `INSERT OR REPLACE INTO environment_variables 
       (id, project_name, branch, key, value, is_secret, description, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectName, branch, key, value, isSecret ? 1 : 0, description, timestamp],
      (err) => {
        if (err) {
          logger.error('Error saving environment variable:', err);
          reject(err);
        } else {
          resolve({ id, projectName, branch, key, isSecret, description });
        }
      }
    );
  });
}

/**
 * Get environment variables for a project and branch
 */
function getEnvironmentVariables(projectName, branch) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, project_name, branch, key, value, is_secret, description, created_at, updated_at 
       FROM environment_variables 
       WHERE project_name = ? AND branch = ?
       ORDER BY key ASC`,
      [projectName, branch],
      (err, rows) => {
        if (err) {
          logger.error('Error fetching environment variables:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Get all environment variables for a project (all branches)
 */
function getAllEnvironmentVariables(projectName) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, project_name, branch, key, value, is_secret, description, created_at, updated_at 
       FROM environment_variables 
       WHERE project_name = ?
       ORDER BY branch ASC, key ASC`,
      [projectName],
      (err, rows) => {
        if (err) {
          logger.error('Error fetching all environment variables:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Delete environment variable by ID
 */
function deleteEnvironmentVariable(id) {
  return new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM environment_variables WHERE id = ?',
      [id],
      (err) => {
        if (err) {
          logger.error('Error deleting environment variable:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Get environment variables as key-value object
 */
async function getEnvironmentVariablesAsObject(projectName, branch) {
  const vars = await getEnvironmentVariables(projectName, branch);
  const envObj = {};
  vars.forEach(v => {
    envObj[v.key] = v.value;
  });
  return envObj;
}

module.exports = {
  logDeployment,
  updateDeploymentStatus,
  getDeploymentHistory,
  getDeploymentById,
  saveEnvironmentVariable,
  getEnvironmentVariables,
  getAllEnvironmentVariables,
  deleteEnvironmentVariable,
  getEnvironmentVariablesAsObject,
  db,
};
