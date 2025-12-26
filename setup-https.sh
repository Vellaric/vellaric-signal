#!/bin/bash

# HTTPS Setup for Vellaric-Signal Webhook Server
# Run this after setting up DNS for your webhook subdomain

set -e

echo "========================================="
echo "Vellaric-Signal HTTPS Setup"
echo "========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Prompt for domain
read -p "Enter your webhook subdomain (e.g., signal.vellaric.com): " WEBHOOK_DOMAIN

if [ -z "$WEBHOOK_DOMAIN" ]; then
    echo "Error: Domain is required"
    exit 1
fi

echo ""
echo "Setting up HTTPS for: $WEBHOOK_DOMAIN"
echo ""

# Create nginx configuration
echo "Creating nginx configuration..."
cat > /etc/nginx/sites-available/vellaric-signal << EOF
# Vellaric-Signal Webhook Server
# Generated: $(date)

upstream vellaric_signal {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name ${WEBHOOK_DOMAIN};

    location / {
        proxy_pass http://vellaric_signal;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Increase body size for large webhook payloads
    client_max_body_size 10M;
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/vellaric-signal /etc/nginx/sites-enabled/

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

if [ $? -ne 0 ]; then
    echo "Error: nginx configuration test failed"
    exit 1
fi

# Reload nginx
echo "Reloading nginx..."
systemctl reload nginx

# Wait for nginx to reload
sleep 2

# Obtain SSL certificate
echo ""
echo "Obtaining SSL certificate from Let's Encrypt..."
echo "This will configure HTTPS automatically."
echo ""

# Get email from .env if exists
SSL_EMAIL=$(grep "^SSL_EMAIL=" /opt/vellaric-signal/.env 2>/dev/null | cut -d'=' -f2)

if [ -z "$SSL_EMAIL" ]; then
    read -p "Enter email for Let's Encrypt notifications: " SSL_EMAIL
fi

certbot --nginx -d ${WEBHOOK_DOMAIN} \
    --non-interactive \
    --agree-tos \
    --email ${SSL_EMAIL} \
    --redirect

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "HTTPS Setup Complete! ✅"
    echo "========================================="
    echo ""
    echo "Your webhook server is now available at:"
    echo "  https://${WEBHOOK_DOMAIN}"
    echo ""
    echo "GitLab webhook URL:"
    echo "  https://${WEBHOOK_DOMAIN}/webhook/gitlab"
    echo ""
    echo "Health check:"
    echo "  https://${WEBHOOK_DOMAIN}/webhook/health"
    echo ""
    echo "Test it now:"
    echo "  curl https://${WEBHOOK_DOMAIN}/webhook/health"
    echo ""
    echo "Certificate auto-renewal is enabled via certbot timer."
    echo ""
else
    echo ""
    echo "========================================="
    echo "SSL Certificate Setup Failed"
    echo "========================================="
    echo ""
    echo "Common issues:"
    echo "1. DNS not pointing to this server yet"
    echo "   - Check: dig ${WEBHOOK_DOMAIN}"
    echo "   - Should return: $(curl -s ifconfig.me)"
    echo ""
    echo "2. Firewall blocking port 80"
    echo "   - Run: ufw allow 80/tcp"
    echo ""
    echo "3. nginx not accessible"
    echo "   - Check: systemctl status nginx"
    echo ""
    echo "You can retry SSL setup with:"
    echo "  sudo certbot --nginx -d ${WEBHOOK_DOMAIN}"
    echo ""
fi

# Show nginx status
echo "Nginx status:"
systemctl status nginx --no-pager | head -5
