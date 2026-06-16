#!/usr/bin/env node

const baseUrl = process.env.MCP_MIDDLEWARE_BASE_URL;
const sharedSecret = process.env.MCP_SHARED_SECRET;
const shopifyShop = normalizeShopDomain(process.env.SHOPIFY_SHOP || '');
const shopifyAccessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const shopifyApiVersion = process.env.SHOPIFY_ADMIN_API_VERSION || '2025-10';
const timeoutMs = Number.parseInt(process.env.MCP_HTTP_TIMEOUT_MS || '15000', 10);
const canUseMiddleware = Boolean(baseUrl && sharedSecret);
const canUseDirect = Boolean(shopifyShop && shopifyAccessToken);
const mode = canUseMiddleware ? 'middleware' : canUseDirect ? 'direct' : '';

function normalizeShopDomain(value) {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

if (!mode) {
  console.error('Set MCP_MIDDLEWARE_BASE_URL with MCP_SHARED_SECRET, or set SHOPIFY_SHOP with SHOPIFY_ADMIN_ACCESS_TOKEN.');
  process.exit(1);
}

if (process.argv.includes('--smoke')) {
  console.log(JSON.stringify({ ok: true, name: 'shopify-middleware-mcp' }));
  process.exit(0);
}

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = await import('zod');
const { readFile } = await import('node:fs/promises');
const { dirname, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const { execFile } = await import('node:child_process');
const { promisify } = await import('node:util');

const server = new McpServer({
  name: 'shopify-middleware-mcp',
  version: '1.0.0',
});

const first = z.number().int().min(1).max(50).default(10);
const query = z.string().max(250).optional().default('');
const gid = z.string().startsWith('gid://shopify/');
const execFileAsync = promisify(execFile);

async function callMiddleware(endpoint, payload = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000);

  try {
    const url = new URL(endpoint, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${sharedSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { ok: false, error: 'Middleware returned non-JSON response.', raw: text.slice(0, 500) };
    }

    if (!response.ok || body?.ok === false) {
      const message = body?.error || `Middleware HTTP ${response.status}`;
      throw new Error(message);
    }

    return body;
  } finally {
    clearTimeout(timer);
  }
}

function shopifyGraphqlUrl() {
  return `https://${shopifyShop}/admin/api/${shopifyApiVersion}/graphql.json`;
}

async function loadStoredOperation(operationName) {
  if (!/^[A-Za-z0-9_-]+$/.test(operationName)) {
    throw new Error('Invalid operation name.');
  }

  const serverDir = dirname(fileURLToPath(import.meta.url));
  const operationPath = resolve(serverDir, '../src/Operations', `${operationName}.graphql`);
  const query = await readFile(operationPath, 'utf8');
  if (!query.trim()) {
    throw new Error('Operation is empty.');
  }

  return query;
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

async function callShopify(operationName, variables = {}) {
  const query = await loadStoredOperation(operationName);
  const response = await postJson(
    shopifyGraphqlUrl(),
    {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyAccessToken,
    },
    { query, variables },
  );

  let body;
  try {
    body = response.text ? JSON.parse(response.text) : null;
  } catch {
    body = { errors: [{ message: 'Shopify returned a non-JSON response.', raw: response.text.slice(0, 500) }] };
  }

  if (!response.ok) {
    const message = body?.errors?.[0]?.message || `Shopify HTTP ${response.status}`;
    throw new Error(message);
  }

  if (body?.errors?.length > 0) {
    throw new Error(body.errors.map((error) => error.message).join('; '));
  }

  return body;
}

function asProductUpdateVariables(args) {
  const { id, ...fields } = args;
  const product = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(product).length === 0) {
    throw new Error('At least one editable product field is required.');
  }

  return { product: { id, ...product } };
}

function toolResponse(payload) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function registerTool(name, description, schema, endpoint, operationName, mapVariables = (args) => args) {
  server.tool(name, description, schema, async (args) => {
    if (mode === 'middleware') {
      try {
        return toolResponse(await callMiddleware(endpoint, args));
      } catch (error) {
        if (!canUseDirect) {
          throw error;
        }
      }
    }

    return toolResponse(await callShopify(operationName, mapVariables(args)));
  });
}

registerTool('shop_info', 'Read Shopify shop metadata.', {}, 'api/shop/info', 'shop-info');
registerTool('products_search', 'Search Shopify products by safe Shopify query syntax.', { first, query }, 'api/products/search', 'products-search');
registerTool('product_get', 'Get a Shopify product by GID.', { id: gid }, 'api/products/get', 'product-get');
registerTool(
  'product_create_basic',
  'Create a Shopify product with allowlisted basic fields: title, descriptionHtml, vendor, productType, and status.',
  {
    title: z.string().min(1).max(255),
    descriptionHtml: z.string().max(50000).optional(),
    vendor: z.string().max(255).optional(),
    productType: z.string().max(255).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'DRAFT']).optional(),
  },
  'api/products/create-basic',
  'product-create-basic',
);
registerTool(
  'product_update_basic',
  'Update allowlisted basic product fields only: title, descriptionHtml, vendor, productType, and status.',
  {
    id: gid,
    title: z.string().max(255).optional(),
    descriptionHtml: z.string().max(50000).optional(),
    vendor: z.string().max(255).optional(),
    productType: z.string().max(255).optional(),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'DRAFT']).optional(),
  },
  'api/products/update-basic',
  'product-update-basic',
  asProductUpdateVariables,
);
registerTool('collections_search', 'Search collections.', { first, query }, 'api/collections/search', 'collections-list');
registerTool('pages_search', 'Search online store pages.', { first, query }, 'api/pages/search', 'pages-list');
registerTool('blogs_list', 'List blogs.', { first }, 'api/blogs/list', 'blogs-list');
registerTool('articles_search', 'Search articles.', { first, query }, 'api/articles/search', 'articles-list');
registerTool('metafields_list', 'List metafields for a Shopify owner GID.', { ownerId: gid, first }, 'api/metafields/list', 'metafields-list');
registerTool('files_search', 'Search Shopify files.', { first, query }, 'api/files/search', 'files-list');
registerTool('themes_list', 'List Shopify themes.', { first }, 'api/themes/list', 'themes-list');
registerTool('theme_file_list', 'List files for a theme GID.', { themeId: gid, first: z.number().int().min(1).max(100).default(25) }, 'api/themes/files/list', 'theme-file-list');
registerTool('theme_file_get', 'Get a single theme file by theme GID and filename.', { themeId: gid, filename: z.string().max(500) }, 'api/themes/files/get', 'theme-file-get');

const transport = new StdioServerTransport();
await server.connect(transport);
