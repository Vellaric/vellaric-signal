const crypto = require('crypto');
const logger = require('./logger');

/**
 * Verify GitLab webhook signature
 */
function verifyWebhookSignature(receivedToken) {
  const expectedToken = process.env.GITLAB_WEBHOOK_SECRET;

  if (!expectedToken) {
    logger.warn('GITLAB_WEBHOOK_SECRET not configured');
    return false;
  }

  if (!receivedToken) {
    logger.warn('No webhook token received');
    return false;
  }

  // Simple token comparison
  return receivedToken === expectedToken;
}

/**
 * Generate a secure token for webhook configuration
 */
function generateWebhookToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  verifyWebhookSignature,
  generateWebhookToken,
};
