# Environment Variables Management

This guide explains how to configure environment variables for your deployed containers in Vellaric-Signal.

## Overview

Environment variables allow you to configure your applications without hardcoding values in your code. This is essential for:

- **Configuration**: Set different values for different environments (production, development, staging)
- **Secrets**: Store sensitive data like API keys, database passwords, and tokens
- **Runtime Settings**: Configure application behavior without rebuilding the container

## Features

✅ **Per-Project Configuration**: Set variables specific to each project  
✅ **Branch-Specific**: Different values for production, dev, and master branches  
✅ **Secret Management**: Mark sensitive values as secrets (masked in UI)  
✅ **Auto-Injection**: Variables automatically injected during deployment  
✅ **Database Backed**: Persistent storage with SQLite  
✅ **Web UI**: Easy-to-use dashboard for managing variables  

## Using Environment Variables in Your Application

### Node.js Example

```javascript
// server.js
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATABASE_URL = process.env.DATABASE_URL;
const API_KEY = process.env.API_KEY;

if (NODE_ENV === 'production') {
  console.log('Running in production mode');
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Python Example

```python
import os

PORT = os.getenv('PORT', 3000)
NODE_ENV = os.getenv('NODE_ENV', 'development')
DATABASE_URL = os.getenv('DATABASE_URL')
API_KEY = os.getenv('API_KEY')

if NODE_ENV == 'production':
    print('Running in production mode')
```

### Docker Integration

Your Dockerfile should expose the port and your application should read from environment variables:

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Expose the port (will be mapped by deployment system)
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
```

## Managing Variables via Dashboard

### 1. Access the Environment Section

1. Log in to your Vellaric-Signal dashboard
2. Navigate to **Configuration → Environment** in the sidebar
3. You'll see all configured environment variables

### 2. Add a New Variable

Click the **"+ Add Variable"** button and fill in:

- **Project**: Select the project name (from your deployed apps)
- **Branch**: Choose the branch (production, master, or dev)
- **Key**: Variable name in UPPERCASE_SNAKE_CASE (e.g., `NODE_ENV`, `DATABASE_URL`)
- **Value**: The actual value for the variable
- **Description**: Optional note about what this variable does
- **Secret**: Check this to mask the value in the UI

Example configurations:

```
Key: NODE_ENV
Value: production
Description: Application environment mode
Secret: No

Key: DATABASE_URL
Value: postgresql://user:pass@db.example.com:5432/mydb
Description: PostgreSQL connection string
Secret: Yes

Key: API_KEY
Value: sk_live_abc123xyz789
Description: Stripe API key for production
Secret: Yes

Key: PORT
Value: 3000
Description: Application port (internal container port)
Secret: No
```

### 3. View Variables

All environment variables are displayed in a table showing:
- Project name
- Branch
- Variable key
- Value (masked if secret)
- Type (Public/Secret)
- Actions (Edit/Delete)

### 4. Delete Variables

Click the 🗑️ icon next to any variable to delete it. You'll be asked to confirm the deletion.

## Managing Variables via API

### Get Variables for a Project and Branch

```bash
curl -X GET "https://your-signal-server.com/api/env/my-project/production" \
  -H "Cookie: connect.sid=your-session-cookie"
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "env_123456",
      "project_name": "my-project",
      "branch": "production",
      "key": "NODE_ENV",
      "value": "production",
      "is_secret": 0,
      "description": "Application environment mode",
      "created_at": "2025-12-27T10:00:00.000Z",
      "updated_at": "2025-12-27T10:00:00.000Z"
    }
  ]
}
```

### Add or Update a Variable

```bash
curl -X POST "https://your-signal-server.com/api/env" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "my-project",
    "branch": "production",
    "key": "NODE_ENV",
    "value": "production",
    "isSecret": false,
    "description": "Application environment mode"
  }'
```

### Delete a Variable

```bash
curl -X DELETE "https://your-signal-server.com/api/env/env_123456" \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Bulk Save Variables

```bash
curl -X POST "https://your-signal-server.com/api/env/bulk" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "my-project",
    "branch": "production",
    "variables": [
      {
        "key": "NODE_ENV",
        "value": "production",
        "isSecret": false
      },
      {
        "key": "DATABASE_URL",
        "value": "postgresql://...",
        "isSecret": true
      },
      {
        "key": "API_KEY",
        "value": "sk_live_...",
        "isSecret": true
      }
    ]
  }'
