#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const count = Number.parseInt(process.env.PRODUCT_COUNT || '5', 10);
const status = process.env.PRODUCT_STATUS || 'DRAFT';
const shop = normalizeShopDomain(process.env.SHOPIFY_SHOP || '');
const accessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || '2025-10';
const timeoutMs = Number.parseInt(process.env.MCP_HTTP_TIMEOUT_MS || '15000', 10);
const execFileAsync = promisify(execFile);

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

async function postJson(url, headers, payload) {
  const requestTimeoutMs = Number.isFinite(timeoutMs) ? timeoutMs : 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error;
    }

    return postJsonWithCurl(url, headers, payload, requestTimeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

async function postJsonWithCurl(url, headers, payload, requestTimeoutMs) {
  const args = [
    '--silent',
    '--show-error',
    '--connect-timeout',
    String(Math.max(1, Math.ceil(requestTimeoutMs / 1000))),
    '--max-time',
    String(Math.max(1, Math.ceil(requestTimeoutMs / 1000))),
    '--write-out',
    '\n%{http_code}',
    '--request',
    'POST',
    url,
  ];

  for (const [name, value] of Object.entries(headers)) {
    args.push('--header', `${name}: ${value}`);
  }

  args.push('--data', JSON.stringify(payload));

  let stdout;
  try {
    ({ stdout } = await execFileAsync('curl', args, {
      maxBuffer: 1024 * 1024 * 10,
      timeout: requestTimeoutMs + 1000,
    }));
  } catch (error) {
    throw new Error(error?.stderr || 'curl request failed.');
  }

  const separator = stdout.lastIndexOf('\n');
  const text = separator === -1 ? stdout : stdout.slice(0, separator);
  const status = Number.parseInt(separator === -1 ? '0' : stdout.slice(separator + 1), 10);

  return {
    ok: status >= 200 && status < 300,
    status,
    text,
  };
}

async function createProduct(query, product) {
  const response = await postJson(
    `https://${shop}/admin/api/${apiVersion}/graphql.json`,
    {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    { query, variables: { product } },
  );

  let body;
  try {
    body = response.text ? JSON.parse(response.text) : null;
  } catch {
    throw new Error('Shopify returned an invalid JSON response.');
  }

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
