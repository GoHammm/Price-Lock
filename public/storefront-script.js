/**
 * Rothley Price Lock — Storefront Script
 * Injected via Shopify ScriptTag API into the Rothley storefront.
 *
 * Flash-free approach:
 *  1. Immediately inject a <style> tag that hides prices + cart buttons
 *  2. Fetch config from app backend (fast CDN-cached endpoint)
 *  3. If customer PASSES criteria (allowed to see prices) → remove the hiding style
 *  4. If customer FAILS criteria (should be locked) → replace buttons with lock button
 *  5. Safety timeout: always reveal everything after 3s so a slow/failed fetch
 *     never leaves the store broken
 *
 * No jQuery. Vanilla ES5-compatible.
 */
(function () {
  'use strict';

  var APP_HOST = 'https://sensational-kringle-35b975.netlify.app';

  // ── Flash-fix: the <head> snippet adds class 'rpl-hiding' to <html> ──────────
  // That CSS is already hiding prices. Our job here is just to REMOVE the class
  // once we know whether to lock or allow.

  function reveal() {
    document.documentElement.classList.remove('rpl-hiding');
  }

  // Safety net: always reveal after 3s in case config fetch is slow or fails
  var safetyTimer = setTimeout(reveal, 3000);

  // ── Customer context ──────────────────────────────────────────────────────────
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

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function fetchJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 5000; // 5s max — if backend is slow, safety timer will kick in
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
    xhr.ontimeout = function () { cb(new Error('timeout')); };
    xhr.send();
  }

  function getPageContext() {
    var ctx = { pageType: null, resourceId: null, resourceHandle: null, collectionHandle: null };

    if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta) {
      var page = window.ShopifyAnalytics.meta.page || {};
      ctx.pageType = page.pageType || null;
      ctx.resourceId = page.resourceId || null;
    }
    if (window.meta && window.meta.page) {
      ctx.pageType = ctx.pageType || window.meta.page.pageType;
    }

    var path = window.location.pathname;
    if (!ctx.pageType) {
      if (/\/products\//.test(path)) ctx.pageType = 'product';
      else if (/\/collections\//.test(path)) ctx.pageType = 'collection';
      else if (/\/pages\//.test(path)) ctx.pageType = 'page';
      else if (/\/blogs\//.test(path)) ctx.pageType = 'blog';
      else ctx.pageType = 'index';
    }

    var match = path.match(/\/collections\/([^/]+)/);
    if (match) ctx.collectionHandle = match[1];
    match = path.match(/\/products\/([^/]+)/);
    if (match) ctx.resourceHandle = match[1];

    return ctx;
  }

  // ── Criteria check ────────────────────────────────────────────────────────────
  function customerPassesCriteria(rule) {
    var type = rule.criteriaType;
    var value = (rule.criteriaValue || '').trim().toLowerCase();

    if (type === 'logged_in') return customerData.loggedIn;

    if (type === 'customer_tag') {
      if (!customerData.loggedIn) return false;
      return customerData.tags.some(function (t) { return t.toLowerCase() === value; });
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
      var country = (window.Shopify && window.Shopify.country) || '';
      return country.toLowerCase() === value;
    }

    return false;
  }

  // ── Page scope check ──────────────────────────────────────────────────────────
  function ruleShouldApply(rule, ctx) {
    if (rule.lockScope === 'entire_store') return true;

    if (rule.targetItems && rule.targetItems.length > 0) {
      var currentHandle = ctx.collectionHandle || ctx.resourceHandle || '';
      return rule.targetItems.some(function (item) {
        return String(item) === String(ctx.resourceId) || item === currentHandle;
      });
    }

    if (ctx.pageType === 'product' && rule.lockProducts) return true;
    if (ctx.pageType === 'collection' && rule.lockCollections) return true;
    if (ctx.pageType === 'blog' && rule.lockBlogs) return true;
    if (ctx.pageType === 'article' && rule.lockArticles) return true;
    if (ctx.pageType === 'page' && rule.lockPages) return true;

    return false;
  }

  // ── Build lock button HTML ────────────────────────────────────────────────────
  function buildButtonHtml(cfg, redirectUrl) {
    var text = (cfg && cfg.buttonText) || '🔒 Login to View Pricing';
    var fontSize = (cfg && cfg.fontSize) || 16;
    var textColor = (cfg && cfg.textColor) || '#ffffff';
    var bgColor = (cfg && cfg.backgroundColor) || '#d94a4a';
    var borderRadius = (cfg && cfg.borderRadius) || 8;
    var pt = (cfg && cfg.paddingTop) !== undefined ? cfg.paddingTop : 12;
    var pr = (cfg && cfg.paddingRight) !== undefined ? cfg.paddingRight : 20;
    var pb = (cfg && cfg.paddingBottom) !== undefined ? cfg.paddingBottom : 12;
    var pl = (cfg && cfg.paddingLeft) !== undefined ? cfg.paddingLeft : 20;
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
      'text-decoration:none;cursor:pointer;font-weight:600;width:100%;' +
      'border:none;text-align:center;box-sizing:border-box;">' + text + '</a>';
  }

  // ── Apply a rule's locks ──────────────────────────────────────────────────────
  function applyRule(rule, btnCfg) {
    var shouldLock;
    if (rule.accessMode === 'allow') {
      shouldLock = !customerPassesCriteria(rule);
    } else {
      shouldLock = customerPassesCriteria(rule);
    }

    if (!shouldLock) return false; // customer can see prices — signal "no lock"
    return true; // signal "locked"
  }

  // ── DOM manipulation — runs after we know who needs locking ──────────────────
  function applyDomChanges(rule, btnCfg) {
    var redirectUrl = '/account/login';
    if (btnCfg) {
      if (btnCfg.loginButtonRedirect === 'custom' && btnCfg.customRedirectUrl) {
        redirectUrl = btnCfg.customRedirectUrl;
      }
    }

    var buttonHtml = buildButtonHtml(btnCfg, redirectUrl);

    // Hide prices
    if (rule.hidePrices) {
      var priceSelector = (btnCfg && btnCfg.productPriceItemClass) || '.price-wrapper';
      var priceEls = document.querySelectorAll(priceSelector);
      [].forEach.call(priceEls, function (el) {
        el.style.setProperty('display', 'none', 'important');
      });
    }

    // Replace Add to Cart buttons
    if (rule.lockAddToCart) {
      var formSelector = (btnCfg && btnCfg.addToCartFormClass) || 'form[action="/cart/add"]';
      var forms = document.querySelectorAll(formSelector);
      [].forEach.call(forms, function (form) {
        var submitBtns = form.querySelectorAll('[type="submit"][name="add"], .product-form__submit');
        [].forEach.call(submitBtns, function (btn) {
          btn.style.setProperty('display', 'none', 'important');
        });
        if (!form.querySelector('.rpl-lock-btn')) {
          form.insertAdjacentHTML('beforeend', buttonHtml);
        }
      });

      // Quick-add buttons
      var quickSelector = (btnCfg && btnCfg.quickAddButtonClass) || '.quick-add__submit';
      var quickBtns = document.querySelectorAll(quickSelector);
      [].forEach.call(quickBtns, function (btn) {
        btn.style.setProperty('display', 'none', 'important');
        if (!btn.nextSibling || !btn.nextSibling.classList || !btn.nextSibling.classList.contains('rpl-lock-btn')) {
          btn.insertAdjacentHTML('afterend', buttonHtml);
        }
      });

      // Bulk-add buttons
      if (btnCfg && btnCfg.bulkAddButtonClass) {
        var bulkBtns = document.querySelectorAll(btnCfg.bulkAddButtonClass);
        [].forEach.call(bulkBtns, function (btn) {
          btn.style.setProperty('display', 'none', 'important');
          if (!btn.nextSibling || !btn.nextSibling.classList || !btn.nextSibling.classList.contains('rpl-lock-btn')) {
            btn.insertAdjacentHTML('afterend', buttonHtml);
          }
        });
      }
    }

    // Prevent checkout
    if (rule.preventCheckout) {
      var checkoutBtns = document.querySelectorAll('[name="checkout"], .cart__checkout, #checkout');
      [].forEach.call(checkoutBtns, function (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.title = 'Please log in to checkout';
      });
    }

    // Hide navigation links
    if (rule.hideLinksFromStorefront) {
      var navLinks = document.querySelectorAll('a[href*="/collections/"], a[href*="/products/"]');
      [].forEach.call(navLinks, function (link) {
        var card = link.closest('.card, .product-card, article');
        if (card) card.style.display = 'none';
      });
    }

    // Passcode prompt
    if (rule.criteriaType === 'passcode') {
      showPasscodePrompt(rule);
    }
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
      if (entered === (rule.criteriaValue || '').trim()) {
        localStorage.setItem('rpl_passcode_' + rule.id, entered);
        overlay.remove();
        window.location.reload();
      } else {
        document.getElementById('rpl-passcode-error').style.display = 'block';
      }
    });
    document.getElementById('rpl-passcode-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('rpl-passcode-submit').click();
    });
  }

  // ── Main init: called once config is loaded ───────────────────────────────────
  function init(appConfig) {
    clearTimeout(safetyTimer);

    var rules = appConfig.rules || [];
    var buttonConfigs = appConfig.buttonConfigs || {};
    var ctx = getPageContext();

    var anyRuleLocks = false;

    rules.forEach(function (rule) {
      if (!rule.enabled) return;
      if (!ruleShouldApply(rule, ctx)) return;

      var btnCfg = buttonConfigs[rule.id] || null;
      var isLocked = applyRule(rule, btnCfg);

      if (isLocked) {
        anyRuleLocks = true;
        // Wait for DOM ready before doing DOM manipulation
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () {
            applyDomChanges(rule, btnCfg);
          });
        } else {
          applyDomChanges(rule, btnCfg);
        }
      }
    });

    // Always call reveal() to remove rpl-hiding class from <html>.
    // By this point DOM changes are either done (synchronous) or queued via
    // DOMContentLoaded. Either way the lock button has replaced the cart button
    // so removing visibility:hidden is safe.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { reveal(); });
    } else {
      reveal();
    }
  }

  // Observe DOM for AJAX-loaded content (infinite scroll, quick-view modals etc.)
  function observeAndReinit(appConfig) {
    if (!window.MutationObserver) return;
    var debounceTimer;
    var observer = new MutationObserver(function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        var rules = appConfig.rules || [];
        var buttonConfigs = appConfig.buttonConfigs || {};
        var ctx = getPageContext();
        rules.forEach(function (rule) {
          if (!rule.enabled) return;
          if (!ruleShouldApply(rule, ctx)) return;
          var btnCfg = buttonConfigs[rule.id] || null;
          var isLocked = applyRule(rule, btnCfg);
          if (isLocked) applyDomChanges(rule, btnCfg);
        });
      }, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────────
  // Config fetch starts immediately — no DOMContentLoaded wait needed
  fetchJSON(APP_HOST + '/api/config.json', function (err, config) {
    if (err) {
      console.warn('[Rothley Price Lock] Could not load config:', err.message);
      reveal(); // Always reveal on error
      return;
    }
    init(config);
    if (document.readyState !== 'loading') {
      observeAndReinit(config);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        observeAndReinit(config);
      });
    }
  });

})();
