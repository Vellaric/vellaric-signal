const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

const dbPath = path.join(__dirname, '../../deployments.db');
const db = new sqlite3.Database(dbPath);

// Run migrations after database is initialized
let migrationsRun = false;

async function runMigrationsIfNeeded() {
  if (migrationsRun) return;
  migrationsRun = true;
  
  const { runMigrations } = require('./migrations');
  try {
    await runMigrations(db);
  } catch (err) {
    logger.error('Error running migrations:', err);
  }
}

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

  // Create projects table
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      gitlab_project_id TEXT,
      repo_url TEXT NOT NULL,
      default_branch TEXT DEFAULT 'production',
      enabled_branches TEXT DEFAULT 'production,master,dev',
      auto_deploy INTEGER DEFAULT 1,
      status TEXT DEFAULT 'active',
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_projects_name 
    ON projects(name)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_projects_status 
    ON projects(status)
  `);

  // Create environment_variables table
  db.run(`
    CREATE TABLE IF NOT EXISTS environment_variables (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      branch TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      is_secret INTEGER DEFAULT 0,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, branch, key),
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_env_vars_project_branch 
    ON environment_variables(project_id, branch)
  `);
  
  // Run migrations after schema is set up
  runMigrationsIfNeeded();
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
function saveEnvironmentVariable(projectId, branch, key, value, isSecret = false, description = '') {
  return new Promise((resolve, reject) => {
    const id = `env_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    db.run(
      `INSERT OR REPLACE INTO environment_variables 
       (id, project_id, branch, key, value, is_secret, description, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, branch, key, value, isSecret ? 1 : 0, description, timestamp],
      (err) => {
        if (err) {
          logger.error('Error saving environment variable:', err);
          reject(err);
        } else {
          resolve({ id, projectId, branch, key, isSecret, description });
        }
      }
    );
  });
}

/**
 * Get environment variables for a project and branch (by project ID or name)
 */
function getEnvironmentVariables(projectIdentifier, branch) {
  return new Promise((resolve, reject) => {
    // Check if identifier is a project ID (starts with 'proj_') or name
    const isId = projectIdentifier.startsWith('proj_');
    const query = isId
      ? `SELECT ev.* FROM environment_variables ev 
         WHERE ev.project_id = ? AND ev.branch = ?
         ORDER BY ev.key ASC`
      : `SELECT ev.* FROM environment_variables ev
         JOIN projects p ON ev.project_id = p.id
         WHERE p.name = ? AND ev.branch = ?
         ORDER BY ev.key ASC`;
    
    db.all(query, [projectIdentifier, branch], (err, rows) => {
      if (err) {
        logger.error('Error fetching environment variables:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

/**
 * Get all environment variables for a project (all branches) (by project ID or name)
 */
function getAllEnvironmentVariables(projectIdentifier) {
  return new Promise((resolve, reject) => {
    const isId = projectIdentifier.startsWith('proj_');
    const query = isId
      ? `SELECT ev.* FROM environment_variables ev
         WHERE ev.project_id = ?
         ORDER BY ev.branch ASC, ev.key ASC`
      : `SELECT ev.* FROM environment_variables ev
         JOIN projects p ON ev.project_id = p.id
         WHERE p.name = ?
         ORDER BY ev.branch ASC, ev.key ASC`;
    
    db.all(query, [projectIdentifier], (err, rows) => {
      if (err) {
        logger.error('Error fetching all environment variables:', err);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
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
 * Get environment variables as key-value object (by project ID or name)
 */
async function getEnvironmentVariablesAsObject(projectIdentifier, branch) {
  const vars = await getEnvironmentVariables(projectIdentifier, branch);
  const envObj = {};
  vars.forEach(v => {
    envObj[v.key] = v.value;
  });
  return envObj;
}

/**
 * Create a new project
 */
function createProject(projectData) {
  return new Promise((resolve, reject) => {
    const { name, repoUrl, defaultBranch, enabledBranches, autoDeploy, description, gitlabProjectId } = projectData;
    const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();
    
    db.run(
      `INSERT INTO projects 
       (id, name, repo_url, gitlab_project_id, default_branch, enabled_branches, auto_deploy, description, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, 
        name, 
        repoUrl, 
        gitlabProjectId || null,
        defaultBranch || 'production', 
        enabledBranches || 'production,master,dev',
        autoDeploy ? 1 : 0,
        description || '',
        timestamp
      ],
      (err) => {
        if (err) {
          logger.error('Error creating project:', err);
          reject(err);
        } else {
          resolve({ id, name, repoUrl, defaultBranch, enabledBranches, autoDeploy, description });
        }
      }
    );
  });
}

/**
 * Get all projects
 */
function getAllProjects() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM projects WHERE status = 'active' ORDER BY created_at DESC`,
      [],
      (err, rows) => {
        if (err) {
          logger.error('Error fetching projects:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

/**
 * Get project by ID
 */
function getProjectById(id) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM projects WHERE id = ?',
      [id],
      (err, row) => {
        if (err) {
          logger.error('Error fetching project:', err);
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

/**
 * Get project by name
 */
function getProjectByName(name) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM projects WHERE name = ?',
      [name],
      (err, row) => {
        if (err) {
          logger.error('Error fetching project:', err);
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
}

/**
 * Update project
 */
function updateProject(id, updates) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    const updatesWithTimestamp = { ...updates, updated_at: timestamp };
    const fields = Object.keys(updatesWithTimestamp).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updatesWithTimestamp);

    db.run(
      `UPDATE projects SET ${fields} WHERE id = ?`,
      [...values, id],
      (err) => {
        if (err) {
          logger.error('Error updating project:', err);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * Delete project (soft delete)
 */
function deleteProject(id) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE projects SET status = 'deleted' WHERE id = ?`,
      [id],
      (err) => {
        if (err) {
          logger.error('Error deleting project:', err);
          reject(err);
        } else {
          resolve();
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
  saveEnvironmentVariable,
  getEnvironmentVariables,
  getAllEnvironmentVariables,
  deleteEnvironmentVariable,
  getEnvironmentVariablesAsObject,
  createProject,
  getAllProjects,
  getProjectById,
  getProjectByName,
  updateProject,
  deleteProject,
  db,
};