```

## How It Works

### 1. Storage

Environment variables are stored in SQLite database with this schema:

```sql
CREATE TABLE environment_variables (
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
);
```

### 2. Deployment Injection

When a container is deployed:

1. System fetches all environment variables for that project and branch
2. Creates a temporary `.env` file with all variables
3. Passes the `.env` file to Docker using `--env-file` flag
4. Cleans up the temporary file after container starts

Additionally, these deployment-specific variables are automatically added:
- `DEPLOY_BRANCH`: The Git branch being deployed
- `DEPLOY_COMMIT`: The Git commit hash
- `DEPLOY_DOMAIN`: The domain assigned to this deployment

### 3. Priority

Variables are merged in this order (later sources override earlier ones):

1. Project's `.env` file (if exists in repository)
2. Database environment variables (highest priority)
3. Deployment-specific variables (always added)

## Best Practices

### Security

✅ **DO:**
- Mark sensitive values (API keys, passwords, tokens) as secrets
- Use different values for different branches
- Rotate secrets regularly
- Use strong, unique passwords

❌ **DON'T:**
- Commit `.env` files to Git (add to `.gitignore`)
- Share secret values in plain text
- Use production credentials in dev/staging
- Hardcode secrets in your application code

### Naming Conventions

Use descriptive, UPPERCASE names with underscores:

```
✅ Good:
NODE_ENV
DATABASE_URL
API_KEY
STRIPE_SECRET_KEY
AWS_ACCESS_KEY_ID
MAX_CONNECTIONS

❌ Bad:
nodeEnv
db
key
secret
x
temp
```

### Organization

Group related variables:

```
# Database
DATABASE_URL
DATABASE_POOL_SIZE
DATABASE_TIMEOUT

# External Services
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SENDGRID_API_KEY

# Application
NODE_ENV
PORT
LOG_LEVEL
```

### Branch-Specific Configuration

Use different values per branch:

| Variable | Production | Dev |
|----------|-----------|-----|
| NODE_ENV | production | development |
| DATABASE_URL | prod-db.com | dev-db.com |
| API_KEY | live_key | test_key |
| DEBUG | false | true |

## Common Use Cases

### 1. Database Configuration

```
DATABASE_URL=postgresql://user:pass@host:5432/db
DATABASE_POOL_SIZE=10
DATABASE_SSL_MODE=require
```

### 2. API Keys and Secrets

```
STRIPE_SECRET_KEY=sk_live_abc123
STRIPE_WEBHOOK_SECRET=whsec_xyz789
SENDGRID_API_KEY=SG.abc123
```

### 3. Application Settings

```
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
MAX_UPLOAD_SIZE=10485760
CORS_ORIGIN=https://example.com
```

### 4. Feature Flags

```
FEATURE_NEW_UI=true
FEATURE_BETA_ACCESS=false
MAINTENANCE_MODE=false
```

## Troubleshooting

### Variables Not Available in Container

**Problem**: Your app can't access environment variables

**Solutions**:
1. Check variable is configured for correct project and branch
2. Verify variable name matches exactly (case-sensitive)
3. Check deployment logs for environment file creation
4. Ensure your app reads from `process.env` (Node.js) or `os.getenv()` (Python)

### Container Fails to Start After Adding Variables

**Problem**: Container crashes immediately after deployment

**Solutions**:
1. Check for syntax errors in variable values (quotes, special characters)
2. Verify required variables are set
3. Check container logs: `docker logs <container-name>`
4. Test values locally with `.env` file first

### Secret Values Exposed in Logs

**Problem**: Sensitive data appears in deployment logs

**Solutions**:
1. Mark variables as secrets in the UI
2. Don't log environment variables in your application code
3. Use structured logging with redaction for sensitive fields

## Migration from .env Files

If you currently use `.env` files in your repository:

1. **Extract variables**: Copy all variables from your `.env` file
2. **Add to dashboard**: Add each variable via the Environment section
3. **Update .gitignore**: Ensure `.env` is in `.gitignore`
4. **Remove from repo**: Delete `.env` from Git (but keep locally for testing)
5. **Deploy**: Next deployment will use database variables

Example migration:

```bash
# Old way (in repository)
.env file:
NODE_ENV=production
DATABASE_URL=postgresql://...
API_KEY=sk_live_...

# New way (in Vellaric-Signal dashboard)
1. Add NODE_ENV via UI
2. Add DATABASE_URL via UI (mark as secret)
3. Add API_KEY via UI (mark as secret)
4. Remove .env from repository
```

## API Reference

All endpoints require authentication (session cookie).

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/env/:projectName/:branch` | Get variables for specific project/branch |
| GET | `/api/env/:projectName` | Get all variables for a project |
| POST | `/api/env` | Create or update a variable |
| POST | `/api/env/bulk` | Bulk create/update variables |
| DELETE | `/api/env/:id` | Delete a variable |

### Key Validation

Variable keys must match this pattern: `^[A-Z_][A-Z0-9_]*$`

Valid examples:
- `NODE_ENV`
- `DATABASE_URL`
- `API_KEY_V2`
- `_PRIVATE_VAR`

Invalid examples:
- `node-env` (lowercase, dash)
- `123_VAR` (starts with number)
- `MY.VAR` (contains dot)

## Support

For issues or questions:
1. Check deployment logs in the dashboard
2. Review container logs: `docker logs <container-name>`
3. Verify variables are configured correctly
4. Test locally with a `.env` file first

---

**Next Steps:**
- Configure your first environment variables
- Deploy your application and verify it receives the variables
- Set up different configurations for each branch
- Migrate from `.env` files to database-backed configuration
