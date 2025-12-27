# Project Setup Guide - Complete Workflow

This guide walks you through the complete workflow from adding a project to deploying it with Vellaric-Signal.

## 🎯 Workflow Overview

```
1. Add Project       →  Connect your GitLab repository
2. Configure Env     →  Set environment variables  
3. Deploy            →  Manual or automatic deployment
4. Update & Redeploy →  When env vars change
```

## Step 1: Add Your Project

Before you can deploy anything, you need to add your project to Vellaric-Signal.

### Option A: Manual Project Addition

1. **Navigate to Projects**
   - Open your Vellaric-Signal dashboard
   - Click **"Projects"** in the sidebar

2. **Click "+ Add Project"**

3. **Fill in Project Details:**
   - **Project Name**: Unique identifier (e.g., `my-awesome-app`)
     - Use alphanumeric characters, hyphens, and underscores only
     - This will be used for container names and domains
   
   - **Repository URL**: Your GitLab repository
     ```
     https://gitlab.com/username/repository.git
     ```
   
   - **Default Branch**: Branch to deploy by default
     - Options: `production`, `master`, or `dev`
   
   - **Enabled Branches**: Comma-separated list of branches that can be deployed
     ```
     production,master,dev
     ```
   
   - **Description** _(optional)_: Brief description of your project
   
   - **Auto Deploy**: ☑️ Check to enable automatic deployment on Git push

4. **Click "Add Project"**

### Option B: Import from GitLab

1. **Click "Import from GitLab"** button

2. **Select Projects** from your GitLab account
   - Requires `GITLAB_ACCESS_TOKEN` configured in `.env`
   - Shows all projects you have access to

3. **Click "Import"** on the project you want

### Example Project Configuration

```
Project Name: my-node-app
Repository: https://gitlab.com/mycompany/my-node-app.git
Default Branch: production
Enabled Branches: production,master,dev
Auto Deploy: ✓ Enabled
Description: Customer-facing API service
```

## Step 2: Configure Environment Variables

After adding your project, configure environment variables **before** the first deployment.

### Add Environment Variables

1. **From Projects View:**
   - Click the ⚙️ icon next to your project
   - OR navigate to **Configuration → Environment**

2. **Click "+ Add Variable"**

3. **Configure Variable:**
   - **Project**: Select your project
   - **Branch**: Choose the branch (production/master/dev)
   - **Key**: Variable name in UPPERCASE (e.g., `NODE_ENV`)
   - **Value**: The actual value
   - **Description** _(optional)_: What this variable does
   - **🔒 Secret**: Check to mask sensitive values (API keys, passwords)
   - **🚀 Redeploy**: Check to automatically redeploy after saving

4. **Click "Add Variable"**

### Recommended Environment Variables

#### For Node.js Applications:

```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

#### For Applications with Databases:

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname  # Mark as secret
DATABASE_POOL_SIZE=10
```

#### For External API Services:

```env
STRIPE_SECRET_KEY=sk_live_...  # Mark as secret
SENDGRID_API_KEY=SG....        # Mark as secret
API_BASE_URL=https://api.example.com
```

### Branch-Specific Configuration

Set different values for different branches:

| Variable | Production | Dev |
|----------|-----------|-----|
| NODE_ENV | `production` | `development` |
| DATABASE_URL | Production DB | Dev DB |
| API_KEY | Live key | Test key |
| DEBUG | `false` | `true` |

## Step 3: Deploy Your Application

### Prerequisites

Your project repository must have:

1. **Dockerfile** - Defines how to build your container
   ```dockerfile
   FROM node:18-alpine
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --only=production
   COPY . .
   EXPOSE 3000
   CMD ["node", "server.js"]
   ```

2. **Application Code** - Your app should read from environment variables
   ```javascript
   const PORT = process.env.PORT || 3000;
   const NODE_ENV = process.env.NODE_ENV || 'development';
   const DATABASE_URL = process.env.DATABASE_URL;
   ```

