import React, { useEffect, useState } from 'react';
import {
  Page, Layout, Card, Text, Button, Badge,
  DataTable, Banner, BlockStack, InlineStack, Spinner,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scriptRegistered, setScriptRegistered] = useState(false);

  useEffect(() => {
    Promise.all([api.getRules(), api.getSettings()])
      .then(([r, s]) => {
        setRules(r || []);
        setSettings(s || {});
        setScriptRegistered(!!(s && s.script_tag_id));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleRegisterScript = async () => {
    try {
      await api.registerScriptTag();
      setScriptRegistered(true);
    } catch (e) {
      alert('Failed to register script: ' + e.message);
    }
  };

  if (loading) {
    return (
      <Page title="Dashboard">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  const enabledRules = rules.filter((r) => r.enabled).length;

  const statsRows = [
    ['Total Rules', String(rules.length)],
    ['Active Rules', String(enabledRules)],
    ['Inactive Rules', String(rules.length - enabledRules)],
    ['Script Status', scriptRegistered ? 'Registered ✓' : 'Not Registered'],
  ];

  return (
    <Page
      title="Rothley Price Lock"
      subtitle="Manage price visibility and cart access for your store"
      primaryAction={{ content: 'Create Rule', onAction: () => navigate('/rules/new') }}
    >
      <Layout>
        {!scriptRegistered && (
          <Layout.Section>
            <Banner
              title="Storefront script not registered"
              tone="warning"
              action={{ content: 'Register Now', onAction: handleRegisterScript }}
            >
              <p>
                The storefront script needs to be registered with Shopify before your lock rules
                will appear on the store.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {scriptRegistered && (
          <Layout.Section>
            <Banner title="Storefront script is active" tone="success">
              <p>Your price lock rules are live on rothley.com.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Overview</Text>
              <DataTable
                columnContentTypes={['text', 'text']}
                headings={['Metric', 'Value']}
                rows={statsRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd">Lock Rules</Text>
                <Button onClick={() => navigate('/rules/new')} variant="primary">
                  Add Rule
                </Button>
              </InlineStack>
              {rules.length === 0 ? (
                <Text tone="subdued">No rules yet. Create one to get started.</Text>
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text']}
                  headings={['Name', 'Criteria', 'Targets', 'Status']}
                  rows={rules.map((r) => [
                    r.name,
                    criteriaLabel(r),
                    targetsLabel(r),
                    <Badge tone={r.enabled ? 'success' : 'critical'}>
                      {r.enabled ? 'Active' : 'Inactive'}
                    </Badge>,
                  ])}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Quick Links</Text>
              <InlineStack gap="300">
                <Button onClick={() => navigate('/rules')}>Manage Rules</Button>
                <Button onClick={() => navigate('/script')}>Script & Embed</Button>
                <Button onClick={() => navigate('/settings')}>Settings</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function criteriaLabel(rule) {
  const map = {
    logged_in: 'Logged In',
    customer_tag: `Tag: ${rule.criteriaValue}`,
    email_domain: `Domain: @${rule.criteriaValue}`,
    passcode: 'Passcode',
    country: `Country: ${rule.criteriaValue}`,
    selected_customer: 'Selected Customers',
    ip_address: `IP: ${rule.criteriaValue}`,
  };
  return map[rule.criteriaType] || rule.criteriaType;
}

function targetsLabel(rule) {
  if (rule.lockScope === 'entire_store') return 'Entire Store';
  const parts = [];
  if (rule.lockCollections) parts.push('Collections');
  if (rule.lockProducts) parts.push('Products');
  if (rule.lockVariants) parts.push('Variants');
  if (rule.lockPages) parts.push('Pages');
  if (rule.lockBlogs) parts.push('Blogs');
  if (rule.lockArticles) parts.push('Articles');
  return parts.join(', ') || 'None';
}
