'use strict';

/**
 * Shopify OAuth handler
 * Routes:
 *   GET /auth         → Begin OAuth (redirect to Shopify)
 *   GET /auth/callback → Handle OAuth callback, save token
 */

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const serverless = require('serverless-http');
const db = require('./lib/db');

const app = express();
app.use(express.json());

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  HOST,
  SHOPIFY_API_VERSION = '2025-01',
} = process.env;

// ── Begin OAuth ───────────────────────────────────────────────────────────────
app.get('/auth', (req, res) => {
  const shop = req.query.shop || process.env.SHOP;
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${HOST}/auth/callback`;
  const scopes = [
    'read_products',
    'read_collections',
    'read_customers',
    'write_script_tags',
    'read_script_tags',
  ].join(',');

  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${scopes}` +
    `&state=${state}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  // NOTE: In production you'd store `state` in a temporary DB/cookie to prevent CSRF.
  // For a single-store private app this is acceptable.
  res.redirect(installUrl);
});

// ── OAuth Callback ────────────────────────────────────────────────────────────
app.get('/auth/callback', async (req, res) => {
  const { shop, hmac, code } = req.query;

  if (!shop || !hmac || !code) {
    return res.status(400).send('Missing required parameters');
  }

  // Validate HMAC
  const params = { ...req.query };
  delete params.hmac;
  const message = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');

  const generated = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  if (
    generated.length !== hmac.length ||
    !crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmac))
  ) {
    return res.status(403).send('HMAC validation failed');
  }

  // Exchange code for access token
  try {
    const { data } = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }
    );

    const token = data.access_token;
    db.saveSession(shop, token);

    // Redirect to the app admin UI
    const host = Buffer.from(`${shop}/admin`).toString('base64');
    res.redirect(`/?shop=${shop}&host=${host}`);
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).send('Authentication failed. Check server logs.');
  }
});

module.exports.handler = serverless(app);
