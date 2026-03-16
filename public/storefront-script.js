/**
 * Rothley Price Lock — Storefront Script
 * Injected via Shopify ScriptTag API into the Rothley storefront.
 *
 * This script:
 *  1. Fetches rules & button configs from the app backend
 *  2. Reads customer session data from Shopify's window.meta (logged-in state, tags)
 *  3. For each rule that should apply: hides prices and replaces Add to Cart
 *
 * No jQuery dependency. Vanilla JS ES5-compatible.
 */
(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  var APP_HOST = 'REPLACE_WITH_HOST'; // Injected at build time via vite

  // ── Customer context (Shopify exposes this on the storefront) ────────────
  var customer = window.ShopifyAnalytics && window.ShopifyAnalytics.meta
    ? window.ShopifyAnalytics.meta.page
    : {};

  var customerData = {
    loggedIn: !!(window.Shopify && window.Shopify.customer),
    tags: [],
    email: '',
    customerId: null,
  };

  if (window.Shopify && window.Shopify.customer) {
    customerData.tags = (window.Shopify.customer.tags || '').split(',').map(function (t) { return t.trim(); });
    customerData.email = window.Shopify.customer.email || '';
    customerData.customerId = window.Shopify.customer.id || null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fetchJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          try { cb(null, JSON.parse(xhr.responseText)); }
          catch (e) { cb(e); }
        } else {
          cb(new Error('HTTP ' + xhr.status));
        }
      }
    };
    xhr.send();
  }

  function getPageContext() {
    var meta = window.meta || {};
    var ctx = {
      pageType: meta.page && meta.page.pageType,
      resourceId: null,
      resourceHandle: null,
      collectionHandle: null,
    };

    // Try ShopifyAnalytics
    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta) {
      var page = window.ShopifyAnalytics.meta.page || {};
      ctx.pageType = page.pageType || ctx.pageType;
      ctx.resourceId = page.resourceId || null;
    }

    // Dawn/Debut theme exposes window.meta
    if (window.meta) {
      ctx.pageType = window.meta.page && window.meta.page.pageType;
    }

    // Fallback: detect from URL
    var path = window.location.pathname;
    if (!ctx.pageType) {
      if (/\/products\//.test(path)) ctx.pageType = 'product';
      else if (/\/collections\//.test(path)) ctx.pageType = 'collection';
      else if (/\/pages\//.test(path)) ctx.pageType = 'page';
      else if (/\/blogs\//.test(path)) ctx.pageType = 'blog';
      else ctx.pageType = 'index';
    }

    // Extract handle from URL
    var match = path.match(/\/collections\/([^/]+)/);
    if (match) ctx.collectionHandle = match[1];
    match = path.match(/\/products\/([^/]+)/);
    if (match) ctx.resourceHandle = match[1];

    return ctx;
  }

  // ── Check if customer satisfies a rule's access criteria ─────────────────
  function customerPassesCriteria(rule) {
    var type = rule.criteriaType;
    var value = (rule.criteriaValue || '').trim().toLowerCase();

    if (type === 'logged_in') {
      return customerData.loggedIn;
    }

    if (type === 'customer_tag') {
      if (!customerData.loggedIn) return false;
      return customerData.tags.some(function (t) {
        return t.toLowerCase() === value;
      });
    }

    if (type === 'email_domain') {
      if (!customerData.email) return false;
      var domain = customerData.email.split('@')[1] || '';
      return domain.toLowerCase() === value;
    }

    if (type === 'selected_customer') {
      if (!customerData.customerId) return false;
      var ids = value.split(',').map(function (v) { return v.trim(); });
      return ids.indexOf(String(customerData.customerId)) !== -1;
    }

    if (type === 'passcode') {
      var stored = localStorage.getItem('rpl_passcode_' + rule.id);
      return stored === value;
    }

    if (type === 'country') {
      // Shopify exposes country via Shopify.locale or ShopifyAnalytics
      var country = (window.Shopify && window.Shopify.country) || '';
      return country.toLowerCase() === value;
    }

    return false;
  }

  // ── Determine if a rule should lock THIS page ────────────────────────────
  function ruleShouldApply(rule, ctx) {
    if (rule.lockScope === 'entire_store') return true;

    // For "select" scope, check what types are locked
    if (ctx.pageType === 'product' && rule.lockProducts) return true;
    if (ctx.pageType === 'collection' && rule.lockCollections) return true;
    if (ctx.pageType === 'blog' && rule.lockBlogs) return true;
    if (ctx.pageType === 'article' && rule.lockArticles) return true;
    if (ctx.pageType === 'page' && rule.lockPages) return true;

    // targetItems: check if current page's handle or ID is in the list
    if (rule.targetItems && rule.targetItems.length > 0) {
      var currentHandle = ctx.collectionHandle || ctx.resourceHandle || '';
      return rule.targetItems.some(function (item) {
        return String(item) === String(ctx.resourceId) ||
          item === currentHandle;
      });
    }

    return false;
  }

  // ── Apply locks for a rule ────────────────────────────────────────────────
  function applyRule(rule, btnCfg) {
    var shouldLock;

    if (rule.accessMode === 'allow') {
      // ALLOW: lock if customer does NOT pass
      shouldLock = !customerPassesCriteria(rule);
    } else {
      // RESTRICT: lock if customer DOES pass
      shouldLock = customerPassesCriteria(rule);
    }

    if (!shouldLock) return;

    // ── Hide prices ───────────────────────────────────────────────────────
    if (rule.hidePrices) {
      var priceSelector = (btnCfg && btnCfg.productPriceItemClass) || '.price';
      var priceEls = document.querySelectorAll(priceSelector);
      [].forEach.call(priceEls, function (el) {
        el.style.display = 'none';
      });
    }

    // ── Lock Add to Cart ──────────────────────────────────────────────────
    if (rule.lockAddToCart) {
      var redirectUrl = '/account/login';
      if (btnCfg) {
        if (btnCfg.loginButtonRedirect === 'custom' && btnCfg.customRedirectUrl) {
          redirectUrl = btnCfg.customRedirectUrl;
        } else if (btnCfg.loginButtonRedirect === 'login_page') {
          redirectUrl = '/account/login';
        }
      }

      var buttonHtml = buildButtonHtml(btnCfg, redirectUrl);

      // Replace standard add-to-cart buttons
      var addToCartForms = document.querySelectorAll(
        (btnCfg && btnCfg.addToCartFormClass) || 'form[action="/cart/add"]'
      );
      [].forEach.call(addToCartForms, function (form) {
        var submitBtns = form.querySelectorAll('[type="submit"], [name="add"]');
        [].forEach.call(submitBtns, function (btn) {
          btn.style.display = 'none';
        });
        if (!form.querySelector('.rpl-lock-btn')) {
          form.insertAdjacentHTML('beforeend', buttonHtml);
        }
      });

      // Replace quick-add buttons
      var quickAddSelector = (btnCfg && btnCfg.quickAddButtonClass) || '.quick-add__submit';
      var quickBtns = document.querySelectorAll(quickAddSelector);
      [].forEach.call(quickBtns, function (btn) {
        btn.style.display = 'none';
        if (!btn.nextSibling || !btn.nextSibling.classList || !btn.nextSibling.classList.contains('rpl-lock-btn')) {
          btn.insertAdjacentHTML('afterend', buttonHtml);
        }
      });

      // Replace bulk-add buttons
      if (btnCfg && btnCfg.bulkAddButtonClass) {
        var bulkBtns = document.querySelectorAll(btnCfg.bulkAddButtonClass);
        [].forEach.call(bulkBtns, function (btn) {
          btn.style.display = 'none';
          if (!btn.nextSibling || !btn.nextSibling.classList || !btn.nextSibling.classList.contains('rpl-lock-btn')) {
            btn.insertAdjacentHTML('afterend', buttonHtml);
          }
        });
      }
    }

    // ── Prevent checkout ──────────────────────────────────────────────────
    if (rule.preventCheckout) {
      var checkoutBtns = document.querySelectorAll('[name="checkout"], .cart__checkout, #checkout');
      [].forEach.call(checkoutBtns, function (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Please log in to checkout';
      });
    }

    // ── Hide collection links from storefront ─────────────────────────────
    if (rule.hideLinksFromStorefront) {
      var navLinks = document.querySelectorAll(
        'a[href*="/collections/"], a[href*="/products/"]'
      );
      [].forEach.call(navLinks, function (link) {
        var card = link.closest('.card, .product-card, article');
        if (card) card.style.display = 'none';
      });
    }

    // ── Passcode prompt ───────────────────────────────────────────────────
    if (rule.criteriaType === 'passcode' && shouldLock) {
      showPasscodePrompt(rule);
    }
  }

  function buildButtonHtml(cfg, redirectUrl) {
    var text = (cfg && cfg.buttonText) || '🔒 Login to View Pricing';
    var fontSize = (cfg && cfg.fontSize) || 16;
    var textColor = (cfg && cfg.textColor) || '#ffffff';
    var bgColor = (cfg && cfg.backgroundColor) || '#d94a4a';
    var borderRadius = (cfg && cfg.borderRadius) || 8;
    var pt = (cfg && cfg.paddingTop) || 5;
    var pr = (cfg && cfg.paddingRight) || 10;
    var pb = (cfg && cfg.paddingBottom) || 5;
    var pl = (cfg && cfg.paddingLeft) || 10;
    var mt = (cfg && cfg.marginTop) || 0;
    var mr = (cfg && cfg.marginRight) || 0;
    var mb = (cfg && cfg.marginBottom) || 0;
    var ml = (cfg && cfg.marginLeft) || 0;
    var customClass = (cfg && cfg.customClass) ? ' ' + cfg.customClass : '';

    return '<a href="' + redirectUrl + '" class="rpl-lock-btn' + customClass + '" style="' +
      'display:inline-block;' +
      'font-size:' + fontSize + 'px;' +
      'color:' + textColor + ';' +
      'background-color:' + bgColor + ';' +
      'border-radius:' + borderRadius + 'px;' +
      'padding:' + pt + 'px ' + pr + 'px ' + pb + 'px ' + pl + 'px;' +
      'margin:' + mt + 'px ' + mr + 'px ' + mb + 'px ' + ml + 'px;' +
      'text-decoration:none;cursor:pointer;font-weight:600;' +
      'border:none;text-align:center;">' + text + '</a>';
  }

  function showPasscodePrompt(rule) {
    if (document.getElementById('rpl-passcode-overlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'rpl-passcode-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;' +
      'background:rgba(0,0,0,0.7);z-index:99999;' +
      'display:flex;align-items:center;justify-content:center;';

    overlay.innerHTML =
      '<div style="background:#fff;padding:32px;border-radius:12px;max-width:400px;width:90%;text-align:center;">' +
      '<h2 style="margin:0 0 8px;font-size:22px;">Trade Access Required</h2>' +
      '<p style="color:#666;margin:0 0 20px;">Enter your trade passcode to view pricing and add items to cart.</p>' +
      '<input id="rpl-passcode-input" type="password" placeholder="Enter passcode" ' +
      'style="width:100%;padding:10px 14px;border:2px solid #ddd;border-radius:8px;font-size:16px;box-sizing:border-box;margin-bottom:12px;">' +
      '<div id="rpl-passcode-error" style="color:#e53e3e;margin-bottom:12px;display:none;">Incorrect passcode. Please try again.</div>' +
      '<button id="rpl-passcode-submit" ' +
      'style="background:#d94a4a;color:#fff;padding:10px 24px;border:none;border-radius:8px;font-size:16px;cursor:pointer;width:100%;">Unlock</button>' +
      '</div>';

    document.body.appendChild(overlay);

    document.getElementById('rpl-passcode-submit').addEventListener('click', function () {
      var entered = document.getElementById('rpl-passcode-input').value;
      var expected = (rule.criteriaValue || '').trim();
      if (entered === expected) {
        localStorage.setItem('rpl_passcode_' + rule.id, entered);
        overlay.remove();
        // Re-run to update state
        window.location.reload();
      } else {
        document.getElementById('rpl-passcode-error').style.display = 'block';
      }
    });

    document.getElementById('rpl-passcode-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        document.getElementById('rpl-passcode-submit').click();
      }
    });
  }

  // ── Run on DOM ready ──────────────────────────────────────────────────────
  function init(appConfig) {
    var rules = appConfig.rules || [];
    var buttonConfigs = appConfig.buttonConfigs || {};
    var ctx = getPageContext();

    rules.forEach(function (rule) {
      if (!rule.enabled) return;
      if (!ruleShouldApply(rule, ctx)) return;
      var btnCfg = buttonConfigs[rule.id] || null;
      applyRule(rule, btnCfg);
    });
  }

  // Observe DOM for dynamic content (AJAX product grids, infinite scroll etc.)
  function observeAndReinit(appConfig) {
    if (!window.MutationObserver) return;
    var debounceTimer;
    var observer = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { init(appConfig); }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function bootstrap() {
    fetchJSON(APP_HOST + '/api/config.json', function (err, config) {
      if (err) {
        console.warn('[Rothley Price Lock] Could not load config:', err.message);
        return;
      }
      init(config);
      observeAndReinit(config);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