3. **GitLab Token** _(if private repo)_ - Set `GITLAB_ACCESS_TOKEN` in Signal's `.env`

### Option A: Manual Deployment

1. **Go to Projects** view
2. **Click 🚀 Deploy** button next to your project
3. **Select Branch** to deploy
4. **Click "Deploy Now"**

The deployment will:
- Clone/pull your repository
- Inject environment variables from database
- Build Docker image
- Start container
- Configure nginx reverse proxy
- Set up SSL certificate (if DNS is configured)

### Option B: Automatic Deployment (Webhook)

If you enabled "Auto Deploy" when adding the project:

1. **Configure GitLab Webhook** (one-time setup):
   
   In your GitLab project:
   - Go to **Settings → Webhooks**
   - **URL**: `https://your-signal-server.com/webhook/gitlab`
   - **Secret Token**: Value from Signal's `.env` `WEBHOOK_SECRET`
   - **Trigger**: ☑️ Push events
   - **SSL verification**: ☑️ Enable
   - Click **Add webhook**

2. **Push Code** to enabled branch:
   ```bash
   git add .
   git commit -m "Deploy to production"
   git push origin production
   ```

3. **Deployment Starts Automatically**
   - GitLab sends webhook to Signal
   - Signal verifies project exists and auto-deploy is enabled
   - Signal checks branch is in enabled list
   - Deployment queued and processed

### Monitor Deployment

1. **View Queue**: Navigate to **Queue** in sidebar
   - See pending deployments
   - Shows: Project, Branch, Status

2. **View Logs**: Click 📄 icon on any deployment
   - Real-time streaming logs
   - See build progress, errors, success messages

3. **View Active**: Navigate to **Active** in sidebar
   - See running containers
   - Domain, port, uptime information

## Step 4: Update Environment Variables

When you need to change environment variables:

### Update Existing Variable

1. Navigate to **Configuration → Environment**
2. Find the variable you want to change
3. Click 🗑️ to delete old value
4. Click "+ Add Variable" to add new value
5. **☑️ Check "Redeploy after saving"** to apply changes immediately
6. Click "Add Variable"

### Redeploy Trigger

When you check "🚀 Redeploy after saving":
- Variable is saved to database
- Deployment is automatically queued
- Container will restart with new environment variables
- Zero downtime: old container runs until new one is healthy

### Without Redeploy

If you don't check the redeploy option:
- Variable is saved but not applied
- You must manually trigger deployment later
- Useful when updating multiple variables at once

## Step 5: View Your Deployed Application

### Access Your App

After successful deployment:

1. **Domain**: `project-name-branch.yourdomain.com`
   - Example: `my-node-app-production.example.com`
   - Dev branch: `my-node-app-dev.example.com`

2. **Check Active Deployments**:
   - Navigate to **Active** in sidebar
   - Click domain link to open your app

### SSL Certificate

SSL is automatically configured if:
- DNS is properly configured (A record pointing to your server)
- Cloudflare API is set up (optional)
- Let's Encrypt can verify domain ownership

If SSL setup fails:
- App is still accessible via HTTP
- Manually run: `sudo certbot --nginx -d yourdomain.com`

## Complete Example Workflow

Let's walk through deploying a Node.js API:

### 1. Add Project

```
Name: customer-api
Repo: https://gitlab.com/mycompany/customer-api.git
Default Branch: production
Enabled: production,master,dev
Auto Deploy: ✓
```

### 2. Add Environment Variables (Production)

```env
NODE_ENV=production          (Public)
PORT=3000                    (Public)
DATABASE_URL=postgresql://...  (Secret)
JWT_SECRET=random-string-here  (Secret)
STRIPE_KEY=sk_live_...        (Secret)
```

### 3. Add Environment Variables (Dev)

```env
NODE_ENV=development         (Public)
PORT=3000                    (Public)
DATABASE_URL=postgresql://dev...  (Secret)
JWT_SECRET=dev-secret            (Secret)
STRIPE_KEY=sk_test_...          (Secret)
```

