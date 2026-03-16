'use strict';

const path = require('path');

// Netlify provides /tmp for writable storage at runtime
const DB_PATH = process.env.DB_PATH || '/tmp/rothley-price-lock.db';

let _db = null;

function getDb() {
  if (_db) return _db;

  // Require here so bundler doesn't try to statically analyse the native module path
  const Database = require('better-sqlite3');
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  migrate(_db);
  return _db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id        TEXT PRIMARY KEY,
      shop      TEXT NOT NULL,
      token     TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS lock_rules (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      name                      TEXT NOT NULL DEFAULT 'New Rule',
      enabled                   INTEGER NOT NULL DEFAULT 1,
      -- What scope
      lock_scope                TEXT NOT NULL DEFAULT 'select',
      lock_products             INTEGER NOT NULL DEFAULT 0,
      lock_collections          INTEGER NOT NULL DEFAULT 1,
      lock_variants             INTEGER NOT NULL DEFAULT 0,
      lock_pages                INTEGER NOT NULL DEFAULT 0,
      lock_blogs                INTEGER NOT NULL DEFAULT 0,
      lock_articles             INTEGER NOT NULL DEFAULT 0,
      -- What to hide/restrict
      hide_prices               INTEGER NOT NULL DEFAULT 1,
      lock_add_to_cart          INTEGER NOT NULL DEFAULT 1,
      prevent_checkout          INTEGER NOT NULL DEFAULT 0,
      whitelist_from_collections INTEGER NOT NULL DEFAULT 0,
      -- Specific IDs/handles (JSON array of strings)
      target_items              TEXT NOT NULL DEFAULT '[]',
      -- Access control
      criteria_type             TEXT NOT NULL DEFAULT 'logged_in',
      criteria_value            TEXT NOT NULL DEFAULT '',
      access_mode               TEXT NOT NULL DEFAULT 'allow',
      disable_login_redirect    INTEGER NOT NULL DEFAULT 0,
      hide_links_from_storefront INTEGER NOT NULL DEFAULT 0,
      created_at                INTEGER DEFAULT (strftime('%s','now')),
      updated_at                INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS button_configs (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id                     INTEGER NOT NULL UNIQUE,
      button_text                 TEXT NOT NULL DEFAULT '🔒 Trade Only Pricing',
      font_size                   INTEGER NOT NULL DEFAULT 16,
      text_color                  TEXT NOT NULL DEFAULT '#ffffff',
      background_color            TEXT NOT NULL DEFAULT '#d94a4a',
      border_radius               INTEGER NOT NULL DEFAULT 8,
      padding_top                 INTEGER NOT NULL DEFAULT 5,
      padding_right               INTEGER NOT NULL DEFAULT 10,
      padding_bottom              INTEGER NOT NULL DEFAULT 5,
      padding_left                INTEGER NOT NULL DEFAULT 10,
      margin_top                  INTEGER NOT NULL DEFAULT 0,
      margin_right                INTEGER NOT NULL DEFAULT 0,
      margin_bottom               INTEGER NOT NULL DEFAULT 0,
      margin_left                 INTEGER NOT NULL DEFAULT 0,
      custom_class                TEXT NOT NULL DEFAULT '',
      login_button_redirect       TEXT NOT NULL DEFAULT 'login_page',
      custom_redirect_url         TEXT NOT NULL DEFAULT '',
      product_grid_container_class TEXT NOT NULL DEFAULT '.card-information',
      product_card_class          TEXT NOT NULL DEFAULT '',
      product_price_item_class    TEXT NOT NULL DEFAULT '.price',
      add_to_cart_form_class      TEXT NOT NULL DEFAULT '',
      quick_add_button_class      TEXT NOT NULL DEFAULT '',
      bulk_add_button_class       TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (rule_id) REFERENCES lock_rules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id              INTEGER PRIMARY KEY DEFAULT 1,
      shop            TEXT NOT NULL DEFAULT '',
      app_enabled     INTEGER NOT NULL DEFAULT 1,
      script_tag_id   TEXT DEFAULT NULL,
      updated_at      INTEGER DEFAULT (strftime('%s','now'))
    );

    INSERT OR IGNORE INTO app_settings (id, shop, app_enabled) VALUES (1, '', 1);
  `);

  // Seed a default rule if none exist
  const count = db.prepare('SELECT COUNT(*) as c FROM lock_rules').get();
  if (count.c === 0) {
    const ruleId = db.prepare(`
      INSERT INTO lock_rules
        (name, enabled, lock_scope, lock_collections, lock_products, hide_prices, lock_add_to_cart,
         criteria_type, criteria_value, access_mode)
      VALUES
        ('Trade Customers Only', 1, 'select', 1, 1, 1, 1, 'customer_tag', 'trade', 'allow')
    `).run().lastInsertRowid;

    db.prepare(`
      INSERT INTO button_configs (rule_id, button_text, background_color)
      VALUES (?, '🔒 Trade Only Pricing', '#d94a4a')
    `).run(ruleId);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRules() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM lock_rules ORDER BY id ASC').all();
  return rows.map(parseRule);
}

function getRule(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM lock_rules WHERE id = ?').get(id);
  return row ? parseRule(row) : null;
}

function createRule(data) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO lock_rules
      (name, enabled, lock_scope, lock_products, lock_collections, lock_variants,
       lock_pages, lock_blogs, lock_articles,
       hide_prices, lock_add_to_cart, prevent_checkout, whitelist_from_collections,
       target_items, criteria_type, criteria_value, access_mode,
       disable_login_redirect, hide_links_from_storefront)
    VALUES
      (@name, @enabled, @lockScope, @lockProducts, @lockCollections, @lockVariants,
       @lockPages, @lockBlogs, @lockArticles,
       @hidePrices, @lockAddToCart, @preventCheckout, @whitelistFromCollections,
       @targetItems, @criteriaType, @criteriaValue, @accessMode,
       @disableLoginRedirect, @hideLinksFromStorefront)
  `);

  const info = stmt.run({
    name: data.name || 'New Rule',
    enabled: data.enabled !== false ? 1 : 0,
    lockScope: data.lockScope || 'select',
    lockProducts: data.lockProducts ? 1 : 0,
    lockCollections: data.lockCollections !== false ? 1 : 0,
    lockVariants: data.lockVariants ? 1 : 0,
    lockPages: data.lockPages ? 1 : 0,
    lockBlogs: data.lockBlogs ? 1 : 0,
    lockArticles: data.lockArticles ? 1 : 0,
    hidePrices: data.hidePrices !== false ? 1 : 0,
    lockAddToCart: data.lockAddToCart !== false ? 1 : 0,
    preventCheckout: data.preventCheckout ? 1 : 0,
    whitelistFromCollections: data.whitelistFromCollections ? 1 : 0,
    targetItems: JSON.stringify(data.targetItems || []),
    criteriaType: data.criteriaType || 'logged_in',
    criteriaValue: data.criteriaValue || '',
    accessMode: data.accessMode || 'allow',
    disableLoginRedirect: data.disableLoginRedirect ? 1 : 0,
    hideLinksFromStorefront: data.hideLinksFromStorefront ? 1 : 0,
  });

  const ruleId = info.lastInsertRowid;

  // Create default button config
  db.prepare(`
    INSERT OR IGNORE INTO button_configs (rule_id) VALUES (?)
  `).run(ruleId);

  return getRule(ruleId);
}

