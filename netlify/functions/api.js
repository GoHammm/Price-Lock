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

// ── Debug (remove after confirmed working) ───────────────────────────────────
app.get('/api/debug', async (_req, res) => {
  const results = {};
  // Check env vars present
  results.env = {
    SHOPIFY_API_KEY: !!process.env.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET: !!process.env.SHOPIFY_API_SECRET,
    SHOPIFY_ACCESS_TOKEN: !!process.env.SHOPIFY_ACCESS_TOKEN,
    SHOP: process.env.SHOP || 'MISSING',
    HOST: process.env.HOST || 'MISSING',
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || 'MISSING',
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
  };
  // Test Redis
  try {
    await db.getAppSettings();
    results.redis = 'OK';
  } catch (e) {
    results.redis = 'FAILED: ' + e.message;
  }
  // Test Shopify token validity
  try {
    const token = process.env.SHOPIFY_ACCESS_TOKEN;
    const shop = process.env.SHOP;
    if (token && shop) {
      const r = await fetch(`https://${shop}/admin/api/2025-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': token }
      });
      results.shopifyToken = r.ok ? 'OK' : 'EXPIRED or INVALID (status ' + r.status + ')';
    } else {
      results.shopifyToken = 'MISSING env vars';
    }
  } catch (e) {
    results.shopifyToken = 'FAILED: ' + e.message;
  }
  res.json(results);
});

// ── Public config endpoint (consumed by storefront script) ────────────────────
app.get('/api/config.json', async (_req, res) => {
  // Set CORS headers so the Shopify storefront can fetch this
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    // Seed default rule if Redis is empty (first deploy / fresh start)
    await db.seedIfEmpty();
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

// ── Script Status (fast Redis-only, used by UI badge) ────────────────────────
app.get('/api/script-status', requireAuth, async (_req, res) => {
  try {
    const settings = await db.getAppSettings();
    const registered = !!(settings && settings.script_tag_id);
    res.json({ registered, scriptTagId: settings.script_tag_id || null });
  } catch (err) {
    res.json({ registered: false, scriptTagId: null });
  }
});

// ── App Settings ──────────────────────────────────────────────────────────────
app.get('/api/settings', requireAuth, async (_req, res) => {
  try {
    // Fast Redis-only read — no Shopify API call to avoid timeouts
    const settings = await db.getAppSettings();
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ── Theme Snippet Inject / Remove (flash-fix CSS) ───────────────────────────
// The snippet is injected as the very first line of theme.liquid <head> so
// prices are hidden before the browser paints a single pixel.

const SNIPPET_START = '<!-- rpl-flash-fix:start -->';
const SNIPPET_END   = '<!-- rpl-flash-fix:end -->';

function buildFlashFixSnippet() {
  return `${SNIPPET_START}
{%- comment -%}Rothley Price Lock — flash-fix CSS (do not edit this block){%- endcomment -%}
<style id="rpl-flash-fix">
  .rpl-hiding .price-wrapper,
  .rpl-hiding .price,
  .rpl-hiding .product__price,
  .rpl-hiding [class*="Price__"],
  .rpl-hiding form[action="/cart/add"] [type="submit"],
  .rpl-hiding form[action="/cart/add"] button[name="add"],
  .rpl-hiding .product-form__submit,
  .rpl-hiding .quick-add__submit {
    visibility: hidden !important;
  }
</style>
<script>document.documentElement.className += ' rpl-hiding';</script>
${SNIPPET_END}`;
}

async function getThemeAsset(shop, token, themeId, assetKey) {
  const url = `https://${shop}/admin/api/2025-01/themes/${themeId}/assets.json?asset[key]=${encodeURIComponent(assetKey)}`;
  const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  if (!r.ok) throw new Error(`Asset fetch failed: ${r.status}`);
  const data = await r.json();
  return data.asset && data.asset.value ? data.asset.value : null;
}

async function putThemeAsset(shop, token, themeId, assetKey, value) {
  const url = `https://${shop}/admin/api/2025-01/themes/${themeId}/assets.json`;
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: { key: assetKey, value } }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Asset update failed: ${r.status} ${body}`);
  }
  return true;
}

async function getMainThemeId(shop, token) {
  // Check stored theme ID first
  const settings = await db.getAppSettings();
  if (settings.themeId) return settings.themeId;
  // Otherwise fetch from Shopify
  const url = `https://${shop}/admin/api/2025-01/themes.json`;
  const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
  if (!r.ok) throw new Error('Could not fetch themes');
  const data = await r.json();
  const main = (data.themes || []).find(t => t.role === 'main');
  if (!main) throw new Error('No main theme found');
  return String(main.id);
}

app.post('/api/theme/inject', requireAuth, async (req, res) => {
  try {
    const shop = req.shop;
    const token = req.token;
    const themeId = req.body.themeId || await getMainThemeId(shop, token);
    let liquid = await getThemeAsset(shop, token, themeId, 'layout/theme.liquid');
    if (!liquid) return res.status(404).json({ error: 'theme.liquid not found' });

    // Remove any existing snippet first
    const re = new RegExp(`${SNIPPET_START}[\\s\\S]*?${SNIPPET_END}\\n?`, 'g');
    liquid = liquid.replace(re, '');

    // Inject as very first thing inside <head>
    const snippet = buildFlashFixSnippet() + '\n';
    if (liquid.includes('<head>')) {
      liquid = liquid.replace('<head>', '<head>\n' + snippet);
    } else {
      liquid = snippet + liquid; // fallback: prepend
    }

    await putThemeAsset(shop, token, themeId, 'layout/theme.liquid', liquid);
    await db.updateAppSettings({ themeSnippetInjected: true, themeId: String(themeId) });
    res.json({ success: true, themeId });
  } catch (err) {
    console.error('Theme inject error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/theme/remove', requireAuth, async (req, res) => {
  try {
    const shop = req.shop;
    const token = req.token;
    const themeId = req.body.themeId || await getMainThemeId(shop, token);
    let liquid = await getThemeAsset(shop, token, themeId, 'layout/theme.liquid');
    if (!liquid) return res.status(404).json({ error: 'theme.liquid not found' });

    const re = new RegExp(`${SNIPPET_START}[\\s\\S]*?${SNIPPET_END}\\n?`, 'g');
    const cleaned = liquid.replace(re, '');
    // Also clean up the extra \n we added after <head>
    const final = cleaned.replace('<head>\n\n', '<head>\n');
    await putThemeAsset(shop, token, themeId, 'layout/theme.liquid', final);
    await db.updateAppSettings({ themeSnippetInjected: false });
    res.json({ success: true });
  } catch (err) {
    console.error('Theme remove error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/theme/status', requireAuth, async (_req, res) => {
  try {
    const settings = await db.getAppSettings();
    res.json({ injected: !!(settings && settings.themeSnippetInjected) });
  } catch (err) {
    res.json({ injected: false });
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
