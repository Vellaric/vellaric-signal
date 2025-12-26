#!/usr/bin/env node

/**
 * Check SSL certificate status for all deployed domains
 * Usage: node scripts/check-ssl-status.js
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

async function getNginxDomains() {
  try {
    const sitesPath = '/etc/nginx/sites-enabled';
    const files = await fs.readdir(sitesPath);
    
    // Filter out default and signal.vellaric.com (main dashboard)
    return files.filter(f => f !== 'default' && !f.includes('signal.vellaric'));
  } catch (error) {
    console.error('❌ Error reading nginx sites:', error.message);
    return [];
  }
}

async function checkDomainSSL(domain) {
  const result = {
    domain,
    dnsConfigured: false,
    dnsIP: null,
    hasNginxConfig: false,
    hasCertificate: false,
    certificateExpiry: null,
    httpsWorking: false,
    status: 'unknown'
  };

  // Check DNS
  try {
    const { stdout } = await execAsync(`dig +short ${domain} @8.8.8.8`);
    result.dnsIP = stdout.trim();
    result.dnsConfigured = !!result.dnsIP;
  } catch (error) {
    // DNS not configured
  }

  // Check nginx config
  try {
    await fs.access(`/etc/nginx/sites-enabled/${domain}`);
    result.hasNginxConfig = true;
  } catch (error) {
    // No nginx config
  }

  // Check certificate
  try {
    const { stdout } = await execAsync(`certbot certificates 2>/dev/null | grep -A 10 "Certificate Name: ${domain}" || echo "none"`);
    if (!stdout.includes('none')) {
      result.hasCertificate = true;
      
      // Extract expiry date
      const expiryMatch = stdout.match(/Expiry Date: ([^\n]+)/);
      if (expiryMatch) {
        result.certificateExpiry = expiryMatch[1].trim();
      }
    }
  } catch (error) {
    // No certificate
  }

  // Check HTTPS connection
  if (result.dnsConfigured && result.hasCertificate) {
    try {
      const { stdout } = await execAsync(
        `echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -subject`,
        { timeout: 5000 }
      );
      
      if (stdout.includes(`CN=${domain}`) || stdout.includes(`CN = ${domain}`)) {
        result.httpsWorking = true;
        result.status = '✅ Working';
      } else {
        result.status = '⚠️  Wrong certificate';
      }
    } catch (error) {
      result.status = '❌ HTTPS not working';
    }
  } else if (!result.dnsConfigured) {
    result.status = '🔴 DNS not configured';
  } else if (!result.hasCertificate) {
    result.status = '🟡 No SSL certificate';
  }

  return result;
}

function formatTable(results) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                    SSL Certificate Status Report');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.length === 0) {
    console.log('No deployed domains found.\n');
    return;
  }

  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.domain}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   DNS: ${result.dnsConfigured ? `✅ ${result.dnsIP}` : '❌ Not configured'}`);
    console.log(`   Nginx: ${result.hasNginxConfig ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   SSL Cert: ${result.hasCertificate ? `✅ Valid (expires: ${result.certificateExpiry})` : '❌ Not found'}`);
    console.log(`   HTTPS: ${result.httpsWorking ? '✅ Working' : '❌ Not working'}`);
    
    // Add action recommendation
    if (result.status === '🔴 DNS not configured') {
      console.log(`   → Action: Configure DNS A record: ${result.domain} → <VPS_IP>`);
    } else if (result.status === '🟡 No SSL certificate') {
      console.log(`   → Action: Run: node scripts/fix-ssl.js ${result.domain}`);
    } else if (result.status === '⚠️  Wrong certificate') {
      console.log(`   → Action: Run: sudo certbot delete --cert-name ${result.domain} && sudo certbot --nginx -d ${result.domain}`);
    }
    
    console.log();
  });

  // Summary
  const working = results.filter(r => r.httpsWorking).length;
  const total = results.length;
  const needsAction = results.filter(r => !r.httpsWorking).length;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Summary: ${working}/${total} domains have working HTTPS`);
  
  if (needsAction > 0) {
    console.log(`\n⚠️  ${needsAction} domain(s) need attention. See actions above.`);
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function main() {
  console.log('\n🔍 Scanning deployed domains...\n');

  const domains = await getNginxDomains();
  
  if (domains.length === 0) {
    console.log('No deployed domains found in /etc/nginx/sites-enabled/\n');
    process.exit(0);
  }

  console.log(`Found ${domains.length} deployed domain(s). Checking SSL status...\n`);

  const results = [];
  for (const domain of domains) {
    process.stdout.write(`  Checking ${domain}... `);
    const result = await checkDomainSSL(domain);
    results.push(result);
    console.log(result.status);
  }

  formatTable(results);
}

main().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
