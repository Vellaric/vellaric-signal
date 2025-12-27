# Migration Guide - Upgrading to Project Management

This guide helps you migrate from the old webhook-only deployment system to the new project management system.

## What Changed?

### Before (Old System)
- ❌ Push code → webhook → deploy automatically
- ❌ No project configuration
- ❌ Limited control over deployments
- ❌ Environment variables in repository `.env` files

### After (New System)
- ✅ **Add project first** → configure → deploy
- ✅ **Project management** with settings
- ✅ **Environment variables** in database
- ✅ **Manual deployment** triggers
- ✅ **Automatic redeployment** when env vars change
- ✅ **Import from GitLab** integration

## Migration Steps

### Step 1: Backup Current Database

```bash
cd /var/www/vellaric-signal
cp deployments.db deployments.db.backup
```

### Step 2: Update Code

```bash
git pull origin main
npm install
```

### Step 3: Restart Server

```bash
pm2 restart vellaric-signal
# OR
npm start
```

The new database schema will be created automatically on startup.

### Step 4: Add Your Existing Projects

For each application you previously deployed:

1. **Login to Dashboard**
   - Navigate to `https://your-signal-server.com`

2. **Go to Projects** section

3. **Click "+ Add Project"**

4. **Fill in details:**
   ```
   Project Name: [your-app-name]
   Repository: [your-gitlab-repo-url]
   Default Branch: production (or master/dev)
   Enabled Branches: production,master,dev
   Auto Deploy: ✓ (check this)
   ```

5. **Click "Add Project"**

6. **Repeat for all your applications**

### Step 5: Migrate Environment Variables

For each project:

1. **Extract variables from `.env` file in your repository**
   ```bash
   cat /path/to/your/project/.env
   ```

2. **Go to Configuration → Environment** in dashboard

3. **For each variable, click "+ Add Variable":**
   ```
   Project: [select your project]
   Branch: production (or master/dev)
   Key: NODE_ENV
   Value: production
   Secret: ☐ (check for passwords, API keys)
   ```

4. **Important**: Add variables for **each branch** you use
   - production branch → production values
   - dev branch → development values

### Step 6: Remove `.env` from Repository

After migrating to database:

```bash
# In your project repository
git rm .env
git commit -m "Remove .env - using Vellaric-Signal env management"
git push
```

**Keep `.env.example`** for documentation:
```bash
# .env.example
NODE_ENV=production
DATABASE_URL=postgresql://...
API_KEY=your-api-key-here
```

### Step 7: Update GitLab Webhooks (Optional)

If you want to ensure webhooks work:

1. **In GitLab project** → Settings → Webhooks
2. **Verify webhook URL**: `https://your-signal-server.com/webhook/gitlab`
3. **Test webhook** by clicking "Test" button
4. **Push code** to trigger automatic deployment

## Verification

### Test Manual Deployment

1. Go to **Projects** view
2. Click 🚀 **Deploy** next to your project
3. Select branch → Click "Deploy Now"
4. Monitor in **Queue** and **Active** views

### Test Automatic Deployment

1. Make a small change in your code
2. Commit and push to enabled branch:
   ```bash
   git commit -m "Test auto deployment"
   git push origin production
   ```
3. Watch deployment in dashboard

### Test Environment Variables

1. SSH into your server
2. Check container logs:
   ```bash
   docker logs [container-name]
   ```
3. Verify your app has access to environment variables

## Common Issues

### Issue: "Project not found" on webhook

**Solution**: You must add the project in the dashboard first.
- Go to **Projects** → **+ Add Project**
- Add your repository
- Try webhook again

### Issue: Environment variables not working

**Solutions**:
1. Verify variables are added for correct project + branch
2. Trigger redeployment (variables only apply to new containers)
3. Check deployment logs for environment file creation
4. Verify your app code reads from `process.env`

### Issue: Auto-deploy not working

**Check**:
1. ☑️ "Auto Deploy" enabled in project settings?
2. Is the pushed branch in "Enabled Branches" list?
3. Is GitLab webhook configured correctly?
4. Check Signal server logs: `pm2 logs vellaric-signal`

### Issue: Old deployments still running

**Cleanup**:
```bash
# List all containers
docker ps -a

# Stop old containers
docker stop [container-name]
docker rm [container-name]

# Clean up old images
docker image prune -a
```

## Rollback (If Needed)

If you encounter issues:

1. **Restore old database:**
   ```bash
   cd /var/www/vellaric-signal
   cp deployments.db.backup deployments.db
   ```

2. **Checkout previous version:**
   ```bash
   git checkout [previous-commit]
   npm install
   pm2 restart vellaric-signal
   ```

3. **Report issue** on GitHub

## New Features to Try

### 1. Import from GitLab
- Click "Import from GitLab" button
- Select multiple projects at once
- Automatic configuration

### 2. Environment Variables Management
- Centralized configuration
- Secret masking
- Per-branch variables
- Redeploy on change

### 3. Manual Deployments
- Deploy any branch on demand
- No need to push code
- Test before production

### 4. Project Settings
- Enable/disable auto-deploy
- Configure allowed branches
- Project descriptions

## Need Help?

- Check [PROJECT_SETUP_GUIDE.md](./PROJECT_SETUP_GUIDE.md) for complete workflow
- Check [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) for env var management
- Review deployment logs in dashboard
- Check container logs: `docker logs <container-name>`

## Benefits of New System

✅ **Better Control**: Manual deployments, environment management  
✅ **More Secure**: Secrets in database, not in Git  
✅ **Easier Setup**: Import from GitLab, guided workflow  
✅ **Better Monitoring**: Real-time updates, comprehensive logs  
✅ **Flexibility**: Per-branch configuration, redeploy on demand  

---

**Migration Complete!** 🎉

Your deployment system is now upgraded with full project management capabilities.
