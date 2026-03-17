/**
 * API client — wraps all calls to the Netlify Functions backend.
 * Automatically includes the shop param so the auth middleware can verify.
 */

const shop = new URLSearchParams(window.location.search).get('shop') ||
  import.meta.env.VITE_SHOP ||
  'rothley.myshopify.com';

async function request(method, path, body) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${path}${sep}shop=${encodeURIComponent(shop)}`;

  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Shop': shop },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (res.status === 401) {
    // Redirect to OAuth
    window.location.href = `/auth?shop=${shop}`;
    return null;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Settings
  getSettings: () => request('GET', '/api/settings'),
  updateSettings: (data) => request('POST', '/api/settings', data),

  // Rules
  getRules: () => request('GET', '/api/rules'),
  createRule: (data) => request('POST', '/api/rules', data),
  getRule: (id) => request('GET', `/api/rules/${id}`),
  updateRule: (id, data) => request('PUT', `/api/rules/${id}`, data),
  deleteRule: (id) => request('DELETE', `/api/rules/${id}`),

  // Button configs
  getButtonConfig: (ruleId) => request('GET', `/api/rules/${ruleId}/button`),
  updateButtonConfig: (ruleId, data) => request('PUT', `/api/rules/${ruleId}/button`, data),

  // Shopify data
  getCollections: () => request('GET', '/api/shopify/collections'),
  getProducts: () => request('GET', '/api/shopify/products'),
  getCustomerTags: () => request('GET', '/api/shopify/customer-tags'),

  // Theme snippet (flash-fix)
  getThemeStatus: () => request('GET', '/api/theme/status'),
  injectThemeSnippet: (themeId) => request('POST', '/api/theme/inject', themeId ? { themeId } : {}),
  removeThemeSnippet: (themeId) => request('POST', '/api/theme/remove', themeId ? { themeId } : {}),

  // Script tag
  getScriptStatus: () => request('GET', '/api/script-status'),
  registerScriptTag: () => request('POST', '/api/shopify/script-tag/register'),
  deleteScriptTag: () => request('DELETE', '/api/shopify/script-tag'),

  // Clean uninstall — removes script tag from Shopify before app removal
  uninstall: () => request('POST', '/api/shopify/uninstall'),
};

export { shop };
