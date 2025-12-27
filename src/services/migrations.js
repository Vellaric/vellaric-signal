const logger = require('../utils/logger');

/**
 * Database migrations
 * Run these to update the database schema
 */

async function runMigrations(db) {
  logger.info('Running database migrations...');
  
  // Migration 1: Add projects table and migrate environment_variables
  await migration_001_projects_table(db);
  
  logger.info('All migrations completed');
}

/**
 * Migration 001: Add projects table and update environment_variables
 */
function migration_001_projects_table(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Check if migration is needed
      db.get("PRAGMA table_info(environment_variables)", (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Check if we need to migrate
        db.all("PRAGMA table_info(environment_variables)", (err, columns) => {
          if (err) {
            reject(err);
            return;
          }
          
          const hasProjectId = columns.some(col => col.name === 'project_id');
          const hasProjectName = columns.some(col => col.name === 'project_name');
          
          if (hasProjectId) {
            logger.info('Migration 001: Already applied, skipping');
            resolve();
            return;
          }
          
          if (!hasProjectName) {
            logger.info('Migration 001: No old schema found, skipping');
            resolve();
            return;
          }
          
          logger.info('Migration 001: Migrating to projects table schema...');
          
          // Step 1: Create projects table
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
          `, (err) => {
            if (err) {
              logger.error('Error creating projects table:', err);
              reject(err);
              return;
            }
            
            // Step 2: Get unique project names from old environment_variables
            db.all("SELECT DISTINCT project_name FROM environment_variables", (err, rows) => {
              if (err) {
                logger.error('Error reading old environment variables:', err);
                reject(err);
                return;
              }
              
              // Step 3: Create projects for each unique project name
              const projectInserts = rows.map(row => {
                return new Promise((resolveInsert, rejectInsert) => {
                  const id = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  const timestamp = new Date().toISOString();
                  
                  // Try to get repo URL from deployments table
                  db.get("SELECT repo_url FROM deployments WHERE project_name = ? LIMIT 1", 
                    [row.project_name], 
                    (err, deployment) => {
                      const repoUrl = deployment?.repo_url || `https://gitlab.com/${row.project_name}.git`;
                      
                      db.run(`
                        INSERT OR IGNORE INTO projects 
                        (id, name, repo_url, default_branch, enabled_branches, auto_deploy, description, updated_at) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                      `, [
                        id,
                        row.project_name,
                        repoUrl,
                        'production',
                        'production,master,dev',
                        1,
                        'Auto-migrated from old schema',
                        timestamp
                      ], (err) => {
                        if (err) {
                          logger.error(`Error creating project ${row.project_name}:`, err);
                          rejectInsert(err);
                        } else {
                          logger.info(`Created project: ${row.project_name} (${id})`);
                          resolveInsert({ name: row.project_name, id });
                        }
                      });
                    }
                  );
                });
              });
              
              Promise.all(projectInserts).then(() => {
                // Step 4: Rename old table
                db.run("ALTER TABLE environment_variables RENAME TO environment_variables_old", (err) => {
                  if (err) {
                    logger.error('Error renaming old table:', err);
                    reject(err);
                    return;
                  }
                  
                  // Step 5: Create new environment_variables table
                  db.run(`
                    CREATE TABLE environment_variables (
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
                  `, (err) => {
                    if (err) {
                      logger.error('Error creating new environment_variables table:', err);
                      reject(err);
                      return;
                    }
                    
                    // Step 6: Migrate data from old table to new table
                    db.all(`
                      SELECT ev.*, p.id as project_id 
                      FROM environment_variables_old ev
                      JOIN projects p ON ev.project_name = p.name
                    `, (err, oldVars) => {
                      if (err) {
                        logger.error('Error reading old environment variables:', err);
                        reject(err);
                        return;
                      }
                      
                      if (oldVars.length === 0) {
                        logger.info('No environment variables to migrate');
                        // Drop old table
                        db.run("DROP TABLE environment_variables_old", () => {
                          logger.info('Migration 001: Completed successfully');
                          resolve();
                        });
                        return;
                      }
                      
                      // Insert into new table
                      const insertStmt = db.prepare(`
                        INSERT INTO environment_variables 
                        (id, project_id, branch, key, value, is_secret, description, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                      `);
                      
                      let migrated = 0;
                      oldVars.forEach(v => {
                        insertStmt.run([
                          v.id,
                          v.project_id,
                          v.branch,
                          v.key,
                          v.value,
                          v.is_secret,
                          v.description,
                          v.created_at,
                          v.updated_at
                        ], (err) => {
                          if (err) {
                            logger.error(`Error migrating env var ${v.key}:`, err);
                          } else {
                            migrated++;
                          }
                          
                          if (migrated === oldVars.length) {
                            insertStmt.finalize();
                            logger.info(`Migrated ${migrated} environment variables`);
                            
                            // Drop old table
                            db.run("DROP TABLE environment_variables_old", (err) => {
                              if (err) {
                                logger.error('Error dropping old table:', err);
                              }
                              logger.info('Migration 001: Completed successfully');
                              resolve();
                            });
                          }
                        });
                      });
                    });
                  });
                });
              }).catch(reject);
            });
          });
        });
      });
    });
  });
}

module.exports = {
  runMigrations
};
