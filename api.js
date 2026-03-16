'use strict';

/**
 * Persistent storage using Netlify Blobs.
 * Replaces SQLite (/tmp is ephemeral on Netlify — data is lost on cold start).
 * Netlify Blobs are persistent, built-in, and require no extra setup.
 *
 * Data structure stored as JSON blobs:
 *   - "rules"    → { nextId: number, items: Rule[] }
 *   - "buttons"  → { [ruleId]: ButtonConfig }
 *   - "settings" → AppSettings
 *   - "sessions" → { [shop]: { token, updatedAt } }
 */

const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'rothley-price-lock';

function store() {
  return getStore(STORE_NAME);
}

// ── Low-level helpers ──────────────────────────────────────────────────────────

async function getBlob(key, defaultValue) {
  try {
    const s = store();
    const val = await s.get(key, { type: 'json' });
    return val !== null && val !== undefined ? val : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function setBlob(key, value) {
  const s = store();
  await s.setJSON(key, value);
}

// ── Sessions ───────────────────────────────────────────────────────────────────

async function getSession(shop) {
  const sessions = await getBlob('sessions', {});
  return sessions[shop] || null;
}

async function saveSession(shop, token) {
  const sessions = await getBlob('sessions', {});
  sessions[shop] = { token, updatedAt: Date.now() };
  await setBlob('sessions', sessions);
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
  return await getBlob('settings', DEFAULT_SETTINGS);
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
  await setBlob('settings', updated);
  return updated;
}

// ── Rules ──────────────────────────────────────────────────────────────────────

const DEFAULT_RULES_STORE = {
  nextId: 1,
  items: [],
};

async function getRulesStore() {
  return await getBlob('rules', DEFAULT_RULES_STORE);
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
  await setBlob('rules', store);

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
  await setBlob('rules', store);
  return updated;
}

async function deleteRule(id) {
  const store = await getRulesStore();
  const before = store.items.length;
  store.items = store.items.filter((r) => r.id !== Number(id));
  await setBlob('rules', store);

  // Also remove button config
  const buttons = await getBlob('buttons', {});
  delete buttons[String(id)];
  await setBlob('buttons', buttons);

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
  const buttons = await getBlob('buttons', {});
  const cfg = buttons[String(ruleId)];
  if (!cfg) return null;
  return { id: Number(ruleId), ruleId: Number(ruleId), ...cfg };
}

async function upsertButtonConfig(ruleId, data) {
  const buttons = await getBlob('buttons', {});
  const existing = buttons[String(ruleId)] || DEFAULT_BTN;
  buttons[String(ruleId)] = { ...existing, ...data, ruleId: Number(ruleId) };
  await setBlob('buttons', buttons);
  return { id: Number(ruleId), ruleId: Number(ruleId), ...buttons[String(ruleId)] };
}

// ── Seed default data if store is empty ───────────────────────────────────────
// Called once on first request if no rules exist yet.

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
