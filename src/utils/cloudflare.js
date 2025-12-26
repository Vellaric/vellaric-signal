const logger = require('./logger');

/**
 * Cloudflare DNS Management
 * Creates/updates/deletes DNS A records for subdomains
 */

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Make Cloudflare API request
 */
async function cloudflareRequest(endpoint, method = 'GET', data = null) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  
  if (!apiToken) {
    logger.warn('CLOUDFLARE_API_TOKEN not set, skipping DNS management');
    return null;
  }

  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, options);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.errors?.[0]?.message || 'Cloudflare API error');
    }

    return result.result;
  } catch (error) {
    logger.error('Cloudflare API error:', error);
    throw error;
  }
}

/**
 * Get zone ID from domain
 */
async function getZoneId(domain) {
  // Extract root domain (e.g., vellaric.com from subdomain.vellaric.com)
  const parts = domain.split('.');
  const rootDomain = parts.slice(-2).join('.');

  try {
    const zones = await cloudflareRequest(`/zones?name=${rootDomain}`);
    if (!zones || zones.length === 0) {
      throw new Error(`Zone not found for domain: ${rootDomain}`);
    }
    return zones[0].id;
  } catch (error) {
    logger.error('Error getting zone ID:', error);
    throw error;
  }
}

/**
 * Get existing DNS record for subdomain
 */
async function getDnsRecord(zoneId, subdomain) {
  try {
    const records = await cloudflareRequest(`/zones/${zoneId}/dns_records?name=${subdomain}`);
    return records?.[0] || null;
  } catch (error) {
    logger.error('Error getting DNS record:', error);
    return null;
  }
}

/**
 * Create DNS A record for subdomain
 */
async function createDnsRecord(subdomain, ipAddress) {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    logger.info('Cloudflare API not configured, skipping DNS creation');
    return { success: false, message: 'API token not set' };
  }

  try {
    const zoneId = await getZoneId(subdomain);
    
    // Check if record exists
    const existing = await getDnsRecord(zoneId, subdomain);
    
    if (existing) {
      // Update existing record
      logger.info(`Updating DNS record for ${subdomain} -> ${ipAddress}`);
      await cloudflareRequest(
        `/zones/${zoneId}/dns_records/${existing.id}`,
        'PUT',
        {
          type: 'A',
          name: subdomain,
          content: ipAddress,
          ttl: 1, // Auto
          proxied: false, // DNS only, not proxied through Cloudflare
        }
      );
      logger.info(`DNS record updated: ${subdomain}`);
      return { success: true, action: 'updated' };
    } else {
      // Create new record
      logger.info(`Creating DNS record for ${subdomain} -> ${ipAddress}`);
      await cloudflareRequest(
        `/zones/${zoneId}/dns_records`,
        'POST',
        {
          type: 'A',
          name: subdomain,
          content: ipAddress,
          ttl: 1, // Auto
          proxied: false,
        }
      );
      logger.info(`DNS record created: ${subdomain}`);
      return { success: true, action: 'created' };
    }
  } catch (error) {
    logger.error(`Error creating DNS record for ${subdomain}:`, error);
    throw error;
  }
}

/**
 * Delete DNS record for subdomain
 */
async function deleteDnsRecord(subdomain) {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    logger.info('Cloudflare API not configured, skipping DNS deletion');
    return { success: false, message: 'API token not set' };
  }

  try {
    const zoneId = await getZoneId(subdomain);
    const existing = await getDnsRecord(zoneId, subdomain);
    
    if (existing) {
      logger.info(`Deleting DNS record for ${subdomain}`);
      await cloudflareRequest(
        `/zones/${zoneId}/dns_records/${existing.id}`,
        'DELETE'
      );
      logger.info(`DNS record deleted: ${subdomain}`);
      return { success: true, action: 'deleted' };
    } else {
      logger.info(`DNS record not found: ${subdomain}`);
      return { success: true, action: 'not_found' };
    }
  } catch (error) {
    logger.error(`Error deleting DNS record for ${subdomain}:`, error);
    throw error;
  }
}

/**
 * Get server public IP address
 */
async function getPublicIp() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    logger.error('Error getting public IP:', error);
    // Fallback: try to get from env or return null
    return process.env.VPS_PUBLIC_IP || null;
  }
}

/**
 * Setup DNS for deployment (creates A record if API configured)
 */
async function setupDeploymentDns(domain) {
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    logger.info('Cloudflare API not configured - using wildcard DNS');
    return { success: true, method: 'wildcard' };
  }

  try {
    const ipAddress = await getPublicIp();
    if (!ipAddress) {
      throw new Error('Could not determine public IP address');
    }

    const result = await createDnsRecord(domain, ipAddress);
    return { success: true, method: 'api', ...result };
  } catch (error) {
    logger.error('DNS setup failed, falling back to wildcard:', error);
    return { success: false, method: 'fallback', error: error.message };
  }
}

module.exports = {
  createDnsRecord,
  deleteDnsRecord,
  setupDeploymentDns,
  getPublicIp,
};
