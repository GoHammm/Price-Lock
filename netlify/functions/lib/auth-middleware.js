'use strict';

const crypto = require('crypto');
const db = require('./db');

/**
 * Middleware to verify requests come from an authenticated session.
 * For embedded app requests, validates the `session` token header or
 * falls back to checking the shop's stored token.
 */
function requireAuth(req, res, next) {
  const shop = req.query.shop || req.headers['x-shopify-shop'] || process.env.SHOP;

  if (!shop) {
    return res.status(401).json({ error: 'Missing shop parameter' });
  }

  // Check DB session first
  let session = db.getSession(shop);

  // Fall back to SHOPIFY_ACCESS_TOKEN env var (for hardcoded / pre-fetched tokens)
  if ((!session || !session.token) && process.env.SHOPIFY_ACCESS_TOKEN) {
    db.saveSession(shop, process.env.SHOPIFY_ACCESS_TOKEN);
    session = db.getSession(shop);
  }

  if (!session || !session.token) {
    return res.status(401).json({ error: 'Not authenticated', redirectTo: `/auth?shop=${shop}` });
  }

  req.shop = shop;
  req.token = session.token;
  next();
}

/**
 * Verify Shopify webhook HMAC signature.
 */
function verifyWebhook(req, res, next) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return res.status(401).send('Missing HMAC');

  const body = req.rawBody || '';
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  if (hash !== hmac) return res.status(401).send('HMAC validation failed');
  next();
}

module.exports = { requireAuth, verifyWebhook };
