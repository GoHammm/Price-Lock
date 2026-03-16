'use strict';

const axios = require('axios');

const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

function shopifyClient(shop, token) {
  const base = `https://${shop}/admin/api/${API_VERSION}`;
  const headers = {
    'X-Shopify-Access-Token': token,
    'Content-Type': 'application/json',
  };

  return {
    async get(path) {
      const { data } = await axios.get(`${base}${path}`, { headers });
      return data;
    },
    async post(path, body) {
      const { data } = await axios.post(`${base}${path}`, body, { headers });
      return data;
    },
    async put(path, body) {
      const { data } = await axios.put(`${base}${path}`, body, { headers });
      return data;
    },
    async delete(path) {
      const { data } = await axios.delete(`${base}${path}`, { headers });
      return data;
    },
  };
}

/**
 * Register the storefront script tag with Shopify.
 * The script is served from this Netlify site at /storefront-script.js
 */
async function registerScriptTag(shop, token, host) {
  const client = shopifyClient(shop, token);
  const scriptUrl = `${host}/storefront-script.js`;

  // Check if already registered
  const existing = await client.get('/script_tags.json?src=' + encodeURIComponent(scriptUrl));
  if (existing.script_tags && existing.script_tags.length > 0) {
    return existing.script_tags[0];
  }

  const { script_tag } = await client.post('/script_tags.json', {
    script_tag: {
      event: 'onload',
      src: scriptUrl,
      display_scope: 'online_store',
    },
  });

  return script_tag;
}

async function deleteScriptTag(shop, token, scriptTagId) {
  const client = shopifyClient(shop, token);
  try {
    await client.delete(`/script_tags/${scriptTagId}.json`);
    return true;
  } catch {
    return false;
  }
}

async function getCollections(shop, token) {
  const client = shopifyClient(shop, token);
  // Get both custom and smart collections
  const [custom, smart] = await Promise.all([
    client.get('/custom_collections.json?limit=250&fields=id,handle,title'),
    client.get('/smart_collections.json?limit=250&fields=id,handle,title'),
  ]);
  return [
    ...(custom.custom_collections || []).map((c) => ({ ...c, type: 'custom' })),
    ...(smart.smart_collections || []).map((c) => ({ ...c, type: 'smart' })),
  ].sort((a, b) => a.title.localeCompare(b.title));
}

async function getProducts(shop, token) {
  const client = shopifyClient(shop, token);
  const { products } = await client.get('/products.json?limit=250&fields=id,handle,title,variants');
  return products || [];
}

async function getCustomerTags(shop, token) {
  // Shopify doesn't have a dedicated tags endpoint; we search customers and collect tags
  const client = shopifyClient(shop, token);
  try {
    const { customers } = await client.get('/customers.json?limit=250&fields=tags');
    const tagSet = new Set();
    (customers || []).forEach((c) => {
      if (c.tags) c.tags.split(',').forEach((t) => tagSet.add(t.trim()));
    });
    return Array.from(tagSet).filter(Boolean).sort();
  } catch {
    return [];
  }
}

module.exports = {
  shopifyClient,
  registerScriptTag,
  deleteScriptTag,
  getCollections,
  getProducts,
  getCustomerTags,
};
