'use strict';

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

// ── Auto-register script tag on cold start ────────────────────────────────────
async function autoRegisterScriptTag() {
  try {
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    const shop = SHOP;
    if (!token || !shop || !HOST) return;
    const tag = await shopify.registerScriptTag(shop, token, HOST);
    await db.updateAppSettings({ scriptTagId: String(tag.id) });
    console.log('Script tag confirmed/registered:', tag.id);
  } catch (err) {
    console.error('Auto-register failed (non-fatal):', err.message);
  }
}
autoRegisterScriptTag();

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// ── Public config endpoint (consumed by storefront script) ────────────────────
app.get('/api/config.json', async (_req, res) => {
  try {
    const rules = (await db.getRules()).filter((r) => r.enabled);
    const configs = {};
    for (const r of rules) {
      configs[r.id] = await db.getButtonConfig(r.id);
    }
    res.json({ rules, buttonConfigs: configs, host: HOST });
  } catch (err) {
    console.error('Config error:', err.message);
    res.json({ rules: [], buttonConfigs: {}, host: HOST });
  }
});

// ── App Settings ──────────────────────────────────────────────────────────────
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
        await db.updateAppSettings({ scriptTagId });
      } else {
        await db.updateAppSettings({ scriptTagId: '' });
      }
    } catch {
      const s = await db.getAppSettings();
      scriptTagId = s.script_tag_id || null;
    }
    const settings = await db.getAppSettings();
    res.json({ ...settings, script_tag_id: scriptTagId });
  } catch (err) {
    res.json(await db.getAppSettings());
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const updated = await db.updateAppSettings(req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rules ─────────────────────────────────────────────────────────────────────
app.get('/api/rules', requireAuth, async (_req, res) => {
  try {
    // Seed default rule on first load if empty
    await db.seedIfEmpty();
    res.json(await db.getRules());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rules', requireAuth, async (req, res) => {
  try {
    const rule = await db.createRule(req.body);
    res.status(201).json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rules/:id', requireAuth, async (req, res) => {
  try {
    const rule = await db.getRule(Number(req.params.id));
    if (!rule) return res.status(404).json({ error: 'Rule not found' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rules/:id', requireAuth, async (req, res) => {
  try {
    const updated = await db.updateRule(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Rule not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rules/:id', requireAuth, async (req, res) => {
  try {
    const deleted = await db.deleteRule(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Button Config ─────────────────────────────────────────────────────────────
app.get('/api/rules/:id/button', requireAuth, async (req, res) => {
  try {
    const cfg = await db.getButtonConfig(Number(req.params.id));
    if (!cfg) return res.status(404).json({ error: 'Button config not found' });
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/rules/:id/button', requireAuth, async (req, res) => {
  try {
    const cfg = await db.upsertButtonConfig(Number(req.params.id), {
      ...req.body,
      ruleId: Number(req.params.id),
    });
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Shopify Data ──────────────────────────────────────────────────────────────
app.get('/api/shopify/collections', requireAuth, async (req, res) => {
  try {
    const collections = await shopify.getCollections(req.shop, req.token);
    res.json(collections);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

app.get('/api/shopify/products', requireAuth, async (req, res) => {
  try {
    const products = await shopify.getProducts(req.shop, req.token);
    res.json(products);
  } catch (err) {
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
    await db.updateAppSettings({ scriptTagId: String(tag.id) });
    res.json({ success: true, scriptTag: tag });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register script tag' });
  }
});

app.delete('/api/shopify/script-tag', requireAuth, async (req, res) => {
  try {
    const settings = await db.getAppSettings();
    if (settings.script_tag_id) {
      await shopify.deleteScriptTag(req.shop, req.token, settings.script_tag_id);
      await db.updateAppSettings({ scriptTagId: '' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete script tag' });
  }
});

// ── Clean Uninstall ───────────────────────────────────────────────────────────
app.post('/api/shopify/uninstall', requireAuth, async (req, res) => {
  const results = { scriptTag: false, errors: [] };
  try {
    const settings = await db.getAppSettings();
    if (settings.script_tag_id) {
      await shopify.deleteScriptTag(req.shop, req.token, settings.script_tag_id);
      await db.updateAppSettings({ scriptTagId: '' });
      results.scriptTag = true;
    } else {
      const removed = await shopify.removeAllScriptTags(req.shop, req.token, HOST);
      results.scriptTag = removed;
    }
  } catch (err) {
    results.errors.push('Script tag: ' + err.message);
  }
  res.json({ success: results.errors.length === 0, results });
});

module.exports.handler = serverless(app);
