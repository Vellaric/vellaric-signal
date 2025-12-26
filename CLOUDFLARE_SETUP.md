# Cloudflare DNS Setup Guide

## Overview

Vellaric-Signal supports two methods for DNS management with Cloudflare:

1. **Manual Wildcard DNS (Recommended)** - Simple, set once and forget
2. **Automatic DNS via API** - Creates specific A records per deployment

## Method 1: Manual Wildcard DNS (Recommended)

### Advantages
✅ Simple one-time setup  
✅ No API token needed  
✅ Works for unlimited subdomains  
✅ Immediate propagation  

### Setup Steps

1. **Login to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com
   - Select your domain (e.g., `vellaric.com`)

2. **Add DNS Record**
   - Click **DNS** → **Records** → **Add record**
   - Set the following:
     ```
     Type: A
     Name: *
     IPv4 address: YOUR_VPS_IP
     Proxy status: DNS only (gray cloud, NOT orange)
     TTL: Auto
     ```
   - Click **Save**

3. **Verify DNS**
   ```bash
   dig something-dev.vellaric.com
   # Should return your VPS IP
   ```

### Important Notes

⚠️ **Must use DNS only mode (gray cloud)** - SSL is handled by Let's Encrypt on your VPS, not Cloudflare  
⚠️ **Wildcard covers all subdomains** - `app-dev.vellaric.com`, `another-app.vellaric.com`, etc.  

---

## Method 2: Automatic DNS via Cloudflare API

### Advantages
✅ Automatic DNS record creation per deployment  
✅ Precise control over each subdomain  
✅ Can track which subdomains exist  
✅ Auto-cleanup on deployment removal  

### Disadvantages
❌ Requires API token setup  
❌ More complex configuration  
❌ API rate limits apply  

### Setup Steps

#### 1. Create Cloudflare API Token

1. **Login to Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com

2. **Navigate to API Tokens**
   - Click on your profile → **My Profile**
   - Click **API Tokens** tab
   - Click **Create Token**

3. **Use Template or Custom**
   - Option A: Use "Edit zone DNS" template
   - Option B: Create custom token with these permissions:
     ```
     Zone - DNS - Edit
     Zone - Zone - Read
     ```

4. **Configure Token**
   - **Zone Resources**: Include → Specific zone → `vellaric.com`
   - **IP Address Filtering**: (optional) Add your VPS IP
   - Click **Continue to summary**

5. **Create and Copy Token**
   - Review permissions
   - Click **Create Token**
   - **COPY THE TOKEN** (shown only once!)
   - Example: `abc123def456...xyz789`

#### 2. Configure Vellaric-Signal

Edit `/opt/vellaric-signal/.env`:

```env
# Your domain
BASE_DOMAIN=vellaric.com

# Cloudflare API Token (from step 1)
CLOUDFLARE_API_TOKEN=your_token_here

# Your VPS public IP (auto-detected if not set)
VPS_PUBLIC_IP=123.456.789.012

# SSL email
SSL_EMAIL=admin@vellaric.com
```

#### 3. Restart Service

```bash
sudo systemctl restart vellaric-signal
```

#### 4. Test Deployment

Push code to GitLab and check logs:

```bash
sudo journalctl -u vellaric-signal -f
```

You should see:
```
[INFO] Setting up DNS for myapp-dev.vellaric.com
[INFO] DNS record created: myapp-dev.vellaric.com
```

#### 5. Verify DNS Record Created

Check Cloudflare dashboard:
- DNS → Records
- Should see `myapp-dev` → A → `YOUR_VPS_IP`

---

## Comparison Table

| Feature | Wildcard DNS | Cloudflare API |
|---------|--------------|----------------|
| Setup complexity | Simple | Moderate |
| API token required | ❌ No | ✅ Yes |
| Auto DNS creation | ❌ No | ✅ Yes |
| Auto DNS cleanup | ❌ No | ✅ Yes |
| Subdomain limit | Unlimited | API rate limits |
| DNS propagation | Instant | Instant |
| Recommended for | Most users | Advanced users |

