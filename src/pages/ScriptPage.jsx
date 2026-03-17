import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, Button, Banner, BlockStack,
  InlineStack, Badge, Spinner, Box,
} from '@shopify/polaris';
import { api } from '../lib/api';

const HOST = import.meta.env.VITE_HOST || window.location.origin;

export default function ScriptPage() {
  const [scriptStatus, setScriptStatus] = useState(null);
  const [themeStatus, setThemeStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [injecting, setInjecting] = useState(false);
  const [removingSnippet, setRemovingSnippet] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.getScriptStatus(), api.getThemeStatus()])
      .then(([s, t]) => {
        setScriptStatus(s);
        setThemeStatus(t);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRegister = async () => {
    setRegistering(true);
    setMessage(null);
    try {
      await api.registerScriptTag();
      setMessage({ type: 'success', text: 'Storefront script registered successfully.' });
      load();
    } catch (e) {
      setMessage({ type: 'critical', text: 'Failed to register script: ' + e.message });
    } finally {
      setRegistering(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove the storefront script? Price lock rules will stop working immediately.')) return;
    setRemoving(true);
    setMessage(null);
    try {
      await api.deleteScriptTag();
      setMessage({ type: 'success', text: 'Storefront script removed.' });
      load();
    } catch (e) {
      setMessage({ type: 'critical', text: 'Failed to remove script: ' + e.message });
    } finally {
      setRemoving(false);
    }
  };

  const handleInjectSnippet = async () => {
    setInjecting(true);
    setMessage(null);
    try {
      await api.injectThemeSnippet();
      setMessage({ type: 'success', text: 'Flash-fix snippet added to your theme. Prices will now be hidden instantly with zero flash.' });
      load();
    } catch (e) {
      setMessage({ type: 'critical', text: 'Failed to inject snippet: ' + e.message });
    } finally {
      setInjecting(false);
    }
  };

  const handleRemoveSnippet = async () => {
    if (!window.confirm('Remove the flash-fix snippet from your theme?')) return;
    setRemovingSnippet(true);
    setMessage(null);
    try {
      await api.removeThemeSnippet();
      setMessage({ type: 'success', text: 'Flash-fix snippet removed from theme.' });
      load();
    } catch (e) {
      setMessage({ type: 'critical', text: 'Failed to remove snippet: ' + e.message });
    } finally {
      setRemovingSnippet(false);
    }
  };

  const handleUninstall = async () => {
    if (!window.confirm(
      'This will remove the storefront script AND the flash-fix snippet from your Shopify store.\n\n' +
      'Do this BEFORE deleting the app in the Shopify Dev Dashboard.'
    )) return;
    setUninstalling(true);
    setMessage(null);
    try {
      // Remove theme snippet first
      try { await api.removeThemeSnippet(); } catch {}
      const result = await api.uninstall();
      if (result.success) {
        setMessage({ type: 'success', text: 'Cleanup complete. You can now safely delete this app.' });
      } else {
        setMessage({ type: 'warning', text: 'Cleanup finished with some issues: ' + (result.results?.errors?.join(', ') || 'unknown') });
      }
      load();
    } catch (e) {
      setMessage({ type: 'critical', text: 'Uninstall cleanup failed: ' + e.message });
    } finally {
      setUninstalling(false);
    }
  };

  const manualSnippet = `<!-- rpl-flash-fix:start -->
{%- comment -%}Rothley Price Lock — flash-fix CSS{%- endcomment -%}
<style id="rpl-flash-fix">
  .rpl-hiding .price-wrapper,
  .rpl-hiding .price,
  .rpl-hiding .product__price,
  .rpl-hiding form[action="/cart/add"] [type="submit"],
  .rpl-hiding form[action="/cart/add"] button[name="add"],
  .rpl-hiding .product-form__submit,
  .rpl-hiding .quick-add__submit {
    visibility: hidden !important;
  }
</style>
<script>document.documentElement.className += ' rpl-hiding';</script>
<!-- rpl-flash-fix:end -->`;

  const manualScriptTag = `<script src="${HOST}/storefront-script.js" defer></script>`;

  if (loading) {
    return (
      <Page title="Script & Embed">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  const isRegistered = !!(scriptStatus && scriptStatus.registered);
  const scriptTagId = scriptStatus && scriptStatus.scriptTagId;
  const snippetInjected = !!(themeStatus && themeStatus.injected);

  return (
    <Page
      title="Script & Embed"
      subtitle="Control how the storefront script is installed on your Shopify store"
    >
      <Layout>
        {message && (
          <Layout.Section>
            <Banner tone={message.type} onDismiss={() => setMessage(null)}>
              <p>{message.text}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* ── Step 1: Script Tag ──────────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd">Step 1 — Storefront Script</Text>
                  <Text tone="subdued">
                    Registers the price lock script with Shopify via the ScriptTag API.
                  </Text>
                </BlockStack>
                <Badge tone={isRegistered ? 'success' : 'critical'}>
                  {isRegistered ? 'Registered' : 'Not Registered'}
                </Badge>
              </InlineStack>

              {isRegistered && scriptTagId && (
                <Text tone="subdued" variant="bodySm">Script Tag ID: {scriptTagId}</Text>
              )}

              <InlineStack gap="300">
                {!isRegistered ? (
                  <Button variant="primary" loading={registering} onClick={handleRegister}>
                    Register Script on Store
                  </Button>
                ) : (
                  <>
                    <Button loading={registering} onClick={handleRegister}>Re-register / Update</Button>
                    <Button tone="critical" loading={removing} onClick={handleRemove}>Remove from Store</Button>
                  </>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Step 2: Flash Fix ───────────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd">Step 2 — Flash Fix (Recommended)</Text>
                  <Text tone="subdued">
                    Adds a tiny CSS snippet to your theme so prices are hidden <em>before</em> the
                    page paints — eliminating the flash where prices briefly appear. One click, fully reversible.
                  </Text>
                </BlockStack>
                <Badge tone={snippetInjected ? 'success' : 'warning'}>
                  {snippetInjected ? 'Active' : 'Not Applied'}
                </Badge>
              </InlineStack>

              {!snippetInjected && (
                <Banner tone="info">
                  <p>
                    Without this, the price is briefly visible for ~1–2 seconds while the script loads.
                    Click <strong>Apply Flash Fix</strong> to automatically add the snippet to your
                    live theme's <code>theme.liquid</code>.
                  </p>
                </Banner>
              )}

              {snippetInjected && (
                <Banner tone="success">
                  <p>Flash fix is active. Prices and Add to Cart buttons are hidden the instant the page starts loading.</p>
                </Banner>
              )}

              <InlineStack gap="300">
                {!snippetInjected ? (
                  <Button variant="primary" loading={injecting} onClick={handleInjectSnippet}>
                    Apply Flash Fix to Theme
                  </Button>
                ) : (
                  <Button tone="critical" loading={removingSnippet} onClick={handleRemoveSnippet}>
                    Remove Flash Fix from Theme
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Manual snippet ──────────────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Manual Theme Snippet (Alternative)</Text>
              <Text tone="subdued">
                If the automatic injection doesn't work, copy this snippet and paste it as the very
                first line inside the <code>&lt;head&gt;</code> tag in your <code>layout/theme.liquid</code>.
              </Text>
              <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '12px', color: '#e2e8f0', overflowX: 'auto' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{manualSnippet}</pre>
              </div>
              <Button size="slim" onClick={() => navigator.clipboard.writeText(manualSnippet)}>
                Copy Snippet
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Config endpoint ─────────────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Config Endpoint</Text>
              <Text tone="subdued">
                The storefront script loads rules in real time from this endpoint. Rules update instantly — no theme changes needed.
              </Text>
              <div style={{ background: '#f1f1f1', borderRadius: '6px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '13px' }}>
                {HOST}/api/config.json
              </div>
              <Button size="slim" onClick={() => window.open(`${HOST}/api/config.json`, '_blank')}>
                View Current Config
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* ── Uninstall ───────────────────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd">Before You Uninstall</Text>
                <Text tone="subdued">
                  Removes the script tag AND the flash-fix snippet from your theme before you delete the app.
                </Text>
              </BlockStack>
              <Banner tone="warning">
                <p>
                  <strong>Always run cleanup before deleting the app</strong> in the Shopify Dev Dashboard.
                </p>
              </Banner>
              <Button tone="critical" loading={uninstalling} onClick={handleUninstall}>
                Prepare for Uninstall — Remove All App Code from Store
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
