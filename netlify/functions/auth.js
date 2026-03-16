'use strict';

/**
 * Auth handler — Shopify Dev Dashboard client credentials grant
 *
 * The new Dev Dashboard does NOT use OAuth redirects.
 * The app requests a token directly using client_id + client_secret.
 *
 * GET /auth  → fetch token via client credentials, save session, redirect to app UI
 */

const express = require('express');
const serverless = require('serverless-http');
const db = require('./lib/db');

const app = express();
app.use(express.json());

app.get('/auth', async (req, res) => {
  const CLIENT_ID = process.env.SHOPIFY_API_KEY;
  const CLIENT_SECRET = process.env.SHOPIFY_API_SECRET;
  const SHOP = process.env.SHOP || req.query.shop;
  const HOST = process.env.HOST;

  // Debug — log what we have (remove after confirmed working)
  console.log('AUTH called — CLIENT_ID:', CLIENT_ID ? 'SET' : 'MISSING');
  console.log('AUTH called — CLIENT_SECRET:', CLIENT_SECRET ? 'SET' : 'MISSING');
  console.log('AUTH called — SHOP:', SHOP);
  console.log('AUTH called — HOST:', HOST);

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(
      `Missing credentials. CLIENT_ID: ${CLIENT_ID ? 'OK' : 'MISSING'}, CLIENT_SECRET: ${CLIENT_SECRET ? 'OK' : 'MISSING'}`
    );
  }

  if (!SHOP) {
    return res.status(400).send('Missing SHOP env variable');
  }

  try {
    const response = await fetch(
      `https://${SHOP}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('Token request failed:', response.status, text);
      return res.status(500).send(`Token request failed: ${response.status} — ${text}`);
    }

    const { access_token } = await response.json();
    db.saveSession(SHOP, access_token);

    console.log('Auth successful, token saved, redirecting to app UI');
    // Also expose as env for downstream functions in same process
    process.env.SHOPIFY_ACCESS_TOKEN = access_token;
    res.redirect('/');
  } catch (err) {
    console.error('Auth error:', err.message);
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

module.exports.handler = serverless(app);
