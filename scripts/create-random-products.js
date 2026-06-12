#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const count = Number.parseInt(process.env.PRODUCT_COUNT || '5', 10);
const status = process.env.PRODUCT_STATUS || 'DRAFT';
const shop = normalizeShopDomain(process.env.SHOPIFY_SHOP || '');
const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || '2025-10';
const timeoutMs = Number.parseInt(process.env.MCP_HTTP_TIMEOUT_MS || '15000', 10);

if (process.argv.includes('--help')) {
  console.log(`Usage: SHOPIFY_SHOP=your-shop.myshopify.com SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_... PRODUCT_COUNT=5 PRODUCT_STATUS=DRAFT node scripts/create-random-products.js`);
  process.exit(0);
}

const adjectives = ['Aurora', 'Summit', 'Lunar', 'Ember', 'Harbor', 'Willow', 'Cobalt', 'Saffron'];
const nouns = ['Desk Lamp', 'Canvas Tote', 'Ceramic Mug', 'Travel Journal', 'Throw Pillow', 'Wall Clock', 'Planter', 'Notebook'];

function normalizeShopDomain(value) {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

function requireConfig() {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error('PRODUCT_COUNT must be an integer from 1 to 50.');
  }

  if (!['ACTIVE', 'ARCHIVED', 'DRAFT'].includes(status)) {
    throw new Error('PRODUCT_STATUS must be ACTIVE, ARCHIVED, or DRAFT.');
  }

  if (!shop || !accessToken) {
    throw new Error('Set SHOPIFY_SHOP and SHOPIFY_ADMIN_ACCESS_TOKEN.');
  }
}

async function loadOperation() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  return readFile(resolve(scriptDir, '../src/Operations/product-create-basic.graphql'), 'utf8');
}

function buildProduct(index) {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const suffix = randomUUID().slice(0, 8);
  const title = `${adjective} ${noun} ${suffix}`;

  return {
    title,
    descriptionHtml: `<p>Random MCP-generated product ${index + 1} of ${count}. Created for store setup testing.</p>`,
    vendor: 'Digital Impression MCP',
    productType: 'Random MCP Product',
    status,
  };
}

async function createProduct(query, product) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000);

  try {
    const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables: { product } }),
      signal: controller.signal,
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body?.errors?.[0]?.message || `Shopify HTTP ${response.status}`);
    }

    if (body?.errors?.length > 0) {
      throw new Error(body.errors.map((error) => error.message).join('; '));
    }

    const userErrors = body?.data?.productCreate?.userErrors || [];
    if (userErrors.length > 0) {
      throw new Error(userErrors.map((error) => error.message).join('; '));
    }

    return body.data.productCreate.product;
  } finally {
    clearTimeout(timer);
  }
}

try {
  requireConfig();
  const query = await loadOperation();
  const created = [];
  for (let index = 0; index < count; index += 1) {
    const product = await createProduct(query, buildProduct(index));
    created.push(product);
    console.log(`Created ${product.id}: ${product.title}`);
  }

  console.log(JSON.stringify({ created }, null, 2));
} catch (error) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
    console.error(`${error.message}${cause}`);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}