function updateRule(id, data) {
  const db = getDb();
  const existing = getRule(id);
  if (!existing) return null;

  const merged = { ...existing, ...data };

  db.prepare(`
    UPDATE lock_rules SET
      name = @name, enabled = @enabled, lock_scope = @lockScope,
      lock_products = @lockProducts, lock_collections = @lockCollections,
      lock_variants = @lockVariants, lock_pages = @lockPages,
      lock_blogs = @lockBlogs, lock_articles = @lockArticles,
      hide_prices = @hidePrices, lock_add_to_cart = @lockAddToCart,
      prevent_checkout = @preventCheckout,
      whitelist_from_collections = @whitelistFromCollections,
      target_items = @targetItems,
      criteria_type = @criteriaType, criteria_value = @criteriaValue,
      access_mode = @accessMode,
      disable_login_redirect = @disableLoginRedirect,
      hide_links_from_storefront = @hideLinksFromStorefront,
      updated_at = strftime('%s','now')
    WHERE id = @id
  `).run({
    id,
    name: merged.name,
    enabled: merged.enabled ? 1 : 0,
    lockScope: merged.lockScope,
    lockProducts: merged.lockProducts ? 1 : 0,
    lockCollections: merged.lockCollections ? 1 : 0,
    lockVariants: merged.lockVariants ? 1 : 0,
    lockPages: merged.lockPages ? 1 : 0,
    lockBlogs: merged.lockBlogs ? 1 : 0,
    lockArticles: merged.lockArticles ? 1 : 0,
    hidePrices: merged.hidePrices ? 1 : 0,
    lockAddToCart: merged.lockAddToCart ? 1 : 0,
    preventCheckout: merged.preventCheckout ? 1 : 0,
    whitelistFromCollections: merged.whitelistFromCollections ? 1 : 0,
    targetItems: JSON.stringify(merged.targetItems || []),
    criteriaType: merged.criteriaType,
    criteriaValue: merged.criteriaValue,
    accessMode: merged.accessMode,
    disableLoginRedirect: merged.disableLoginRedirect ? 1 : 0,
    hideLinksFromStorefront: merged.hideLinksFromStorefront ? 1 : 0,
  });

  return getRule(id);
}

