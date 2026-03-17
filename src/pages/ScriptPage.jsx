import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, Button, Banner, BlockStack,
  InlineStack, Badge, Spinner, Divider, Box,
} from '@shopify/polaris';
import { api } from '../lib/api';

const HOST = import.meta.env.VITE_HOST || window.location.origin;

export default function ScriptPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => {
    setLoading(true);
    // Use dedicated script-status endpoint — fast Redis-only lookup, no Shopify timeout
    api.getScriptStatus()
      .then(setSettings)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRegister = async () => {
    setRegistering(true);
    setMessage(null);
    try {
      await api.registerScriptTag();
      setMessage({ type: 'success', text: 'Storefront script registered successfully. It is now live on your store.' });
      load();
    } catch (e) {
      setMessage({ type: 'critical', text: 'Failed to register script: ' + e.message });
    } finally {
      setRegistering(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove the storefront script? Price lock rules will stop working on the store immediately.')) return;
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

  const handleUninstall = async () => {
    if (!window.confirm(
      'This will remove the storefront script from your Shopify store.\n\n' +
      'Do this BEFORE deleting the app in the Shopify Dev Dashboard to ensure no broken code is left on your storefront.'
    )) return;
    setUninstalling(true);
    setMessage(null);
    try {
      const result = await api.uninstall();
      if (result.success) {
        setMessage({
          type: 'success',
          text: 'Cleanup complete. The storefront script has been removed from your store. You can now safely delete this app in the Shopify Dev Dashboard.',
        });
      } else {
        setMessage({
          type: 'warning',
          text: 'Cleanup finished with some issues: ' + (result.results?.errors?.join(', ') || 'unknown'),
        });
      }
      load();
    } catch (e) {
      setMessage({ type: 'critical', text: 'Uninstall cleanup failed: ' + e.message });
    } finally {
      setUninstalling(false);
    }
  };

  const manualScriptTag = `<script src="${HOST}/storefront-script.js" defer></script>`;
  const themeSnippet = `{% comment %} Rothley Price Lock — add to theme.liquid <head> {% endcomment %}\n<script src="{{ '${HOST}/storefront-script.js' }}" defer></script>`;

  if (loading) {
    return (
      <Page title="Script & Embed">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  // script-status endpoint returns { registered, scriptTagId }
  const isRegistered = !!(settings && settings.registered);
  const scriptTagId = settings && settings.scriptTagId;

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

        {/* Auto-registration info banner */}
        {!isRegistered && (
          <Layout.Section>
            <Banner tone="info">
              <p>
                <strong>Auto-registration:</strong> The script tag is automatically registered when the app
                first loads. If the status below shows "Not Installed", click Register to install it manually.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {/* Status card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd">Storefront Script Status</Text>
                  <Text tone="subdued">
                    The script is injected via Shopify's ScriptTag API and runs on every storefront page.
                  </Text>
                </BlockStack>
                <Badge tone={isRegistered ? 'success' : 'critical'}>
                  {isRegistered ? 'Active' : 'Not Installed'}
                </Badge>
              </InlineStack>

              {isRegistered && scriptTagId && (
                <Text tone="subdued" variant="bodySm">
                  Script Tag ID: {scriptTagId}
                </Text>
              )}

              <InlineStack gap="300">
                {!isRegistered && (
                  <Button
                    variant="primary"
                    loading={registering}
                    onClick={handleRegister}
                  >
                    Register Script on Store
                  </Button>
                )}
                {isRegistered && (
                  <>
                    <Button
                      loading={registering}
                      onClick={handleRegister}
                    >
                      Re-register / Update
                    </Button>
                    <Button
                      tone="critical"
                      loading={removing}
                      onClick={handleRemove}
                    >
                      Remove from Store
                    </Button>
                  </>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Manual install option */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Manual Installation (Alternative)</Text>
              <Text tone="subdued">
                If you prefer to add the script directly to your theme code rather than using the
                ScriptTag API, copy one of the snippets below.
              </Text>

              <BlockStack gap="200">
                <Text variant="headingSm">Option A — Raw script tag</Text>
                <Text tone="subdued" variant="bodySm">
                  Add to your theme's <code>layout/theme.liquid</code> inside the &lt;head&gt; tag.
                </Text>
                <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '13px', color: '#e2e8f0', overflowX: 'auto' }}>
                  <pre style={{ margin: 0 }}>{manualScriptTag}</pre>
                </div>
                <Button size="slim" onClick={() => navigator.clipboard.writeText(manualScriptTag)}>
                  Copy
                </Button>
              </BlockStack>

              <BlockStack gap="200">
                <Text variant="headingSm">Option B — Liquid snippet with comment</Text>
                <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '13px', color: '#e2e8f0', overflowX: 'auto' }}>
                  <pre style={{ margin: 0 }}>{themeSnippet}</pre>
                </div>
                <Button size="slim" onClick={() => navigator.clipboard.writeText(themeSnippet)}>
                  Copy
                </Button>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Config endpoint */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Config Endpoint</Text>
              <Text tone="subdued">
                The storefront script loads rules in real time from this endpoint. No theme changes
                are needed when you update rules — they take effect immediately.
              </Text>
              <div style={{ background: '#f1f1f1', borderRadius: '6px', padding: '10px 14px', fontFamily: 'monospace', fontSize: '13px' }}>
                {HOST}/api/config.json
              </div>
              <Button
                size="slim"
                onClick={() => window.open(`${HOST}/api/config.json`, '_blank')}
              >
                View Current Config
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Uninstall / cleanup section */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd">Before You Uninstall</Text>
                <Text tone="subdued">
                  If you plan to remove this app from your Shopify store, click the button below first.
                  This cleans up the storefront script so it doesn't leave broken code running on your store
                  after the app is deleted.
                </Text>
              </BlockStack>

              <Banner tone="warning">
                <p>
                  <strong>Always run this cleanup before deleting the app</strong> in the Shopify Dev Dashboard.
                  If you delete the app without cleaning up, the script tag will keep trying to load from a
                  URL that no longer responds.
                </p>
              </Banner>

              <Button
                tone="critical"
                loading={uninstalling}
                onClick={handleUninstall}
              >
                Prepare for Uninstall — Remove All App Code from Store
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
