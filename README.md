<div align="center">
  <img src="public/Vellaric-signal.png" alt="Vellaric-Signal" width="600">
</div>

# Vellaric-Signal

GitLab webhook server for automated Docker deployments with HTTPS - similar to Digital Ocean App Platform.

## Features

- 🔐 Secure GitLab webhook signature verification
- 🚀 Automatic deployment on push to main/master/dev branches
- 🐳 Docker image build and container orchestration
- 🌐 Automatic subdomain creation with nginx reverse proxy
- 🔒 Automatic HTTPS setup with Let's Encrypt
- 🔄 Deployment queue with configurable concurrency
- 📊 SQLite database for deployment history
- 📝 Comprehensive logging
- 🏥 Health check endpoint

## Architecture

```
GitLab Push → Webhook → Pull Code → Build Docker → Start Container → Configure Nginx → Setup SSL
                                                                          ↓
                                                      subdomain.yourdomain.com (HTTPS)
```

## Requirements

- Ubuntu VPS (20.04 or later)
- Node.js 18+
- Docker & Docker Compose
- nginx
- certbot (Let's Encrypt)
- Root/sudo access

## VPS Setup (Ubuntu)

### Automated Setup

Run the setup script on your Ubuntu VPS:

```bash
# Download and run setup script
curl -fsSL https://raw.githubusercontent.com/yourusername/vellaric-signal/main/setup-vps.sh | sudo bash

# Or if you have the repository:
sudo bash setup-vps.sh
```

This script installs:
- Node.js 18
- Docker & Docker Compose
- nginx
- certbot
- Git
- Creates system user and directories
- Sets up systemd service

### Manual Setup

1. **Install Dependencies**

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt-get install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com | sudo bash
sudo systemctl start docker
sudo systemctl enable docker

# Install nginx
sudo apt-get install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Install certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Install Git
sudo apt-get install -y git
```

2. **Clone Repository**

```bash
sudo mkdir -p /opt/vellaric-signal
sudo git clone <your-repo-url> /opt/vellaric-signal
cd /opt/vellaric-signal
sudo npm install --production
```

3. **Configure Environment**

```bash
sudo cp .env.example .env
sudo nano .env
```

Edit `.env`:
```env
PORT=3000
GITLAB_WEBHOOK_SECRET=your_generated_secret
DEPLOY_BASE_PATH=/var/www/apps
BASE_DOMAIN=yourdomain.com
SSL_EMAIL=admin@yourdomain.com
APP_PORT=3000
MAX_CONCURRENT_DEPLOYS=3
```

4. **Setup Systemd Service**

```bash
sudo nano /etc/systemd/system/vellaric-signal.service
```

Add:
```ini
[Unit]
Description=Vellaric-Signal GitLab Webhook Server
After=network.target docker.service nginx.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vellaric-signal
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable vellaric-signal
sudo systemctl start vellaric-signal
sudo systemctl status vellaric-signal
```

5. **Configure Firewall**

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw enable
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
GITLAB_WEBHOOK_SECRET=your_secret_token_here
DEPLOY_BASE_PATH=/var/www/apps
BASE_DOMAIN=yourdomain.com
SSL_EMAIL=admin@yourdomain.com
APP_PORT=3000
MAX_CONCURRENT_DEPLOYS=3
```

### 3. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

## GitLab Webhook Setup

1. Go to your GitLab project → **Settings** → **Webhooks**
2. Add webhook URL: `http://your-vps-ip:3000/webhook/gitlab`
3. Set Secret Token (must match `GITLAB_WEBHOOK_SECRET` in `.env`)
4. Select trigger: **Push events**
5. Select branches: `main`, `master`, or `dev`
6. Click **Add webhook**
7. Test the webhook

## DNS Configuration

### Option 1: Wildcard DNS (Recommended for Cloudflare)

For Cloudflare users with `vellaric.com`:

1. Login to Cloudflare Dashboard
2. Go to **DNS** → **Records** → **Add record**
3. Configure:
   ```
   Type: A
   Name: *
   Content: YOUR_VPS_IP
   Proxy status: DNS only (gray cloud ☁️, NOT orange 🟠)
   TTL: Auto
   ```
4. Save

This automatically handles ALL subdomains:
- `app-dev.vellaric.com` ✅
- `another-app.vellaric.com` ✅
- `anything.vellaric.com` ✅

### Option 2: Cloudflare API (Automatic Per-Deployment)

For automatic DNS record creation:

1. Create Cloudflare API token (see [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md))
2. Add to `.env`:
   ```env
   CLOUDFLARE_API_TOKEN=your_token_here
   BASE_DOMAIN=vellaric.com
   ```
3. Restart service

Each deployment automatically creates its DNS record!

**See [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for detailed instructions.**

## Application Requirements

Your GitLab repository must include a `Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
CMD ["npm", "start"]
```

See `Dockerfile.example` for a complete template.

## API Endpoints

### Webhook Handler
```
POST /webhook/gitlab
```
Receives GitLab push events and triggers deployments.

### Health Check
```
GET /webhook/health
```
Returns server health status.

### Deployment History
```
GET /api/deployments?project=myapp&limit=50
```
Returns recent deployment history.

### Queue Status
```
GET /api/queue
```
Returns current deployment queue status.

## How It Works

1. **Webhook Received**: GitLab sends push event to `/webhook/gitlab`
2. **Signature Verification**: Server validates webhook signature
3. **Branch Filter**: Only deploys from `main`, `master`, or `dev` branches
4. **Queue Deployment**: Adds deployment to queue
5. **Execute Deployment**:
   - Clone repo (first time) or pull latest changes
   - Build Docker image from Dockerfile
   - Stop old container (if exists)
   - Start new container on available port
   - Generate nginx configuration for subdomain
   - Obtain/renew SSL certificate with Let's Encrypt
   - Reload nginx to apply changes
6. **Access Application**: Visit `https://project-name.yourdomain.com` (or `project-name-dev.yourdomain.com` for dev branch)
7. **Log Results**: Store deployment status in SQLite database

## Deployment Flow

```
GitLab Push → Webhook → Verify → Queue → Pull Code
                                    ↓
                         Build Docker Image → Start Container
                                    ↓
                         Configure Nginx → Setup SSL → HTTPS Live
```

## Subdomain Naming

- **main/master branch**: `project-name.yourdomain.com`
- **dev branch**: `project-name-dev.yourdomain.com`

## Directory Structure

```
vellaric-signal/
├── src/
│   ├── server.js              # Main Express server
│   ├── routes/
│   │   └── webhook.js         # Webhook route handler
│   ├── services/
│   │   ├── deploymentQueue.js # Deployment queue manager
│   │   └── database.js        # SQLite database service
│   └── utils/
│       ├── logger.js          # Logging utility
│       └── security.js        # Webhook verification
├── package.json
├── .env.example
└── README.md
```

## Docker Management

View running containers:
```bash
docker ps
```

View container logs:
```bash
docker logs <container-name>
docker logs -f <container-name>  # Follow logs
```

Restart container:
```bash
docker restart <container-name>
```

Stop container:
```bash
docker stop <container-name>
```

Remove container:
```bash
docker rm <container-name>
```

View images:
```bash
docker images
```

Clean up unused images:
```bash
docker image prune -a
```

## Nginx Management

Test configuration:
```bash
sudo nginx -t
```

Reload nginx:
```bash
sudo systemctl reload nginx
```

View nginx logs:
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

List site configurations:
```bash
ls -la /etc/nginx/sites-enabled/
```

## SSL Certificate Management

List certificates:
```bash
sudo certbot certificates
```

Renew all certificates:
```bash
sudo certbot renew
```

Renew specific certificate:
```bash
sudo certbot renew --cert-name yourdomain.com
```

Auto-renewal (already setup):
```bash
sudo systemctl status certbot.timer
```

## Security Considerations

- Always use HTTPS in production (automatic with Let's Encrypt)
- Keep `GITLAB_WEBHOOK_SECRET` secure and random (64+ characters)
- Configure firewall (ufw) to restrict access
- Run webhook server as dedicated user (not root in production)
- Use SSH keys for private GitLab repositories
- Regularly update system packages and Docker images
- Monitor disk space (Docker images can accumulate)
- Set up log rotation for nginx and application logs
- Use Docker security best practices (non-root user in containers)

## Requirements

- Ubuntu VPS (20.04+)
- Node.js 14+
- Docker and Docker Compose
- nginx
- certbot
- Git
- Root/sudo access for initial setup
- Domain with DNS access (for wildcard subdomain)
- Minimum 2GB RAM, 20GB disk space

## Troubleshooting

### Deployment Fails

Check webhook server logs:
```bash
sudo journalctl -u vellaric-signal -f
```

Check Docker logs:
```bash
docker logs <container-name>
```

Check nginx logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

### SSL Certificate Issues

**Common Issue: Wrong certificate error (ERR_CERT_COMMON_NAME_INVALID)**

If you see "its security certificate is from signal.vellaric.com" instead of your domain, this means SSL wasn't configured during deployment. 

**Quick Fix:**
```bash
# On your VPS
node scripts/fix-ssl.js your-domain.com
```

Or manually:
```bash
sudo certbot --nginx -d your-domain.com
```

**For detailed SSL troubleshooting, see:** [SSL_TROUBLESHOOTING.md](SSL_TROUBLESHOOTING.md)

Check certificate status:
```bash
sudo certbot certificates
```

### Port Already in Use

Find process using port:
```bash
sudo lsof -i :3000
```

Kill process:
```bash
sudo kill -9 <PID>
```

### Container Won't Start

Check if Dockerfile has health check
```bash
docker inspect <container-name>
```

Check container status:
```bash
docker ps -a
docker logs <container-name>
```

### Git Authentication Issues

For private repositories, add deploy key:
1. Generate SSH key on VPS:
```bash
ssh-keygen -t ed25519 -C "deploy@yourdomain.com"
```

2. Add public key to GitLab:
   - Project → Settings → Repository → Deploy Keys
   - Paste contents of `~/.ssh/id_ed25519.pub`

### Permission Errors

Ensure deployment directory permissions:
```bash
sudo mkdir -p /var/www/apps
sudo chown -R $USER:$USER /var/www/apps
sudo chmod -R 755 /var/www/apps
```

### Nginx Configuration Test Failed

Test configuration:
```bash
sudo nginx -t
```

Check syntax errors and fix in `/etc/nginx/sites-available/`

### DNS Not Resolving

Verify DNS propagation:
```bash
dig yourdomain.com
dig project-name.yourdomain.com
nslookup yourdomain.com
```

DNS can take up to 48 hours to propagate globally.

## License

MIT
