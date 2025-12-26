# Vellaric-Signal Deployment Guide

## Overview

Vellaric-Signal automatically deploys your GitLab projects to Docker containers with HTTPS when you push code.

## Features

✅ **Docker Deployment** - Builds and runs your app in containers  
✅ **HTTPS Automatic** - Let's Encrypt SSL certificates  
✅ **Multi-Branch** - Deploy main/master/dev branches  
✅ **Subdomains** - Each deployment gets its own subdomain  
✅ **Zero Downtime** - Containers restart with new code  

## Quick Setup

### 1. Prepare Your VPS

```bash
# Run on Ubuntu VPS as root
curl -fsSL https://raw.githubusercontent.com/yourusername/vellaric-signal/main/setup-vps.sh | sudo bash
```

### 2. Configure Domain

**For Cloudflare users (recommended):**

Add DNS wildcard record in Cloudflare:
```
Type: A
Name: *
Content: YOUR_VPS_IP
Proxy: DNS only (gray cloud, not orange!)
```

**Or use Cloudflare API for automatic DNS:**
1. Create API token: https://dash.cloudflare.com/profile/api-tokens
2. Permissions: Zone → DNS → Edit
3. Add token to `.env`:
   ```env
   CLOUDFLARE_API_TOKEN=your_token
   BASE_DOMAIN=vellaric.com
   ```

See [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for detailed Cloudflare instructions.

### 3. Edit Configuration

```bash
sudo nano /opt/vellaric-signal/.env
```

Set these values:
```env
GITLAB_WEBHOOK_SECRET=<generate-random-64-char-token>
BASE_DOMAIN=vellaric.com
SSL_EMAIL=admin@vellaric.com

# Optional: For automatic DNS via Cloudflare API
CLOUDFLARE_API_TOKEN=your_cloudflare_token
```

### 4. Start Service

```bash
sudo systemctl start vellaric-signal
sudo systemctl enable vellaric-signal
sudo systemctl status vellaric-signal
```

### 5. Configure GitLab

In your GitLab project:

1. Go to **Settings → Webhooks**
2. URL: `http://YOUR_VPS_IP:3000/webhook/gitlab`
3. Secret Token: (same as GITLAB_WEBHOOK_SECRET)
4. Trigger: **Push events**
5. Branches: `main`, `master`, or `dev`
6. Click **Add webhook**

### 6. Add Dockerfile to Your Project

Create `Dockerfile` in your repository root:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000

# Health check is important!
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["npm", "start"]
```

### 7. Push Code

```bash
git add .
git commit -m "Deploy with Vellaric-Signal"
git push origin main
```

### 8. Access Your App

After ~2-5 minutes:
- **Main/Master**: `https://project-name.yourdomain.com`
- **Dev branch**: `https://project-name-dev.yourdomain.com`

## Project Requirements

Your GitLab repository must have:

1. ✅ `Dockerfile` in root directory
2. ✅ `package.json` with `npm start` script
3. ✅ Health check endpoint (recommended): `GET /health` → returns 200 OK
4. ✅ App listens on port 3000 (or set `APP_PORT` in .env)

## Deployment Process

```
Push to GitLab
    ↓
Webhook triggers
    ↓
Clone/Pull code
    ↓
Build Docker image
    ↓
Start container
    ↓
Configure nginx
    ↓
Setup SSL
    ↓
App live at https://subdomain.domain.com
```

## API Management

### View Active Deployments
```bash
curl http://YOUR_VPS_IP:3000/api/deployments/active
```

### Remove Deployment
```bash
curl -X DELETE http://YOUR_VPS_IP:3000/api/deployments/project-name/main
```

### Cleanup Old Images
```bash
curl -X POST http://YOUR_VPS_IP:3000/api/cleanup
```

### View Logs
```bash
# Webhook server logs
sudo journalctl -u vellaric-signal -f

# Container logs
docker logs project-name-main -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

## Common Issues

### ❌ Deployment Failed

**Check Dockerfile exists:**
```bash
ls -la Dockerfile
```

**Check webhook logs:**
```bash
sudo journalctl -u vellaric-signal -n 50
```

### ❌ SSL Certificate Failed

**Check DNS propagation:**
```bash
dig project-name.yourdomain.com
```

**Manually obtain certificate:**
```bash
sudo certbot --nginx -d project-name.yourdomain.com
```

### ❌ Container Won't Start

**Check container logs:**
```bash
docker ps -a  # Find container
docker logs <container-name>
```

**Check if port 3000 is exposed in Dockerfile:**
```dockerfile
EXPOSE 3000
```

## Branch Behavior

| Branch | Subdomain | Purpose |
|--------|-----------|---------|
| main | project-name.yourdomain.com | Production |
| master | project-name.yourdomain.com | Production |
| dev | project-name-dev.yourdomain.com | Development |
| other | Ignored | Not deployed |

## Security Notes

- ✅ Webhook secret token should be 64+ characters
- ✅ Use HTTPS for production (automatic with Let's Encrypt)
- ✅ Configure firewall to allow ports 80, 443, 3000
- ✅ Keep server packages updated
- ✅ Monitor disk space (Docker images accumulate)

## Maintenance

### Update Vellaric-Signal
```bash
cd /opt/vellaric-signal
sudo git pull
sudo npm install
sudo systemctl restart vellaric-signal
```

### Clean Docker Images
```bash
docker system prune -a
```

### Renew SSL Certificates (automatic)
```bash
sudo certbot renew
```

### Backup Database
```bash
sudo cp /opt/vellaric-signal/deployments.db /backup/
```

## Support

For issues, check:
1. Server logs: `journalctl -u vellaric-signal -f`
2. Docker logs: `docker logs <container>`
3. Nginx logs: `/var/log/nginx/error.log`
4. DNS: `dig yourdomain.com`

## Cost Estimate

**VPS Requirements:**
- 2GB RAM minimum
- 20GB+ disk space
- Ubuntu 20.04+

**Recommended providers:**
- DigitalOcean: $12/month
- Vultr: $10/month
- Linode: $10/month
- Hetzner: €5/month

SSL certificates are **free** with Let's Encrypt! 🎉
