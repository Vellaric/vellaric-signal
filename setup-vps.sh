#!/bin/bash

# Vellaric-Signal Ubuntu VPS Setup Script
# This script installs all required dependencies for the webhook deployment server

set -e

echo "========================================="
echo "Vellaric-Signal VPS Setup"
echo "========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Node.js 18.x
echo "Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install Docker
echo "Installing Docker..."
apt-get install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io

# Start and enable Docker
systemctl start docker
systemctl enable docker

# Install Docker Compose
echo "Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Install nginx
echo "Installing nginx..."
apt-get install -y nginx

# Start and enable nginx
systemctl start nginx
systemctl enable nginx

# Install certbot for SSL
echo "Installing certbot..."
apt-get install -y certbot python3-certbot-nginx

# Install Git
echo "Installing Git..."
apt-get install -y git

# Install AWS CLI (for S3-compatible storage like Backblaze B2)
echo "Installing AWS CLI..."
apt-get install -y unzip curl
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
./aws/install
rm -rf aws awscliv2.zip

# Create deployment directory
echo "Creating deployment directory..."
mkdir -p /var/www/apps
chmod 755 /var/www/apps

# Create vellaric-signal user (optional)
if ! id "vellaric" &>/dev/null; then
    echo "Creating vellaric user..."
    useradd -r -s /bin/bash -d /opt/vellaric-signal -m vellaric
    usermod -aG docker vellaric
fi

# Clone and setup Vellaric-Signal
echo "Setting up Vellaric-Signal..."
if [ ! -d "/opt/vellaric-signal" ]; then
    git clone https://github.com/yourusername/vellaric-signal.git /opt/vellaric-signal
fi

cd /opt/vellaric-signal
npm install --production

# Copy environment file
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "Please edit /opt/vellaric-signal/.env with your configuration"
fi

# Create systemd service
echo "Creating systemd service..."
cat > /etc/systemd/system/vellaric-signal.service << 'EOF'
[Unit]
Description=Vellaric-Signal GitLab Webhook Server
After=network.target docker.service nginx.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vellaric-signal
EnvironmentFile=/opt/vellaric-signal/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=vellaric-signal

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
systemctl daemon-reload

# Configure firewall (if ufw is installed)
if command -v ufw &> /dev/null; then
    echo "Configuring firewall..."
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 3000/tcp
fi

echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Edit /opt/vellaric-signal/.env with your configuration:"
echo "   - Set GITLAB_WEBHOOK_SECRET"
echo "   - Set BASE_DOMAIN to your domain"
echo "   - Set SSL_EMAIL for Let's Encrypt"
echo ""
echo "2. Start the service:"
echo "   systemctl start vellaric-signal"
echo "   systemctl enable vellaric-signal"
echo ""
echo "3. Check status:"
echo "   systemctl status vellaric-signal"
echo ""
echo "4. View logs:"
echo "   journalctl -u vellaric-signal -f"
echo ""
echo "5. Configure DNS:"
echo "   Point *.${BASE_DOMAIN:-yourdomain.com} to this server's IP"
echo ""

# Display versions
echo "Installed versions:"
node --version
docker --version
nginx -v
certbot --version
