'use strict';

/**
 * Persistent storage using Upstash Redis REST API.
 * Simple fetch-based calls — no native dependencies, works on any serverless platform.
 *
 * Keys:
 *   rpl:rules    → { nextId: number, items: Rule[] }
 *   rpl:buttons  → { [ruleId]: ButtonConfig }
 *   rpl:settings → AppSettings
 *   rpl:sessions → { [shop]: { token, updatedAt } }
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  if (data.result === null || data.result === undefined) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

async function redisSet(key, value) {
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(JSON.stringify(value)),
  });
  return res.ok;
}

async function getKey(key, defaultValue) {
  const val = await redisGet(key);
  return val !== null ? val : defaultValue;
}

// ── Sessions ───────────────────────────────────────────────────────────────────

async function getSession(shop) {
  const sessions = await getKey('rpl:sessions', {});
  return sessions[shop] || null;
}

async function saveSession(shop, token) {
  const sessions = await getKey('rpl:sessions', {});
  sessions[shop] = { token, updatedAt: Date.now() };
  await redisSet('rpl:sessions', sessions);
}

// ── App Settings ───────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  id: 1,
  shop: '',
  app_enabled: 1,
  script_tag_id: null,
  updated_at: Math.floor(Date.now() / 1000),
};

async function getAppSettings() {
  return await getKey('rpl:settings', DEFAULT_SETTINGS);
}

async function updateAppSettings(data) {
  const current = await getAppSettings();
  const updated = {
    ...current,
    shop: data.shop !== undefined ? data.shop : current.shop,
    app_enabled: data.appEnabled !== undefined ? (data.appEnabled ? 1 : 0) : current.app_enabled,
    script_tag_id: data.scriptTagId !== undefined ? (data.scriptTagId || null) : current.script_tag_id,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await redisSet('rpl:settings', updated);
  return updated;
}

// ── Rules ──────────────────────────────────────────────────────────────────────

async function getRulesStore() {
  return await getKey('rpl:rules', { nextId: 1, items: [] });
}

async function getRules() {
  const store = await getRulesStore();
  return store.items || [];
}

async function getRule(id) {
  const rules = await getRules();
  return rules.find((r) => r.id === Number(id)) || null;
}

async function createRule(data) {
  const store = await getRulesStore();
  const id = store.nextId;
  const now = Math.floor(Date.now() / 1000);

  const rule = {
    id,
    name: data.name || 'New Rule',
    enabled: data.enabled !== false,
    lockScope: data.lockScope || 'select',
    lockProducts: !!data.lockProducts,
    lockCollections: data.lockCollections !== false,
    lockVariants: !!data.lockVariants,
    lockPages: !!data.lockPages,
    lockBlogs: !!data.lockBlogs,
    lockArticles: !!data.lockArticles,
    hidePrices: data.hidePrices !== false,
    lockAddToCart: data.lockAddToCart !== false,
    preventCheckout: !!data.preventCheckout,
    whitelistFromCollections: !!data.whitelistFromCollections,
    targetItems: data.targetItems || [],
    criteriaType: data.criteriaType || 'logged_in',
    criteriaValue: data.criteriaValue || '',
    accessMode: data.accessMode || 'allow',
    disableLoginRedirect: !!data.disableLoginRedirect,
    hideLinksFromStorefront: !!data.hideLinksFromStorefront,
    createdAt: now,
    updatedAt: now,
  };

  store.items.push(rule);
  store.nextId = id + 1;
  await redisSet('rpl:rules', store);

  // Create default button config
  await upsertButtonConfig(id, {});

  return rule;
}

async function updateRule(id, data) {
  const store = await getRulesStore();
  const idx = store.items.findIndex((r) => r.id === Number(id));
  if (idx === -1) return null;

  const existing = store.items[idx];
  const updated = {
    ...existing,
    name: data.name !== undefined ? data.name : existing.name,
    enabled: data.enabled !== undefined ? !!data.enabled : existing.enabled,
    lockScope: data.lockScope !== undefined ? data.lockScope : existing.lockScope,
    lockProducts: data.lockProducts !== undefined ? !!data.lockProducts : existing.lockProducts,
    lockCollections: data.lockCollections !== undefined ? !!data.lockCollections : existing.lockCollections,
    lockVariants: data.lockVariants !== undefined ? !!data.lockVariants : existing.lockVariants,
    lockPages: data.lockPages !== undefined ? !!data.lockPages : existing.lockPages,
    lockBlogs: data.lockBlogs !== undefined ? !!data.lockBlogs : existing.lockBlogs,
    lockArticles: data.lockArticles !== undefined ? !!data.lockArticles : existing.lockArticles,
    hidePrices: data.hidePrices !== undefined ? !!data.hidePrices : existing.hidePrices,
    lockAddToCart: data.lockAddToCart !== undefined ? !!data.lockAddToCart : existing.lockAddToCart,
    preventCheckout: data.preventCheckout !== undefined ? !!data.preventCheckout : existing.preventCheckout,
    whitelistFromCollections: data.whitelistFromCollections !== undefined ? !!data.whitelistFromCollections : existing.whitelistFromCollections,
    targetItems: data.targetItems !== undefined ? data.targetItems : existing.targetItems,
    criteriaType: data.criteriaType !== undefined ? data.criteriaType : existing.criteriaType,
    criteriaValue: data.criteriaValue !== undefined ? data.criteriaValue : existing.criteriaValue,
    accessMode: data.accessMode !== undefined ? data.accessMode : existing.accessMode,
    disableLoginRedirect: data.disableLoginRedirect !== undefined ? !!data.disableLoginRedirect : existing.disableLoginRedirect,
    hideLinksFromStorefront: data.hideLinksFromStorefront !== undefined ? !!data.hideLinksFromStorefront : existing.hideLinksFromStorefront,
    updatedAt: Math.floor(Date.now() / 1000),
  };

  store.items[idx] = updated;
  await redisSet('rpl:rules', store);
  return updated;
}

async function deleteRule(id) {
  const store = await getRulesStore();
  const before = store.items.length;
  store.items = store.items.filter((r) => r.id !== Number(id));
  await redisSet('rpl:rules', store);

  const buttons = await getKey('rpl:buttons', {});
  delete buttons[String(id)];
  await redisSet('rpl:buttons', buttons);

  return store.items.length < before;
}

// ── Button Configs ─────────────────────────────────────────────────────────────

const DEFAULT_BTN = {
  buttonText: '🔒 Trade Only Pricing',
  fontSize: 16,
  textColor: '#ffffff',
  backgroundColor: '#d94a4a',
  borderRadius: 8,
  paddingTop: 5,
  paddingRight: 10,
  paddingBottom: 5,
  paddingLeft: 10,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  customClass: '',
  loginButtonRedirect: 'login_page',
  customRedirectUrl: '',
  productGridContainerClass: '.card-information',
  productCardClass: '',
  productPriceItemClass: '.price',
  addToCartFormClass: '',
  quickAddButtonClass: '',
  bulkAddButtonClass: '',
};

async function getButtonConfig(ruleId) {
  const buttons = await getKey('rpl:buttons', {});
  const cfg = buttons[String(ruleId)];
  if (!cfg) return null;
  return { id: Number(ruleId), ruleId: Number(ruleId), ...cfg };
}

async function upsertButtonConfig(ruleId, data) {
  const buttons = await getKey('rpl:buttons', {});
  const existing = buttons[String(ruleId)] || { ...DEFAULT_BTN };
  buttons[String(ruleId)] = { ...existing, ...data, ruleId: Number(ruleId) };
  await redisSet('rpl:buttons', buttons);
  return { id: Number(ruleId), ruleId: Number(ruleId), ...buttons[String(ruleId)] };
}

// ── Seed default data if empty ─────────────────────────────────────────────────

async function seedIfEmpty() {
  const rules = await getRules();
  if (rules.length === 0) {
    await createRule({
      name: 'Trade Customers Only',
      enabled: true,
      lockScope: 'select',
      lockCollections: true,
      lockProducts: true,
      hidePrices: true,
      lockAddToCart: true,
      criteriaType: 'customer_tag',
      criteriaValue: 'trade',
      accessMode: 'allow',
    });
  }
}

module.exports = {
  getRules, getRule, createRule, updateRule, deleteRule,
  getButtonConfig, upsertButtonConfig,
  getAppSettings, updateAppSettings,
  getSession, saveSession,
  seedIfEmpty,
};
