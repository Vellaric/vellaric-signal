const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const logger = require('./logger');

const execAsync = promisify(exec);

const SSL_DIR = '/etc/letsencrypt/live';

/**
 * Check if SSL certificate exists for domain
 */
async function certificateExists(domain) {
  try {
    await fs.access(`${SSL_DIR}/${domain}/fullchain.pem`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Obtain SSL certificate using Let's Encrypt (certbot)
 */
async function obtainCertificate(domain) {
  try {
    const email = process.env.SSL_EMAIL || 'admin@example.com';
    
    logger.info(`Obtaining SSL certificate for ${domain}...`);
    
    const { stdout, stderr } = await execAsync(
      `certbot --nginx -d ${domain} --non-interactive --agree-tos --email ${email} --redirect`
    );
    
    logger.info('Certbot output:', stdout || stderr);
    logger.info(`SSL certificate obtained for ${domain}`);
    
    return true;
  } catch (error) {
    logger.error(`Error obtaining SSL certificate for ${domain}:`, error);
    throw error;
  }
}

/**
 * Renew SSL certificate
 */
async function renewCertificate(domain) {
  try {
    logger.info(`Renewing SSL certificate for ${domain}...`);
    const { stdout, stderr } = await execAsync(`certbot renew --cert-name ${domain}`);
    logger.info('Certbot renew output:', stdout || stderr);
    return true;
  } catch (error) {
    logger.error(`Error renewing SSL certificate for ${domain}:`, error);
    return false;
  }
}

/**
 * Ensure SSL certificate exists, obtain if needed
 */
async function ensureSSLCertificate(domain) {
  try {
    const exists = await certificateExists(domain);
    
    if (exists) {
      logger.info(`SSL certificate already exists for ${domain}, ensuring nginx config is updated...`);
      // Re-run certbot to ensure nginx config is properly updated with this certificate
      return await obtainCertificate(domain);
    }
    
    return await obtainCertificate(domain);
  } catch (error) {
    logger.error(`SSL setup failed for ${domain}:`, error);
    throw error;
  }
}

/**
 * Delete SSL certificate for domain
 */
async function deleteCertificate(domain) {
  try {
    await execAsync(`certbot delete --cert-name ${domain} --non-interactive`);
    logger.info(`SSL certificate deleted for ${domain}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting SSL certificate for ${domain}:`, error);
    return false;
  }
}

module.exports = {
  certificateExists,
  obtainCertificate,
  renewCertificate,
  ensureSSLCertificate,
  deleteCertificate,
};
