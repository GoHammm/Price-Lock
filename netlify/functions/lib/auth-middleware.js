'use strict';

const crypto = require('crypto');
const db = require('./db');

// Express doesn't handle async middleware errors automatically.
// We wrap the async logic and call next(err) on failure.
function requireAuth(req, res, next) {
  const shop = req.query.shop || req.headers['x-shopify-shop'] || process.env.SHOP;

  if (!shop) {
    return res.status(401).json({ error: 'Missing shop parameter' });
  }

  // Use SHOPIFY_ACCESS_TOKEN env var directly — no Redis lookup needed for auth
  // Redis is only used for persistence of rules/settings, not session auth
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!token) {
    return res.status(401).json({ error: 'Not authenticated — SHOPIFY_ACCESS_TOKEN missing' });
  }

  req.shop = shop;
  req.token = token;
  next();
}

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
