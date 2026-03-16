import React from 'react';
import { Card, Text, BlockStack } from '@shopify/polaris';

export default function ButtonPreview({ config }) {
  const {
    buttonText = '🔒 Trade Only Pricing',
    fontSize = 16,
    textColor = '#ffffff',
    backgroundColor = '#d94a4a',
    borderRadius = 8,
    paddingTop = 5,
    paddingRight = 10,
    paddingBottom = 5,
    paddingLeft = 10,
    marginTop = 0,
    marginRight = 0,
    marginBottom = 0,
    marginLeft = 0,
  } = config || {};

  return (
    <Card background="bg-surface-secondary">
      <BlockStack gap="400">
        <Text variant="headingMd">Button Preview</Text>
        <div
          style={{
            padding: '24px',
            background: '#f6f6f7',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80px',
          }}
        >
          <a
            href="#preview"
            onClick={(e) => e.preventDefault()}
            style={{
              display: 'inline-block',
              fontSize: `${fontSize}px`,
              color: textColor,
              backgroundColor,
              borderRadius: `${borderRadius}px`,
              padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
              margin: `${marginTop}px ${marginRight}px ${marginBottom}px ${marginLeft}px`,
              textDecoration: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              border: 'none',
              textAlign: 'center',
              fontFamily: 'inherit',
            }}
          >
            {buttonText}
          </a>
        </div>

        {/* Simulated product card context */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e1e3e5',
            borderRadius: '8px',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ width: '80px', height: '80px', background: '#f1f1f1', borderRadius: '6px', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px', color: '#1a1a1a' }}>Sample Product</div>
              <div
                style={{
                  fontSize: '14px',
                  color: '#6d7175',
                  marginBottom: '12px',
                  fontStyle: 'italic',
                }}
              >
                Price hidden
              </div>
              <a
                href="#preview"
                onClick={(e) => e.preventDefault()}
                style={{
                  display: 'inline-block',
                  fontSize: `${fontSize}px`,
                  color: textColor,
                  backgroundColor,
                  borderRadius: `${borderRadius}px`,
                  padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                {buttonText}
              </a>
            </div>
          </div>
        </div>
      </BlockStack>
    </Card>
  );
}
