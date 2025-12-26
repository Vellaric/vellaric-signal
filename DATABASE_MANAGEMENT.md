# Database Management Guide

Vellaric Signal now includes a complete database management system similar to DigitalOcean App Platform, allowing you to create and manage PostgreSQL databases directly from the dashboard.

## Features

✅ **One-Click Database Creation** - Create PostgreSQL databases with a single click  
✅ **Auto-Generated Credentials** - Secure random passwords and connection strings  
✅ **Multiple Environments** - Support for production, staging, and development  
✅ **Real-Time Monitoring** - Track CPU, memory, disk size, and active connections  
✅ **Container Controls** - Start, stop, and restart databases from the UI  
✅ **Connection Info** - View and copy connection strings instantly  
✅ **Automatic Backups** - Integrate with the backup system for data protection

## Quick Start

### 1. Access Database Management

Navigate to the dashboard and click **"Databases"** in the sidebar.

### 2. Create Your First Database

1. Click **"+ Create Database"**
2. Enter a database name (lowercase, numbers, hyphens only)
3. Select environment (production/staging/development)
4. Click **"Create Database"**

### 3. Get Connection Details

After creation, a modal will show your connection credentials:

```
host=my-database-production-postgres.yourdomain.com
port=5432
username=db_user_abc123
password=your_secure_generated_password
database=my-database
sslmode=require
```

**⚠️ Important:** Save these credentials immediately! They cannot be recovered later.

### 4. Connection String

Use the full connection string in your applications:

```
postgresql://db_user_abc123:your_secure_generated_password@my-database-production-postgres.yourdomain.com:5432/my-database?sslmode=require
```

## API Endpoints

### Create Database

```bash
POST /api/databases
Content-Type: application/json

{
  "name": "my-database",
  "environment": "production"
}
```

**Response:**
```json
{
  "id": "db-a1b2c3d4e5f6...",
  "name": "my-database",
  "environment": "production",
  "connection": {
    "host": "my-database-production-postgres.yourdomain.com",
    "port": 5432,
    "username": "db_user_abc123",
    "password": "your_secure_generated_password",
    "database": "my-database",
    "sslmode": "prefer"
  },
  "container_name": "my-database-production-postgres",
  "status": "active",
  "created_at": "2025-12-24T14:22:50.000Z"
}
```

### List All Databases

```bash
GET /api/databases
```

**Response:**
```json
{
  "databases": [
    {
      "id": "db-a1b2c3d4e5f6...",
      "name": "my-database",
      "environment": "production",
      "container_name": "my-database-production-postgres",
      "host": "my-database-production-postgres.yourdomain.com",
      "port": 5432,
      "username": "db_user_abc123",
      "database": "my-database",
      "status": "active",
      "created_at": "2025-12-24T14:22:50.000Z"
    }
  ]
}
```

### Get Database Details

```bash
GET /api/databases/:id
```

### Get Database Statistics

```bash
GET /api/databases/:id/stats
```

**Response:**
```json
{
  "status": "running",
  "size": "42 MB",
  "connections": 3,
  "cpu": "2.5%",
  "memory": "156MB / 512MB",
  "uptime": "2d 5h"
}
```

### Control Database

```bash
# Start
POST /api/databases/:id/start

# Stop
POST /api/databases/:id/stop

# Restart
POST /api/databases/:id/restart
```

### Delete Database

```bash
DELETE /api/databases/:id
```

## Configuration

Add these to your `.env` file:

```bash
# PostgreSQL version for created databases
POSTGRES_VERSION=15-alpine

# Data directory for database volumes
POSTGRES_DATA_DIR=/var/vellaric/postgres

# Base domain for database hostnames
BASE_DOMAIN=yourdomain.com
```

## Architecture

### Container Naming

Databases are created as Docker containers with the naming pattern:
```
{name}-{environment}-postgres
```

Example: `my-database-production-postgres`

### Volume Management

Each database has a persistent volume at:
```
/var/vellaric/postgres/{container-name}/
```

This ensures data persists across container restarts.

### Port Allocation

The system automatically finds available ports starting from `5432`. Each database gets its own unique port.

### Host Generation

Database hosts follow the pattern:
```
{container-name}.db.{BASE_DOMAIN}
```

Example: `my-database-production-postgres.db.yourdomain.com`

