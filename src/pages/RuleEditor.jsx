import React, { useEffect, useState, useCallback } from 'react';
import {
  Page, Layout, Card, Tabs, FormLayout, TextField,
  Select, Checkbox, RadioButton, BlockStack, InlineStack,
  Text, Button, Badge, Spinner, Banner, Tag,
  Autocomplete, Icon, Divider, Box,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import ButtonPreview from '../components/ButtonPreview';

const CRITERIA_OPTIONS = [
  { label: 'Logged In User', value: 'logged_in' },
  { label: 'Customer Tag', value: 'customer_tag' },
  { label: 'Country', value: 'country' },
  { label: 'State / Region', value: 'state' },
  { label: 'City', value: 'city' },
  { label: 'IP Address', value: 'ip_address' },
  { label: 'Selected Customer', value: 'selected_customer' },
  { label: 'Passcode', value: 'passcode' },
  { label: 'Email Domain', value: 'email_domain' },
];

const DEFAULT_RULE = {
  name: 'New Rule',
  enabled: true,
  lockScope: 'select',
  lockProducts: false,
  lockCollections: true,
  lockVariants: false,
  lockPages: false,
  lockBlogs: false,
  lockArticles: false,
  hidePrices: true,
  lockAddToCart: true,
  preventCheckout: false,
  whitelistFromCollections: false,
  targetItems: [],
  criteriaType: 'customer_tag',
  criteriaValue: '',
  accessMode: 'allow',
  disableLoginRedirect: false,
  hideLinksFromStorefront: false,
};

const DEFAULT_BTN = {
  buttonText: '🔒 Trade Only Pricing',
  fontSize: 16,
  textColor: '#ffffff',
  backgroundColor: '#d94a4a',
  borderRadius: 8,
  paddingTop: 5,
  paddingRight: 10,
  paddingBottom: 5,
  paddingLeft: 10,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  customClass: '',
  loginButtonRedirect: 'login_page',
  customRedirectUrl: '',
  productGridContainerClass: '.card-information',
  productCardClass: '',
  productPriceItemClass: '.price-wrapper',
  addToCartFormClass: 'form[action="/cart/add"]',
  quickAddButtonClass: '.quick-add__submit',
  bulkAddButtonClass: '',
};

export default function RuleEditor({ initialTab = 0 }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;

  const [selectedTab, setSelectedTab] = useState(initialTab);
  const [rule, setRule] = useState(DEFAULT_RULE);
  const [btnCfg, setBtnCfg] = useState(DEFAULT_BTN);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Shopify data for pickers
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [customerTags, setCustomerTags] = useState([]);
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    // Load Shopify data
    api.getCollections().then(setCollections).catch(() => {});
    api.getProducts().then(setProducts).catch(() => {});
    api.getCustomerTags().then(setCustomerTags).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isNew) {
      setLoading(true);
      Promise.all([api.getRule(id), api.getButtonConfig(id)])
        .then(([r, b]) => {
          setRule(r || DEFAULT_RULE);
          setBtnCfg(b || DEFAULT_BTN);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const setRuleField = (field) => (value) => setRule((r) => ({ ...r, [field]: value }));
  const setBtnField = (field) => (value) => setBtnCfg((b) => ({ ...b, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      let savedRule;
      if (isNew) {
        savedRule = await api.createRule(rule);
      } else {
        savedRule = await api.updateRule(id, rule);
      }
      await api.updateButtonConfig(savedRule.id, { ...btnCfg, ruleId: savedRule.id });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (isNew) navigate(`/rules/${savedRule.id}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTargetItem = (item) => {
    if (!rule.targetItems.includes(item)) {
      setRule((r) => ({ ...r, targetItems: [...r.targetItems, item] }));
    }
    setSearchValue('');
  };

  const handleRemoveTargetItem = (item) => {
    setRule((r) => ({ ...r, targetItems: r.targetItems.filter((i) => i !== item) }));
  };

  // Build target item options based on what's locked
  const getTargetOptions = () => {
    const opts = [];
    if (rule.lockCollections) {
      collections.forEach((c) => opts.push({ value: c.handle, label: `[Collection] ${c.title}` }));
    }
    if (rule.lockProducts) {
      products.forEach((p) => opts.push({ value: p.handle, label: `[Product] ${p.title}` }));
    }
    return opts.filter((o) =>
      !searchValue || o.label.toLowerCase().includes(searchValue.toLowerCase())
    );
  };

  const tabs = [
    { id: 'what', content: 'What to Lock' },
    { id: 'button', content: 'Button & Style' },
    { id: 'access', content: 'Control Access' },
    { id: 'selectors', content: 'Element Selectors' },
  ];

  if (loading) {
    return (
      <Page title="Loading…">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title={isNew ? 'Create Rule' : `Edit Rule: ${rule.name}`}
      backAction={{ content: 'Rules', onAction: () => navigate('/rules') }}
      primaryAction={{
        content: saving ? 'Saving…' : 'Save Rule',
        loading: saving,
        onAction: handleSave,
      }}
      secondaryActions={[{ content: 'Cancel', onAction: () => navigate('/rules') }]}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner title="Error" tone="critical" onDismiss={() => setError('')}>
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}
        {saved && (
          <Layout.Section>
            <Banner title="Saved successfully" tone="success" onDismiss={() => setSaved(false)} />
          </Layout.Section>
        )}

        {/* Rule Name & Status */}
        <Layout.Section>
          <Card>
            <FormLayout>
              <InlineStack gap="400" align="space-between" blockAlign="center">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="Rule Name"
                    value={rule.name}
                    onChange={setRuleField('name')}
                    autoComplete="off"
                    placeholder="e.g. Trade Customers Only"
                  />
                </div>
                <div style={{ paddingTop: '22px' }}>
                  <InlineStack gap="200" blockAlign="center">
                    <Text>Status:</Text>
                    <Badge tone={rule.enabled ? 'success' : 'critical'}>
                      {rule.enabled ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      size="slim"
                      onClick={() => setRule((r) => ({ ...r, enabled: !r.enabled }))}
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </InlineStack>
                </div>
              </InlineStack>
            </FormLayout>
          </Card>
        </Layout.Section>

        {/* Tabs */}
        <Layout.Section>
          <Card>
            <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
              {/* ── Tab 0: What to Lock ─────────────────────────────────── */}
              {selectedTab === 0 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    <BlockStack gap="300">
                      <Text variant="headingMd">Lock Scope</Text>
                      <RadioButton
                        label="Entire Store"
                        helpText="Apply this rule to every page and product on the store."
                        checked={rule.lockScope === 'entire_store'}
                        onChange={() => setRule((r) => ({ ...r, lockScope: 'entire_store' }))}
                        id="scope-entire"
                        name="lockScope"
                      />
                      <RadioButton
                        label="Select Content"
                        helpText="Choose specific content types below."
                        checked={rule.lockScope === 'select'}
                        onChange={() => setRule((r) => ({ ...r, lockScope: 'select' }))}
                        id="scope-select"
                        name="lockScope"
                      />
                    </BlockStack>

                    {rule.lockScope === 'select' && (
                      <Card background="bg-surface-secondary">
                        <BlockStack gap="300">
                          <Text variant="headingMd">Content Types</Text>
                          <InlineStack gap="600" wrap>
                            <Checkbox
                              label="Collections"
                              checked={rule.lockCollections}
                              onChange={setRuleField('lockCollections')}
                            />
                            <Checkbox
                              label="Products"
                              checked={rule.lockProducts}
                              onChange={setRuleField('lockProducts')}
                            />
                            <Checkbox
                              label="Variants"
                              checked={rule.lockVariants}
                              onChange={setRuleField('lockVariants')}
                            />
                            <Checkbox
                              label="Pages"
                              checked={rule.lockPages}
                              onChange={setRuleField('lockPages')}
                            />
                            <Checkbox
                              label="Blogs"
                              checked={rule.lockBlogs}
                              onChange={setRuleField('lockBlogs')}
                            />
                            <Checkbox
                              label="Articles"
                              checked={rule.lockArticles}
                              onChange={setRuleField('lockArticles')}
                            />
                          </InlineStack>
                        </BlockStack>
                      </Card>
                    )}

                    {/* Specific items picker */}
                    {rule.lockScope === 'select' && (rule.lockCollections || rule.lockProducts) && (
                      <BlockStack gap="300">
                        <Text variant="headingMd">
                          Specific {rule.lockCollections ? 'Collections' : ''}{rule.lockCollections && rule.lockProducts ? ' & ' : ''}{rule.lockProducts ? 'Products' : ''}
                        </Text>
                        <Text tone="subdued" variant="bodySm">
                          Leave blank to apply to ALL of the selected content types. Add items to target only specific ones.
                        </Text>
                        <Autocomplete
                          options={getTargetOptions()}
                          selected={[]}
                          onSelect={(sel) => handleAddTargetItem(sel[0])}
                          textField={
                            <Autocomplete.TextField
                              onChange={setSearchValue}
                              label="Search collections / products"
                              value={searchValue}
                              prefix={<Icon source={SearchIcon} />}
                              placeholder="Type to search…"
                              autoComplete="off"
                            />
                          }
                        />
                        {rule.targetItems.length > 0 && (
                          <InlineStack gap="200" wrap>
                            {rule.targetItems.map((item) => (
                              <Tag key={item} onRemove={() => handleRemoveTargetItem(item)}>
                                {item}
                              </Tag>
                            ))}
                          </InlineStack>
                        )}
                      </BlockStack>
                    )}

                    <Divider />

                    <BlockStack gap="300">
                      <Text variant="headingMd">What to Hide / Lock</Text>
                      <Checkbox
                        label="Hide Prices"
                        helpText="Price elements are hidden from non-authorised visitors."
                        checked={rule.hidePrices}
                        onChange={setRuleField('hidePrices')}
                      />
                      <Checkbox
                        label="Lock Add to Cart & Buy Now"
                        helpText="Replace the Add to Cart button with your custom lock button."
                        checked={rule.lockAddToCart}
                        onChange={setRuleField('lockAddToCart')}
                      />
                      <Checkbox
                        label="Prevent Checkout"
                        helpText="Disable the Checkout button in the cart for non-authorised customers."
                        checked={rule.preventCheckout}
                        onChange={setRuleField('preventCheckout')}
                      />
                      <Checkbox
                        label="Hide restricted links from navigation & search"
                        helpText="Hide product/collection cards and links from storefront navigation and search results."
                        checked={rule.hideLinksFromStorefront}
                        onChange={setRuleField('hideLinksFromStorefront')}
                      />
                      {rule.lockCollections && (
                        <Checkbox
                          label="Whitelist products from selected collections"
                          helpText="Show individual products from within locked collections if they match other allowed criteria."
                          checked={rule.whitelistFromCollections}
                          onChange={setRuleField('whitelistFromCollections')}
                        />
                      )}
                    </BlockStack>
                  </BlockStack>
                </Box>
              )}

              {/* ── Tab 1: Button & Style ───────────────────────────────── */}
              {selectedTab === 1 && (
                <Box padding="400">
                  <Layout>
                    <Layout.Section>
                      <BlockStack gap="500">
                        <BlockStack gap="300">
                          <Text variant="headingMd">Button Text & Font</Text>
                          <FormLayout>
                            <FormLayout.Group>
                              <TextField
                                label="Button Text"
                                value={btnCfg.buttonText}
                                onChange={setBtnField('buttonText')}
                                autoComplete="off"
                                placeholder="🔒 Trade Only Pricing"
                              />
                              <TextField
                                label="Font Size (px)"
                                type="number"
                                value={String(btnCfg.fontSize)}
                                onChange={(v) => setBtnField('fontSize')(Number(v))}
                                autoComplete="off"
                              />
                            </FormLayout.Group>
                          </FormLayout>
                        </BlockStack>

                        <BlockStack gap="300">
                          <Text variant="headingMd">Colours</Text>
                          <FormLayout>
                            <FormLayout.Group>
                              <TextField
                                label="Text Color"
                                value={btnCfg.textColor}
                                onChange={setBtnField('textColor')}
                                prefix={
                                  <div style={{
                                    width: 20, height: 20, borderRadius: 4,
                                    background: btnCfg.textColor,
                                    border: '1px solid #ccc',
                                  }} />
                                }
                                autoComplete="off"
                              />
                              <TextField
                                label="Background Color"
                                value={btnCfg.backgroundColor}
                                onChange={setBtnField('backgroundColor')}
                                prefix={
                                  <div style={{
                                    width: 20, height: 20, borderRadius: 4,
                                    background: btnCfg.backgroundColor,
                                    border: '1px solid #ccc',
                                  }} />
                                }
                                autoComplete="off"
                              />
                            </FormLayout.Group>
                          </FormLayout>
                        </BlockStack>

                        <BlockStack gap="300">
                          <Text variant="headingMd">Sizing & Spacing</Text>
                          <FormLayout>
                            <FormLayout.Group>
                              <TextField
                                label="Border Radius (px)"
                                type="number"
                                value={String(btnCfg.borderRadius)}
                                onChange={(v) => setBtnField('borderRadius')(Number(v))}
                                autoComplete="off"
                              />
                              <TextField
                                label="Custom CSS Class"
                                value={btnCfg.customClass}
                                onChange={setBtnField('customClass')}
                                autoComplete="off"
                                placeholder=".my-custom-btn"
                              />
                            </FormLayout.Group>
                            <Text variant="headingMd">Padding (px)</Text>
                            <FormLayout.Group>
                              <TextField label="Top" type="number" value={String(btnCfg.paddingTop)} onChange={(v) => setBtnField('paddingTop')(Number(v))} autoComplete="off" />
                              <TextField label="Right" type="number" value={String(btnCfg.paddingRight)} onChange={(v) => setBtnField('paddingRight')(Number(v))} autoComplete="off" />
                              <TextField label="Bottom" type="number" value={String(btnCfg.paddingBottom)} onChange={(v) => setBtnField('paddingBottom')(Number(v))} autoComplete="off" />
                              <TextField label="Left" type="number" value={String(btnCfg.paddingLeft)} onChange={(v) => setBtnField('paddingLeft')(Number(v))} autoComplete="off" />
                            </FormLayout.Group>
                            <Text variant="headingMd">Margin (px)</Text>
                            <FormLayout.Group>
                              <TextField label="Top" type="number" value={String(btnCfg.marginTop)} onChange={(v) => setBtnField('marginTop')(Number(v))} autoComplete="off" />
                              <TextField label="Right" type="number" value={String(btnCfg.marginRight)} onChange={(v) => setBtnField('marginRight')(Number(v))} autoComplete="off" />
                              <TextField label="Bottom" type="number" value={String(btnCfg.marginBottom)} onChange={(v) => setBtnField('marginBottom')(Number(v))} autoComplete="off" />
                              <TextField label="Left" type="number" value={String(btnCfg.marginLeft)} onChange={(v) => setBtnField('marginLeft')(Number(v))} autoComplete="off" />
                            </FormLayout.Group>
                          </FormLayout>
                        </BlockStack>

                        <BlockStack gap="300">
                          <Text variant="headingMd">Login Redirect</Text>
                          <Select
                            label="On button click, redirect to"
                            options={[
                              { label: 'Login Page (/account/login)', value: 'login_page' },
                              { label: 'Custom URL', value: 'custom' },
                            ]}
                            value={btnCfg.loginButtonRedirect}
                            onChange={setBtnField('loginButtonRedirect')}
                          />
                          {btnCfg.loginButtonRedirect === 'custom' && (
                            <TextField
                              label="Custom Redirect URL"
                              value={btnCfg.customRedirectUrl}
                              onChange={setBtnField('customRedirectUrl')}
                              autoComplete="off"
                              placeholder="https://rothley.com/trade-register"
                            />
                          )}
                        </BlockStack>
                      </BlockStack>
                    </Layout.Section>

                    <Layout.Section variant="oneThird">
                      <BlockStack gap="400">
                        <Text variant="headingMd">Live Preview</Text>
                        <ButtonPreview config={btnCfg} />
                      </BlockStack>
                    </Layout.Section>
                  </Layout>
                </Box>
              )}

              {/* ── Tab 2: Control Access ───────────────────────────────── */}
              {selectedTab === 2 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    <BlockStack gap="300">
                      <Text variant="headingMd">Access Criteria</Text>
                      <Text tone="subdued">
                        Define which customers are subject to this rule.
                      </Text>
                      <Select
                        label="Criteria Type"
                        options={CRITERIA_OPTIONS}
                        value={rule.criteriaType}
                        onChange={setRuleField('criteriaType')}
                      />
                    </BlockStack>

                    {/* Criteria value */}
                    {rule.criteriaType !== 'logged_in' && (
                      <BlockStack gap="200">
                        {rule.criteriaType === 'customer_tag' && (
                          <>
                            <TextField
                              label="Customer Tag"
                              value={rule.criteriaValue}
                              onChange={setRuleField('criteriaValue')}
                              autoComplete="off"
                              placeholder="e.g. trade"
                              helpText="Enter the exact customer tag (case-insensitive)."
                            />
                            {customerTags.length > 0 && (
                              <BlockStack gap="200">
                                <Text variant="bodySm" tone="subdued">Existing tags on your store:</Text>
                                <InlineStack gap="200" wrap>
                                  {customerTags.map((t) => (
                                    <Button
                                      key={t}
                                      size="micro"
                                      onClick={() => setRule((r) => ({ ...r, criteriaValue: t }))}
                                      pressed={rule.criteriaValue === t}
                                    >
                                      {t}
                                    </Button>
                                  ))}
                                </InlineStack>
                              </BlockStack>
                            )}
                          </>
                        )}
                        {rule.criteriaType === 'email_domain' && (
                          <TextField
                            label="Email Domain"
                            value={rule.criteriaValue}
                            onChange={setRuleField('criteriaValue')}
                            autoComplete="off"
                            placeholder="e.g. rothley.com"
                            helpText="Enter the domain without the @ symbol."
                            prefix="@"
                          />
                        )}
                        {rule.criteriaType === 'passcode' && (
                          <TextField
                            label="Passcode"
                            value={rule.criteriaValue}
                            onChange={setRuleField('criteriaValue')}
                            autoComplete="off"
                            placeholder="Enter passcode"
                            helpText="Customers will see a passcode prompt before accessing locked content."
                          />
                        )}
                        {['country', 'state', 'city', 'ip_address', 'selected_customer'].includes(rule.criteriaType) && (
                          <TextField
                            label={CRITERIA_OPTIONS.find((o) => o.value === rule.criteriaType)?.label || 'Value'}
                            value={rule.criteriaValue}
                            onChange={setRuleField('criteriaValue')}
                            autoComplete="off"
                            placeholder={
                              rule.criteriaType === 'country' ? 'e.g. GB' :
                              rule.criteriaType === 'ip_address' ? 'e.g. 192.168.1.1' :
                              rule.criteriaType === 'selected_customer' ? 'Customer IDs (comma separated)' :
                              ''
                            }
                          />
                        )}
                      </BlockStack>
                    )}

                    <Divider />

                    <BlockStack gap="300">
                      <Text variant="headingMd">Access Mode</Text>
                      <RadioButton
                        label="Allow Access"
                        helpText="Customers matching the criteria above CAN see prices and add to cart. Everyone else is locked out."
                        checked={rule.accessMode === 'allow'}
                        onChange={() => setRule((r) => ({ ...r, accessMode: 'allow' }))}
                        id="mode-allow"
                        name="accessMode"
                      />
                      <RadioButton
                        label="Restrict Access"
                        helpText="Customers matching the criteria above are BLOCKED. Everyone else can see prices normally."
                        checked={rule.accessMode === 'restrict'}
                        onChange={() => setRule((r) => ({ ...r, accessMode: 'restrict' }))}
                        id="mode-restrict"
                        name="accessMode"
                      />
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="300">
                      <Text variant="headingMd">Additional Options</Text>
                      <Checkbox
                        label="Disable login page redirection"
                        helpText="Don't automatically redirect to the login page. Show the lock button only."
                        checked={rule.disableLoginRedirect}
                        onChange={setRuleField('disableLoginRedirect')}
                      />
                    </BlockStack>
                  </BlockStack>
                </Box>
              )}

              {/* ── Tab 3: Element Selectors ────────────────────────────── */}
              {selectedTab === 3 && (
                <Box padding="400">
                  <BlockStack gap="500">
                    <Banner tone="info">
                      <p>
                        These CSS selectors tell the script which elements to target. The defaults
                        are set for the <strong>Sydney theme</strong>. If prices or buttons are not
                        being hidden on your store, inspect the page source and update these to match
                        your theme's class names.
                      </p>
                    </Banner>

                    <FormLayout>
                      <FormLayout.Group>
                        <TextField
                          label="Product Grid Container Class"
                          value={btnCfg.productGridContainerClass}
                          onChange={setBtnField('productGridContainerClass')}
                          autoComplete="off"
                          placeholder=".card-information"
                          helpText="The container wrapping each product card."
                        />
                        <TextField
                          label="Product Card Class"
                          value={btnCfg.productCardClass}
                          onChange={setBtnField('productCardClass')}
                          autoComplete="off"
                          placeholder=".product-card"
                        />
                      </FormLayout.Group>
                      <FormLayout.Group>
                        <TextField
                          label="Product Price Element Class"
                          value={btnCfg.productPriceItemClass}
                          onChange={setBtnField('productPriceItemClass')}
                          autoComplete="off"
                          placeholder=".price"
                          helpText="The element(s) containing the price."
                        />
                        <TextField
                          label="Add to Cart Form Class"
                          value={btnCfg.addToCartFormClass}
                          onChange={setBtnField('addToCartFormClass')}
                          autoComplete="off"
                          placeholder='form[action="/cart/add"]'
                          helpText="Overrides the default cart form selector."
                        />
                      </FormLayout.Group>
                      <FormLayout.Group>
                        <TextField
                          label="Quick Add Button Class"
                          value={btnCfg.quickAddButtonClass}
                          onChange={setBtnField('quickAddButtonClass')}
                          autoComplete="off"
                          placeholder=".quick-add__submit"
                        />
                        <TextField
                          label="Bulk Add Button Class"
                          value={btnCfg.bulkAddButtonClass}
                          onChange={setBtnField('bulkAddButtonClass')}
                          autoComplete="off"
                          placeholder=".bulk-add-button"
                        />
                      </FormLayout.Group>
                    </FormLayout>
                  </BlockStack>
                </Box>
              )}
            </Tabs>
          </Card>
        </Layout.Section>

        {/* Save button at bottom */}
        <Layout.Section>
          <InlineStack gap="300" align="end">
            <Button onClick={() => navigate('/rules')}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              Save Rule
            </Button>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