### 4. Configure GitLab Webhook

```
URL: https://signal.mycompany.com/webhook/gitlab
Secret: [from Signal's .env]
Triggers: Push events
Branches: production, master, dev
```

### 5. Deploy

Push to production branch:
```bash
git checkout production
git merge develop
git push origin production
```

### 6. Monitor

- Navigate to **Queue** → see deployment queued
- Watch logs in real-time
- Once complete, appears in **Active**
- Access at: `customer-api-production.mycompany.com`

### 7. Update Configuration Later

Need to update database password?
1. Go to **Environment** view
2. Find `DATABASE_URL` for production
3. Delete old value
4. Add new value with ☑️ Redeploy checked
5. Deployment automatically triggered
6. New container starts with updated credentials

## Troubleshooting

### Project Not Found Error

**Problem**: Webhook returns "Project not found"

**Solution**:
- Project must be added to Signal dashboard first
- Go to **Projects** → "+ Add Project"
- Add your repository before pushing code

### Auto-Deploy Not Working

**Problem**: Push to Git doesn't trigger deployment

**Check**:
1. ☑️ Auto Deploy enabled in project settings?
2. Is branch in the enabled branches list?
3. Is webhook configured correctly in GitLab?
4. Check Signal server logs for webhook errors

### Environment Variables Not Applied

**Problem**: App can't access environment variables

**Solutions**:
1. Ensure variables are added for correct project + branch
2. Check that container was redeployed after adding variables
3. Verify app code reads from `process.env.VARIABLE_NAME`
4. Check deployment logs for env file creation

### Branch Not Deploying

**Problem**: "Branch not enabled for deployment"

**Solution**:
1. Go to **Projects**
2. Edit project (coming soon) or delete and recreate
3. Add branch to "Enabled Branches" field
4. Try deploying again

## Best Practices

### 1. Set Up Projects First
- ✅ Add all projects before deploying
- ✅ Configure environment variables before first deployment
- ✅ Test with dev branch first

### 2. Use Proper Branching
```
production  → Production environment (stable releases)
master      → Pre-production (testing)
dev         → Development (active development)
```

### 3. Secure Your Secrets
- ✅ Mark API keys, passwords, tokens as secrets
- ✅ Use different values for different branches
- ✅ Never commit secrets to Git
- ✅ Rotate secrets regularly

### 4. Monitor Deployments
- ✅ Watch logs during deployment
- ✅ Verify container is running in **Active** view
- ✅ Test your app after deployment
- ✅ Check for errors in container logs

### 5. Update Variables Safely
- ✅ Test changes in dev branch first
- ✅ Use redeploy option for immediate changes
- ✅ Batch multiple updates together
- ✅ Document what each variable does

## Quick Reference

### Dashboard Navigation

```
📦 Projects        → Manage projects and repositories
⚙️ Environment     → Configure environment variables
🚀 Queue           → View pending deployments
⚡ Active          → View running containers
📅 History         → View deployment history
🐳 Containers      → Monitor Docker containers
💾 Databases       → Manage PostgreSQL databases
☁️ Backups         → Database backup management
```

### API Endpoints

```
POST   /api/projects                    Create project
GET    /api/projects                    List projects
POST   /api/projects/:id/deploy         Trigger deployment
GET    /api/env/:projectId/:branch      Get env vars
POST   /api/env                         Add env var
DELETE /api/env/:id                     Delete env var
POST   /webhook/gitlab                  GitLab webhook
```

### Environment Variables File Structure

Your Signal server uses environment variables from multiple sources (in order of priority):

1. **Database** (highest priority) - Project-specific variables
2. **Signal's .env file** - Server configuration
3. **System environment** - OS-level variables

---

**Questions or Issues?**
- Check deployment logs in the dashboard
- Review container logs: `docker logs <container-name>`
- Verify project and environment configuration
- Ensure GitLab webhook is configured correctly
