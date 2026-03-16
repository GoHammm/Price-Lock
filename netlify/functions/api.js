'use strict';

/**
 * Main API routes for the Rothley Price Lock admin app.
 *
 * All routes are prefixed /api/ (handled by netlify.toml redirect)
 *
 * Routes:
 *   GET    /api/health
 *   GET    /api/settings
 *   POST   /api/settings
 *   GET    /api/rules
 *   POST   /api/rules
 *   GET    /api/rules/:id
 *   PUT    /api/rules/:id
 *   DELETE /api/rules/:id
 *   GET    /api/rules/:id/button
 *   PUT    /api/rules/:id/button
 *   GET    /api/shopify/collections
 *   GET    /api/shopify/products
 *   GET    /api/shopify/customer-tags
 *   POST   /api/shopify/script-tag/register
 *   DELETE /api/shopify/script-tag
 *   GET    /api/config.json        ← public config consumed by storefront script
 */

const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const db = require('./lib/db');
const shopify = require('./lib/shopify');
const { requireAuth } = require('./lib/auth-middleware');

const app = express();
app.use(cors());
app.use(express.json());

const HOST = process.env.HOST || '';
const SHOP = process.env.SHOP || '';

/**
 * Auto-register the script tag on every cold start.
 * Checks Shopify directly (not the local DB) so it works
 * even after Netlify resets /tmp between invocations.
 */
async function autoRegisterScriptTag() {
  try {
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    const shop = SHOP;
    if (!token || !shop || !HOST) return;
    console.log('Checking/auto-registering storefront script tag...');
    // registerScriptTag already checks if one exists before creating
    const tag = await shopify.registerScriptTag(shop, token, HOST);
    db.updateAppSettings({ scriptTagId: String(tag.id) });
    console.log('Script tag confirmed/registered:', tag.id);
  } catch (err) {
    console.error('Auto-register failed (non-fatal):', err.message);
  }
}

// Kick off on every cold start — non-blocking
autoRegisterScriptTag();

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ── Public config endpoint (consumed by storefront script) ────────────────────
app.get('/api/config.json', (_req, res) => {
  const rules = db.getRules().filter((r) => r.enabled);
  const configs = {};
  rules.forEach((r) => {
    configs[r.id] = db.getButtonConfig(r.id);
  });

  res.json({
    rules,
    buttonConfigs: configs,
    host: HOST,
  });
});

// ── App Settings ──────────────────────────────────────────────────────────────
// Always verify script tag status live from Shopify so the dashboard
// shows the real state even after /tmp resets on cold starts.
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const scriptUrl = `${HOST}/storefront-script.js`;
    const token = req.token || process.env.SHOPIFY_ACCESS_TOKEN;
    const shop = req.shop || SHOP;
    let scriptTagId = null;
    try {
      const { script_tags } = await shopify.shopifyClient(shop, token)
        .get('/script_tags.json?src=' + encodeURIComponent(scriptUrl));
      if (script_tags && script_tags.length > 0) {
        scriptTagId = String(script_tags[0].id);
        // Keep local DB in sync
        db.updateAppSettings({ scriptTagId });
      } else {
        db.updateAppSettings({ scriptTagId: '' });
      }
    } catch {
      // If Shopify call fails, fall back to local DB
      scriptTagId = db.getAppSettings().script_tag_id || null;
    }
    const settings = db.getAppSettings();
    res.json({ ...settings, script_tag_id: scriptTagId });
  } catch (err) {
    res.json(db.getAppSettings());
  }
});

app.post('/api/settings', requireAuth, (req, res) => {
  const updated = db.updateAppSettings(req.body);
  res.json(updated);
});

// ── Rules ─────────────────────────────────────────────────────────────────────
app.get('/api/rules', requireAuth, (_req, res) => {
  res.json(db.getRules());
});

app.post('/api/rules', requireAuth, (req, res) => {
  const rule = db.createRule(req.body);
  res.status(201).json(rule);
});

app.get('/api/rules/:id', requireAuth, (req, res) => {
  const rule = db.getRule(Number(req.params.id));
  if (!rule) return res.status(404).json({ error: 'Rule not found' });
  res.json(rule);
});

app.put('/api/rules/:id', requireAuth, (req, res) => {
  const updated = db.updateRule(Number(req.params.id), req.body);
  if (!updated) return res.status(404).json({ error: 'Rule not found' });
  res.json(updated);
});

app.delete('/api/rules/:id', requireAuth, (req, res) => {
  const deleted = db.deleteRule(Number(req.params.id));
  if (!deleted) return res.status(404).json({ error: 'Rule not found' });
  res.json({ success: true });
});

// ── Button Config ─────────────────────────────────────────────────────────────
app.get('/api/rules/:id/button', requireAuth, (req, res) => {
  const cfg = db.getButtonConfig(Number(req.params.id));
  if (!cfg) return res.status(404).json({ error: 'Button config not found' });
  res.json(cfg);
});

app.put('/api/rules/:id/button', requireAuth, (req, res) => {
  const cfg = db.upsertButtonConfig(Number(req.params.id), {
    ...req.body,
    ruleId: Number(req.params.id),
  });
  res.json(cfg);
});

// ── Shopify Data ──────────────────────────────────────────────────────────────
app.get('/api/shopify/collections', requireAuth, async (req, res) => {
  try {
    const collections = await shopify.getCollections(req.shop, req.token);
    res.json(collections);
  } catch (err) {
    console.error('Collections error:', err.message);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

app.get('/api/shopify/products', requireAuth, async (req, res) => {
  try {
    const products = await shopify.getProducts(req.shop, req.token);
    res.json(products);
  } catch (err) {
    console.error('Products error:', err.message);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.get('/api/shopify/customer-tags', requireAuth, async (req, res) => {
  try {
    const tags = await shopify.getCustomerTags(req.shop, req.token);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch customer tags' });
  }
});

// ── ScriptTag Management ──────────────────────────────────────────────────────
app.post('/api/shopify/script-tag/register', requireAuth, async (req, res) => {
  try {
    const tag = await shopify.registerScriptTag(req.shop, req.token, HOST);
    db.updateAppSettings({ scriptTagId: String(tag.id) });
    res.json({ success: true, scriptTag: tag });
  } catch (err) {
    console.error('ScriptTag register error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to register script tag' });
  }
});

app.delete('/api/shopify/script-tag', requireAuth, async (req, res) => {
  try {
    const settings = db.getAppSettings();
    if (settings.script_tag_id) {
      await shopify.deleteScriptTag(req.shop, req.token, settings.script_tag_id);
      db.updateAppSettings({ scriptTagId: '' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete script tag' });
  }
});

// ── Clean Uninstall ───────────────────────────────────────────────────────────
// Call this before removing the app. Removes the script tag from Shopify so
// it doesn't linger on the storefront after the app is gone.
app.post('/api/shopify/uninstall', requireAuth, async (req, res) => {
  const results = { scriptTag: false, errors: [] };
  try {
    const settings = db.getAppSettings();
    if (settings.script_tag_id) {
      await shopify.deleteScriptTag(req.shop, req.token, settings.script_tag_id);
      db.updateAppSettings({ scriptTagId: '' });
      results.scriptTag = true;
    } else {
      // No stored ID — search Shopify directly and remove any matching tags
      const removed = await shopify.removeAllScriptTags(req.shop, req.token, HOST);
      results.scriptTag = removed;
    }
  } catch (err) {
    results.errors.push('Script tag: ' + err.message);
  }
  res.json({ success: results.errors.length === 0, results });
});

module.exports.handler = serverless(app);
