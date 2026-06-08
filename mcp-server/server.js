#!/usr/bin/env node

const baseUrl = process.env.MCP_MIDDLEWARE_BASE_URL;
const sharedSecret = process.env.MCP_SHARED_SECRET;
const timeoutMs = Number.parseInt(process.env.MCP_HTTP_TIMEOUT_MS || '15000', 10);

if (!baseUrl || !sharedSecret) {
  console.error('MCP_MIDDLEWARE_BASE_URL and MCP_SHARED_SECRET are required.');
  process.exit(1);
}

if (process.argv.includes('--smoke')) {
  console.log(JSON.stringify({ ok: true, name: 'shopify-middleware-mcp' }));
  process.exit(0);
}

const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = await import('zod');

const server = new McpServer({
  name: 'shopify-middleware-mcp',
  version: '1.0.0',
});

const first = z.number().int().min(1).max(50).default(10);
const query = z.string().max(250).optional().default('');
const gid = z.string().startsWith('gid://shopify/');

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

function registerTool(name, description, schema, endpoint) {
  server.tool(name, description, schema, async (args) => {
    const result = await callMiddleware(endpoint, args);
    return toolResponse(result);
  });
}

registerTool('shop_info', 'Read Shopify shop metadata.', {}, 'api/shop/info');
registerTool('products_search', 'Search Shopify products by safe Shopify query syntax.', { first, query }, 'api/products/search');
registerTool('product_get', 'Get a Shopify product by GID.', { id: gid }, 'api/products/get');
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
);
registerTool('collections_search', 'Search collections.', { first, query }, 'api/collections/search');
registerTool('pages_search', 'Search online store pages.', { first, query }, 'api/pages/search');
registerTool('blogs_list', 'List blogs.', { first }, 'api/blogs/list');
registerTool('articles_search', 'Search articles.', { first, query }, 'api/articles/search');
registerTool('metafields_list', 'List metafields for a Shopify owner GID.', { ownerId: gid, first }, 'api/metafields/list');
registerTool('files_search', 'Search Shopify files.', { first, query }, 'api/files/search');
registerTool('themes_list', 'List Shopify themes.', { first }, 'api/themes/list');
registerTool('theme_file_list', 'List files for a theme GID.', { themeId: gid, first: z.number().int().min(1).max(100).default(25) }, 'api/themes/files/list');
registerTool('theme_file_get', 'Get a single theme file by theme GID and filename.', { themeId: gid, filename: z.string().max(500) }, 'api/themes/files/get');

const transport = new StdioServerTransport();
await server.connect(transport);
