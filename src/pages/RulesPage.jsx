import React, { useEffect, useState } from 'react';
import {
  Page, Card, DataTable, Badge, Button, InlineStack,
  BlockStack, Text, Modal, Spinner, EmptyState,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function RulesPage() {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api.getRules()
      .then((r) => setRules(r || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleToggle = async (rule) => {
    try {
      const updated = await api.updateRule(rule.id, { ...rule, enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      alert('Failed to update rule: ' + e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteRule(deleteId);
      setRules((prev) => prev.filter((r) => r.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      alert('Failed to delete rule: ' + e.message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Page title="Lock Rules">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  const rows = rules.map((rule) => [
    rule.name,
    criteriaLabel(rule),
    targetsLabel(rule),
    <Badge tone={rule.enabled ? 'success' : 'critical'}>
      {rule.enabled ? 'Active' : 'Inactive'}
    </Badge>,
    <InlineStack gap="200">
      <Button size="slim" onClick={() => navigate(`/rules/${rule.id}`)}>Edit</Button>
      <Button size="slim" onClick={() => handleToggle(rule)}>
        {rule.enabled ? 'Disable' : 'Enable'}
      </Button>
      <Button size="slim" tone="critical" onClick={() => setDeleteId(rule.id)}>Delete</Button>
    </InlineStack>,
  ]);

  return (
    <Page
      title="Lock Rules"
      subtitle="Define what to lock and who can access it"
      primaryAction={{ content: 'Create Rule', onAction: () => navigate('/rules/new') }}
    >
      <Card>
        {rules.length === 0 ? (
          <EmptyState
            heading="No rules yet"
            action={{ content: 'Create your first rule', onAction: () => navigate('/rules/new') }}
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Rules control which customers can see prices and add items to cart.</p>
          </EmptyState>
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'text', 'text', 'text']}
            headings={['Name', 'Criteria', 'Targets', 'Status', 'Actions']}
            rows={rows}
          />
        )}
      </Card>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Rule"
        primaryAction={{
          content: deleting ? 'Deleting…' : 'Delete',
          destructive: true,
          loading: deleting,
          onAction: handleDelete,
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setDeleteId(null) }]}
      >
        <Modal.Section>
          <Text>Are you sure you want to delete this rule? This cannot be undone.</Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function criteriaLabel(rule) {
  const map = {
    logged_in: 'Logged In',
    customer_tag: `Tag: "${rule.criteriaValue}"`,
    email_domain: `Domain: @${rule.criteriaValue}`,
    passcode: 'Passcode',
    country: `Country: ${rule.criteriaValue}`,
    selected_customer: 'Selected Customers',
    ip_address: `IP: ${rule.criteriaValue}`,
    state: `State: ${rule.criteriaValue}`,
    city: `City: ${rule.criteriaValue}`,
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