---

## How It Works

### With Wildcard DNS
```
Deployment triggered
    ↓
Pull code & build Docker
    ↓
Start container
    ↓
Configure nginx for subdomain
    ↓
Request SSL cert (Let's Encrypt reads wildcard DNS)
    ↓
App live at https://subdomain.vellaric.com
```

### With Cloudflare API
```
Deployment triggered
    ↓
Pull code & build Docker
    ↓
Start container
    ↓
Create DNS A record via Cloudflare API
    ↓
Configure nginx for subdomain
    ↓
Request SSL cert (Let's Encrypt reads new DNS)
    ↓
App live at https://subdomain.vellaric.com
```

---

## Troubleshooting

### Wildcard DNS Not Working

**Check DNS propagation:**
```bash
dig *.vellaric.com
dig random-test.vellaric.com
nslookup anything.vellaric.com
```

**Common issues:**
- ❌ Orange cloud (proxied) instead of gray (DNS only)
- ❌ Wrong VPS IP address
- ❌ DNS not propagated yet (wait 5-10 minutes)

### Cloudflare API Not Working

**Check token permissions:**
```bash
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Check logs:**
```bash
sudo journalctl -u vellaric-signal -n 100 | grep -i cloudflare
```

**Common issues:**
- ❌ Invalid API token
- ❌ Token missing DNS edit permissions
- ❌ Token restricted to wrong zone
- ❌ Rate limit exceeded

### DNS Record Not Created

**Manual verification:**
```bash
# Check if token works
curl -X GET "https://api.cloudflare.com/client/v4/zones" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Fallback to wildcard:**
If API fails, the system automatically falls back to wildcard DNS mode.

---

## Security Best Practices

### API Token Security

✅ **Use scoped tokens** - Only grant DNS edit for specific zone  
✅ **Rotate tokens regularly** - Create new token every 90 days  
✅ **Restrict IP access** - Add your VPS IP to token restrictions  
✅ **Never commit tokens** - Keep in `.env`, not in git  
✅ **Use read-only tokens** - For monitoring/status endpoints  

### DNS Security

✅ **Use gray cloud (DNS only)** - SSL handled by your server  
✅ **Enable DNSSEC** - In Cloudflare DNS settings  
✅ **Monitor DNS changes** - Enable email notifications  
✅ **Use CAA records** - Restrict SSL issuance to Let's Encrypt  

---

## Recommended Setup

### For vellaric.com

**Production approach:**

1. ✅ Use **Wildcard DNS** for simplicity
2. ✅ Set `*.vellaric.com` → VPS IP
3. ✅ DNS only mode (gray cloud)
4. ✅ No API token needed

**Why this is better:**
- No API rate limits
- No token management
- Instant for all subdomains
- Simpler troubleshooting
- No API failure scenarios

**When to use API:**
- Need to track exact subdomains created
- Want automatic cleanup
- Need per-subdomain monitoring
- Corporate compliance requires it

---

## Migration Between Methods

### From Wildcard to API

1. Get Cloudflare API token
2. Add to `.env`
3. Restart service
4. New deployments use API
5. Old deployments continue working

### From API to Wildcard

1. Create wildcard DNS record
2. Remove `CLOUDFLARE_API_TOKEN` from `.env`
3. Restart service
4. New deployments use wildcard
5. Old DNS records remain (optional cleanup)

---

## Examples

### Deployment Examples

**Main branch:**
```
Repository: my-nodejs-app
Branch: main
Result: https://my-nodejs-app.vellaric.com
```

**Dev branch:**
```
Repository: my-nodejs-app
Branch: dev
Result: https://my-nodejs-app-dev.vellaric.com
```

**Multiple projects:**
```
Project A (main):  https://project-a.vellaric.com
Project A (dev):   https://project-a-dev.vellaric.com
Project B (main):  https://project-b.vellaric.com
Project B (dev):   https://project-b-dev.vellaric.com
```

All work automatically with wildcard DNS! 🎉