function deleteRule(id) {
  const db = getDb();
  const info = db.prepare('DELETE FROM lock_rules WHERE id = ?').run(id);
  return info.changes > 0;
}

function getButtonConfig(ruleId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM button_configs WHERE rule_id = ?').get(ruleId);
  return row ? parseButtonConfig(row) : null;
}

function upsertButtonConfig(ruleId, data) {
  const db = getDb();
  const existing = getButtonConfig(ruleId);

  if (existing) {
    db.prepare(`
      UPDATE button_configs SET
        button_text = @buttonText, font_size = @fontSize,
        text_color = @textColor, background_color = @backgroundColor,
        border_radius = @borderRadius,
        padding_top = @paddingTop, padding_right = @paddingRight,
        padding_bottom = @paddingBottom, padding_left = @paddingLeft,
        margin_top = @marginTop, margin_right = @marginRight,
        margin_bottom = @marginBottom, margin_left = @marginLeft,
        custom_class = @customClass,
        login_button_redirect = @loginButtonRedirect,
        custom_redirect_url = @customRedirectUrl,
        product_grid_container_class = @productGridContainerClass,
        product_card_class = @productCardClass,
        product_price_item_class = @productPriceItemClass,
        add_to_cart_form_class = @addToCartFormClass,
        quick_add_button_class = @quickAddButtonClass,
        bulk_add_button_class = @bulkAddButtonClass
      WHERE rule_id = @ruleId
    `).run({ ruleId, ...flatButtonConfig(data) });
  } else {
    db.prepare(`
      INSERT INTO button_configs
        (rule_id, button_text, font_size, text_color, background_color, border_radius,
         padding_top, padding_right, padding_bottom, padding_left,
         margin_top, margin_right, margin_bottom, margin_left,
         custom_class, login_button_redirect, custom_redirect_url,
         product_grid_container_class, product_card_class, product_price_item_class,
         add_to_cart_form_class, quick_add_button_class, bulk_add_button_class)
      VALUES
        (@ruleId, @buttonText, @fontSize, @textColor, @backgroundColor, @borderRadius,
         @paddingTop, @paddingRight, @paddingBottom, @paddingLeft,
         @marginTop, @marginRight, @marginBottom, @marginLeft,
         @customClass, @loginButtonRedirect, @customRedirectUrl,
         @productGridContainerClass, @productCardClass, @productPriceItemClass,
         @addToCartFormClass, @quickAddButtonClass, @bulkAddButtonClass)
    `).run({ ruleId, ...flatButtonConfig(data) });
  }

  return getButtonConfig(ruleId);
}

function getAppSettings() {
  const db = getDb();
  return db.prepare('SELECT * FROM app_settings WHERE id = 1').get();
}

function updateAppSettings(data) {
  const db = getDb();
  db.prepare(`
    UPDATE app_settings SET
      shop = COALESCE(@shop, shop),
      app_enabled = COALESCE(@appEnabled, app_enabled),
      script_tag_id = COALESCE(@scriptTagId, script_tag_id),
      updated_at = strftime('%s','now')
    WHERE id = 1
  `).run({
    shop: data.shop || null,
    appEnabled: data.appEnabled !== undefined ? (data.appEnabled ? 1 : 0) : null,
    scriptTagId: data.scriptTagId || null,
  });
  return getAppSettings();
}

