#!/usr/bin/env node

/**
 * Manually obtain SSL certificate for a deployed domain
 * Usage: node scripts/fix-ssl.js <domain>
 * Example: node scripts/fix-ssl.js vellaro-gateway-dev.vellaric.com
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const domain = process.argv[2];

if (!domain) {
  console.error('Usage: node scripts/fix-ssl.js <domain>');
  console.error('Example: node scripts/fix-ssl.js vellaro-gateway-dev.vellaric.com');
  process.exit(1);
}

async function checkDns(domain) {
  try {
    console.log(`\n🔍 Checking DNS for ${domain}...`);
    const { stdout } = await execAsync(`dig +short ${domain} @8.8.8.8`);
    const ip = stdout.trim();
    
    if (!ip) {
      console.error(`❌ DNS not configured for ${domain}`);
      console.log(`\nPlease configure DNS first:`);
      console.log(`  - Add A record: ${domain} -> <VPS_IP>`);
      console.log(`  - Wait for propagation (can take 5-15 minutes)`);
      return false;
    }
    
    console.log(`✅ DNS resolves to: ${ip}`);
    return true;
  } catch (error) {
    console.error(`❌ DNS check failed:`, error.message);
    return false;
  }
}

async function checkNginxConfig(domain) {
  try {
    console.log(`\n🔍 Checking nginx configuration for ${domain}...`);
    const { stdout } = await execAsync(`test -f /etc/nginx/sites-enabled/${domain} && echo "exists" || echo "missing"`);
    
    if (stdout.trim() === 'missing') {
      console.error(`❌ Nginx configuration not found for ${domain}`);
      console.log(`\nThe domain must be deployed first before adding SSL.`);
      return false;
    }
    
    console.log(`✅ Nginx configuration exists`);
    return true;
  } catch (error) {
    console.error(`❌ Nginx config check failed:`, error.message);
    return false;
  }
}

async function obtainCertificate(domain) {
  try {
    console.log(`\n🔒 Obtaining SSL certificate for ${domain}...`);
    console.log(`This may take a minute or two...`);
    
    const email = process.env.SSL_EMAIL || 'admin@example.com';
    const { stdout, stderr } = await execAsync(
      `certbot --nginx -d ${domain} --non-interactive --agree-tos --email ${email} --redirect`,
      { maxBuffer: 1024 * 1024 * 10 }
    );
    
    console.log(`\n📋 Certbot output:`);
    console.log(stdout || stderr);
    
    console.log(`\n✅ SSL certificate obtained successfully!`);
    console.log(`🌐 You can now access: https://${domain}`);
    
    return true;
  } catch (error) {
    console.error(`\n❌ Failed to obtain SSL certificate:`, error.message);
    
    if (error.message.includes('timed out') || error.message.includes('DNS')) {
      console.log(`\n💡 Troubleshooting tips:`);
      console.log(`  1. Verify DNS is properly configured and propagated`);
      console.log(`  2. Wait 15 minutes and try again`);
      console.log(`  3. Check if firewall allows HTTP (port 80) for Let's Encrypt validation`);
    } else if (error.message.includes('rate limit')) {
      console.log(`\n💡 Let's Encrypt rate limit reached. Wait an hour and try again.`);
    }
    
    return false;
  }
}

async function reloadNginx() {
  try {
    console.log(`\n🔄 Reloading nginx...`);
    await execAsync('systemctl reload nginx');
    console.log(`✅ Nginx reloaded`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to reload nginx:`, error.message);
    return false;
  }
}

async function main() {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔒 SSL Certificate Setup for ${domain}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Check DNS
  const dnsOk = await checkDns(domain);
  if (!dnsOk) {
    process.exit(1);
  }

  // Check nginx config
  const nginxOk = await checkNginxConfig(domain);
  if (!nginxOk) {
    process.exit(1);
  }

  // Obtain certificate
  const certOk = await obtainCertificate(domain);
  if (!certOk) {
    process.exit(1);
  }

  // Reload nginx
  await reloadNginx();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ SSL setup complete!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(error => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
