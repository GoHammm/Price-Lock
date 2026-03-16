'use strict';

const crypto = require('crypto');
const db = require('./db');

async function requireAuth(req, res, next) {
  const shop = req.query.shop || req.headers['x-shopify-shop'] || process.env.SHOP;

  if (!shop) {
    return res.status(401).json({ error: 'Missing shop parameter' });
  }

  // Check stored session
  let session = await db.getSession(shop);

  // Fall back to SHOPIFY_ACCESS_TOKEN env var
  if ((!session || !session.token) && process.env.SHOPIFY_ACCESS_TOKEN) {
    await db.saveSession(shop, process.env.SHOPIFY_ACCESS_TOKEN);
    session = await db.getSession(shop);
  }

  if (!session || !session.token) {
    return res.status(401).json({ error: 'Not authenticated', redirectTo: `/auth?shop=${shop}` });
  }

  req.shop = shop;
  req.token = session.token;
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
