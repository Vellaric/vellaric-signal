# SSL Certificate Troubleshooting Guide

## Problem: Wrong SSL Certificate Error

If you see an error like:
```
net::ERR_CERT_COMMON_NAME_INVALID
This server could not prove that it is vellaro-gateway-dev.vellaric.com;
its security certificate is from signal.vellaric.com
```

This means nginx is serving the wrong SSL certificate (fallback/default certificate) because the deployed domain doesn't have its own SSL certificate yet.

## Why This Happens

1. **DNS not propagated**: When deploying, certbot tries to obtain SSL certificate immediately, but DNS records may not be propagated yet
2. **Certbot validation fails**: Let's Encrypt can't verify domain ownership if DNS is not ready
3. **Nginx fallback**: Without a certificate for the specific domain, nginx falls back to the default SSL server (signal.vellaric.com)

## Solutions

### Solution 1: Wait and Retry SSL Setup (Easiest)

After deploying, wait 10-15 minutes for DNS to propagate, then manually obtain the SSL certificate:

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Run the fix-ssl script
cd /path/to/vellaric-signal
node scripts/fix-ssl.js vellaro-gateway-dev.vellaric.com
```

Or directly use certbot:
```bash
sudo certbot --nginx -d vellaro-gateway-dev.vellaric.com
```

### Solution 2: Use Cloudflare DNS (Recommended)

Configure Cloudflare API credentials in `.env` to automatically create DNS records:

```bash
# In Vellaric-Signal/.env
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
VPS_PUBLIC_IP=your_vps_ip_address
```

This will:
1. Automatically create DNS A records when deploying
2. Wait for propagation before attempting SSL
3. Ensure SSL setup succeeds on first try

See [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for details.

### Solution 3: Use Wildcard SSL Certificate

Create a single wildcard SSL certificate for all subdomains:

```bash
# One-time setup
sudo certbot certonly --manual --preferred-challenges=dns -d "*.vellaric.com"

# Follow prompts to add TXT record to DNS
# This creates a wildcard cert that works for all subdomains
```

Then modify nginx configs to use the wildcard certificate. This requires manual nginx configuration updates.

## Immediate Fix for Existing Deployments

If you already have a deployment with the wrong certificate:

### Step 1: Verify DNS

```bash
dig +short vellaro-gateway-dev.vellaric.com
# Should return your VPS IP address
```

If DNS is not configured:
- Add A record: `vellaro-gateway-dev.vellaric.com` → Your VPS IP
- Wait 5-15 minutes for propagation

### Step 2: Check Nginx Config

```bash
# Check if nginx config exists
ls -la /etc/nginx/sites-enabled/ | grep vellaro-gateway-dev

# View the config
cat /etc/nginx/sites-available/vellaro-gateway-dev.vellaric.com
```

### Step 3: Obtain SSL Certificate

**Option A: Use the fix-ssl script (Recommended)**
```bash
cd /var/www/apps/vellaric-signal
node scripts/fix-ssl.js vellaro-gateway-dev.vellaric.com
```

**Option B: Use certbot directly**
```bash
sudo certbot --nginx -d vellaro-gateway-dev.vellaric.com
```

This will:
- Obtain SSL certificate from Let's Encrypt
- Automatically update nginx config to use HTTPS
- Reload nginx

### Step 4: Verify SSL Works

```bash
# Test the domain
curl -I https://vellaro-gateway-dev.vellaric.com

# Check certificate
echo | openssl s_client -connect vellaro-gateway-dev.vellaric.com:443 -servername vellaro-gateway-dev.vellaric.com 2>/dev/null | openssl x509 -noout -subject
```

Should show: `subject=CN=vellaro-gateway-dev.vellaric.com`

## Preventing Future Issues

### Update Deployment Flow

The deployment queue has been updated to:
1. Wait for DNS propagation (30 seconds)
2. Check if domain resolves before attempting SSL
3. Retry SSL setup if needed
4. Log clear warnings if SSL setup fails

### Pre-Configure DNS

Before deploying a new app:
1. Create DNS A record for the subdomain
2. Wait 10-15 minutes for propagation
3. Then trigger the deployment

### Use Cloudflare API

Set up Cloudflare integration to automate DNS:
```bash
CLOUDFLARE_API_TOKEN=xxxxx
VPS_PUBLIC_IP=82.115.24.160
```

## Certificate Management

### View All Certificates
```bash
sudo certbot certificates
```

### Renew Certificates
```bash
# Renew all certificates (run monthly via cron)
sudo certbot renew

# Renew specific domain
sudo certbot renew --cert-name vellaro-gateway-dev.vellaric.com
```

### Delete Certificate
```bash
sudo certbot delete --cert-name vellaro-gateway-dev.vellaric.com
```

## Troubleshooting Common Errors

### "DNS problem: NXDOMAIN"
- DNS is not configured or not propagated yet
- Wait longer (up to 24 hours in some cases)
- Check your DNS provider settings

### "Connection timed out"
- Firewall blocking port 80 (needed for Let's Encrypt validation)
- Check: `sudo ufw status`
- Allow: `sudo ufw allow 80/tcp`

### "Rate limit exceeded"
- Let's Encrypt has strict rate limits (5 certificates per domain per week)
- Wait an hour or use staging environment for testing
- For testing: `certbot --staging ...`

### "Certificate already exists"
- Certificate is already issued but not configured in nginx
- Re-run: `sudo certbot --nginx -d domain.com`
- Or manually update nginx config to use existing cert

## Quick Command Reference

```bash
# Fix SSL for a domain
node scripts/fix-ssl.js your-domain.com

# Check DNS
dig +short your-domain.com

# Test SSL certificate
curl -I https://your-domain.com

# View certificate details
echo | openssl s_client -connect your-domain.com:443 2>/dev/null | openssl x509 -noout -text

# List all certificates
sudo certbot certificates

# Renew all certificates
sudo certbot renew

# Reload nginx
sudo systemctl reload nginx

# Test nginx config
sudo nginx -t
```

## For the Current Issue (vellaro-gateway-dev.vellaric.com)

Run these commands on your VPS:

```bash
# 1. Check if DNS is configured
dig +short vellaro-gateway-dev.vellaric.com

# 2. If DNS is good, obtain certificate
sudo certbot --nginx -d vellaro-gateway-dev.vellaric.com

# 3. Reload nginx
sudo systemctl reload nginx

# 4. Test
curl -I https://vellaro-gateway-dev.vellaric.com
```

After these steps, the certificate error should be resolved and you'll be able to access the site over HTTPS with the correct certificate.
