import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, FormLayout, TextField,
  BlockStack, Text, Button, Banner, InlineStack,
  Checkbox, Badge, Spinner,
} from '@shopify/polaris';
import { api } from '../lib/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.getSettings()
      .then(setSettings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateSettings(settings);
      setMessage({ type: 'success', text: 'Settings saved.' });
    } catch (e) {
      setMessage({ type: 'critical', text: 'Failed to save: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Page title="Settings">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Settings"
      primaryAction={{ content: saving ? 'Saving…' : 'Save Settings', loading: saving, onAction: handleSave }}
    >
      <Layout>
        {message && (
          <Layout.Section>
            <Banner tone={message.type} onDismiss={() => setMessage(null)}>
              <p>{message.text}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">App Status</Text>
              <InlineStack gap="300" blockAlign="center">
                <Badge tone={settings?.app_enabled ? 'success' : 'critical'}>
                  {settings?.app_enabled ? 'Enabled' : 'Disabled'}
                </Badge>
                <Checkbox
                  label="App Enabled"
                  helpText="Toggle this off to temporarily disable all price lock rules without deleting them."
                  checked={!!settings?.app_enabled}
                  onChange={(val) => setSettings((s) => ({ ...s, app_enabled: val }))}
                />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Store Configuration</Text>
              <FormLayout>
                <TextField
                  label="Shop Domain"
                  value={settings?.shop || ''}
                  onChange={(val) => setSettings((s) => ({ ...s, shop: val }))}
                  autoComplete="off"
                  placeholder="rothley.myshopify.com"
                  helpText="Your Shopify store's .myshopify.com domain."
                  disabled
                />
                <TextField
                  label="Script Tag ID"
                  value={settings?.script_tag_id || ''}
                  onChange={(val) => setSettings((s) => ({ ...s, script_tag_id: val }))}
                  autoComplete="off"
                  helpText="The Shopify ScriptTag ID (auto-populated when you register the script)."
                />
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">App Info</Text>
              <BlockStack gap="200">
                <InlineStack gap="200">
                  <Text tone="subdued">Version:</Text>
                  <Text>1.0.0</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Text tone="subdued">Built for:</Text>
                  <Text>rothley.myshopify.com</Text>
                </InlineStack>
                <InlineStack gap="200">
                  <Text tone="subdued">Framework:</Text>
                  <Text>Node.js + Express + Netlify Functions</Text>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
