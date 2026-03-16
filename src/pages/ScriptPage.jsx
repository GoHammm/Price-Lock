import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, Button, Banner, BlockStack,
  InlineStack, Badge, Spinner,
} from '@shopify/polaris';
import { api } from '../lib/api';

const HOST = import.meta.env.VITE_HOST || window.location.origin;

export default function ScriptPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState(null);

  const load = () => {
    setLoading(true);
    api.getSettings()
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

  const manualScriptTag = `<script src="${HOST}/storefront-script.js" defer></script>`;

  const themeSnippet = `{% comment %} Rothley Price Lock — add to theme.liquid <head> {% endcomment %}
<script src="{{ '${HOST}/storefront-script.js' }}" defer></script>`;

  if (loading) {
    return (
      <Page title="Script & Embed">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  const isRegistered = !!(settings && settings.script_tag_id);

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

              {isRegistered && settings.script_tag_id && (
                <Text tone="subdued" variant="bodySm">
                  Script Tag ID: {settings.script_tag_id}
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
                <Button
                  size="slim"
                  onClick={() => navigator.clipboard.writeText(manualScriptTag)}
                >
                  Copy
                </Button>
              </BlockStack>

              <BlockStack gap="200">
                <Text variant="headingSm">Option B — Liquid snippet with comment</Text>
                <div style={{ background: '#1a1a1a', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', fontSize: '13px', color: '#e2e8f0', overflowX: 'auto' }}>
                  <pre style={{ margin: 0 }}>{themeSnippet}</pre>
                </div>
                <Button
                  size="slim"
                  onClick={() => navigator.clipboard.writeText(themeSnippet)}
                >
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
      </Layout>
    </Page>
  );
}