## Monitoring

The dashboard shows real-time metrics for each database:

- **Status**: Running, stopped, or error
- **Size**: Total disk space used
- **Connections**: Active database connections
- **CPU**: Current CPU usage percentage
- **Memory**: RAM usage (current/limit)
- **Uptime**: Time since container started

## Security

### Password Generation

- 24 characters long
- Cryptographically secure random generation
- Base64 encoded for compatibility
- Special characters normalized (+ → A, / → B)

### SSL/TLS

- Default `sslmode=prefer` (encrypted when available)
- Can be changed to `require` for production

### Credentials Storage

- Passwords stored encrypted in SQLite
- Only displayed once at creation
- No recovery mechanism (security by design)

## Backup Integration

Databases created through the management system are automatically available in the backup system:

1. Go to **Database Backups**
2. Select your database from the dropdown
3. Click **Create Backup**
4. Backups are stored with timestamp: `{container}-{YYYYMMDD-HHMMSS}.sql.gz`

## Troubleshooting

### Database won't start

Check Docker logs:
```bash
docker logs my-database-production-postgres
```

### Connection refused

Verify the database is running:
```bash
docker ps | grep postgres
```

Check port mapping:
```bash
docker port my-database-production-postgres
```

### Out of disk space

Check volume usage:
```bash
du -sh /var/vellaric/postgres/*
```

### Can't create database

Ensure directory exists and has proper permissions:
```bash
sudo mkdir -p /var/vellaric/postgres
sudo chown -R $USER:$USER /var/vellaric/postgres
```

### Port already in use

The system automatically finds available ports. If you encounter issues:
```bash
# Check what's using port 5432
lsof -i:5432

# Or use netstat
netstat -tulpn | grep 5432
```

## Best Practices

### 1. Environment Separation

Create separate databases for each environment:
- `myapp-production` for production
- `myapp-staging` for staging
- `myapp-development` for development

### 2. Regular Backups

Set up automated backups:
- Daily backups for production databases
- Weekly backups for staging
- Manual backups before major changes

### 3. Monitor Resources

Keep an eye on:
- Disk space usage
- Active connections
- Query performance
- Memory usage

### 4. Secure Credentials

- Store connection strings in environment variables
- Use `.env` files (never commit to git)
- Rotate passwords periodically
- Use SSL/TLS in production (`sslmode=require`)

### 5. Cleanup Old Databases

Delete unused databases to free up resources:
- Development databases after project completion
- Test databases after testing
- Old staging databases

## Migration from External Databases

If you're migrating from an existing PostgreSQL database:

### 1. Create New Database
```bash
# Create via API or dashboard
```

### 2. Export Existing Data
```bash
pg_dump -h old-host -U username -d database > backup.sql
```

### 3. Import to New Database
```bash
docker exec -i my-database-production-postgres psql -U my-database -d my-database < backup.sql
```

### 4. Update Application Config
Replace old connection string with new one.

### 5. Test Application
Verify all features work with the new database.

## Scaling Considerations

### Vertical Scaling (Resource Limits)

Modify container resources:
```bash
docker update my-database-production-postgres --memory=2g --cpus=2
```

### Horizontal Scaling (Replication)

For high-availability setups:
1. Create read replicas manually
2. Configure streaming replication
3. Use connection pooling (PgBouncer)

### Connection Pooling

Install PgBouncer for better connection management:
```bash
docker run -d --name pgbouncer \
  -p 6432:6432 \
  -e DATABASE_URL=postgresql://... \
  edoburu/pgbouncer
```

## Advanced Usage

### Custom PostgreSQL Configuration

Create a custom `postgresql.conf`:
```bash
# Create config
echo "max_connections = 200" > /var/vellaric/postgres/my-db/postgresql.conf

# Restart database
docker restart my-database-production-postgres
```

### Extensions

Install PostgreSQL extensions:
```bash
docker exec -it my-database-production-postgres psql -U my-database -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;"
```

### Performance Tuning

Monitor slow queries:
```sql
SELECT query, mean_exec_time, calls 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

## Support

For issues or questions:
- Check the [Troubleshooting](#troubleshooting) section
- Review Docker logs: `docker logs <container-name>`
- Open an issue on GitHub
- Contact support: support@yourdomain.com