function getSession(shop) {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE shop = ?').get(shop);
}

function saveSession(shop, token) {
  const db = getDb();
  const { v4: uuidv4 } = require('uuid');
  db.prepare(`
    INSERT INTO sessions (id, shop, token)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET token = excluded.token
  `).run(uuidv4(), shop, token);
  // Also update app_settings shop
  db.prepare(`UPDATE app_settings SET shop = ? WHERE id = 1`).run(shop);
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseRule(row) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    lockScope: row.lock_scope,
    lockProducts: row.lock_products === 1,
    lockCollections: row.lock_collections === 1,
    lockVariants: row.lock_variants === 1,
    lockPages: row.lock_pages === 1,
    lockBlogs: row.lock_blogs === 1,
    lockArticles: row.lock_articles === 1,
    hidePrices: row.hide_prices === 1,
    lockAddToCart: row.lock_add_to_cart === 1,
    preventCheckout: row.prevent_checkout === 1,
    whitelistFromCollections: row.whitelist_from_collections === 1,
    targetItems: JSON.parse(row.target_items || '[]'),
    criteriaType: row.criteria_type,
    criteriaValue: row.criteria_value,
    accessMode: row.access_mode,
    disableLoginRedirect: row.disable_login_redirect === 1,
    hideLinksFromStorefront: row.hide_links_from_storefront === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseButtonConfig(row) {
  return {
    id: row.id,
    ruleId: row.rule_id,
    buttonText: row.button_text,
    fontSize: row.font_size,
    textColor: row.text_color,
    backgroundColor: row.background_color,
    borderRadius: row.border_radius,
    paddingTop: row.padding_top,
    paddingRight: row.padding_right,
    paddingBottom: row.padding_bottom,
    paddingLeft: row.padding_left,
    marginTop: row.margin_top,
    marginRight: row.margin_right,
    marginBottom: row.margin_bottom,
    marginLeft: row.margin_left,
    customClass: row.custom_class,
    loginButtonRedirect: row.login_button_redirect,
    customRedirectUrl: row.custom_redirect_url,
    productGridContainerClass: row.product_grid_container_class,
    productCardClass: row.product_card_class,
    productPriceItemClass: row.product_price_item_class,
    addToCartFormClass: row.add_to_cart_form_class,
    quickAddButtonClass: row.quick_add_button_class,
    bulkAddButtonClass: row.bulk_add_button_class,
  };
}

function flatButtonConfig(data) {
  return {
    buttonText: data.buttonText ?? '🔒 Trade Only Pricing',
    fontSize: data.fontSize ?? 16,
    textColor: data.textColor ?? '#ffffff',
    backgroundColor: data.backgroundColor ?? '#d94a4a',
    borderRadius: data.borderRadius ?? 8,
    paddingTop: data.paddingTop ?? 5,
    paddingRight: data.paddingRight ?? 10,
    paddingBottom: data.paddingBottom ?? 5,
    paddingLeft: data.paddingLeft ?? 10,
    marginTop: data.marginTop ?? 0,
    marginRight: data.marginRight ?? 0,
    marginBottom: data.marginBottom ?? 0,
    marginLeft: data.marginLeft ?? 0,
    customClass: data.customClass ?? '',
    loginButtonRedirect: data.loginButtonRedirect ?? 'login_page',
    customRedirectUrl: data.customRedirectUrl ?? '',
    productGridContainerClass: data.productGridContainerClass ?? '.card-information',
    productCardClass: data.productCardClass ?? '',
    productPriceItemClass: data.productPriceItemClass ?? '.price',
    addToCartFormClass: data.addToCartFormClass ?? '',
    quickAddButtonClass: data.quickAddButtonClass ?? '',
    bulkAddButtonClass: data.bulkAddButtonClass ?? '',
  };
}

module.exports = {
  getDb,
  getRules, getRule, createRule, updateRule, deleteRule,
  getButtonConfig, upsertButtonConfig,
  getAppSettings, updateAppSettings,
  getSession, saveSession,
};
