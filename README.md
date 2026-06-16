# mcp-shopify-middleware

Safe Shopify Admin GraphQL middleware and Codex MCP bridge for the Shopify store `codex-mcp-2.myshopify.com`.

## What this project contains

- PHP 8.1+ JSON middleware in `public/index.php`.
- Stored Shopify Admin GraphQL operations in `src/Operations`.
- Centralized validation, shared-secret auth, safe logging, and JSON errors.
- Node.js stdio MCP bridge in `mcp-server/server.js` named `shopify-middleware-mcp` with PHP middleware mode and direct Shopify Admin API mode.
- Allowlisted tools only. Callers cannot submit arbitrary raw GraphQL.

## Security first

Do **not** commit real Shopify tokens, shared secrets, FTP passwords, or `.env` files. The credentials originally provided for setup should be rotated before production use because they were shared in chat. Configure secrets through hosting environment variables, an untracked `config/app.php`, or Codex Cloud environment variables.

Authentication accepts either:

- `Authorization: Bearer <MCP_SHARED_SECRET>`
- `X-MCP-Secret: <MCP_SHARED_SECRET>`

The logger redacts keys containing `token`, `secret`, or `authorization` before writing runtime logs.

## Required environment variables

### PHP middleware

| Variable | Description |
| --- | --- |
| `SHOPIFY_SHOP` | Shopify shop domain, for example `codex-mcp-2.myshopify.com`. |
| `SHOPIFY_ADMIN_API_VERSION` | Shopify Admin API version, default `2025-10`. |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify Admin API access token. |
| `MCP_SHARED_SECRET` | Long random secret shared by the MCP bridge and PHP middleware. |
| `LOG_PATH` | Optional log path, default `storage/logs/app.log`. |

### Node MCP bridge / Codex Cloud

The bridge supports two connection modes. If `MCP_MIDDLEWARE_BASE_URL` and `MCP_SHARED_SECRET` are present, it tries the PHP middleware first. When direct Shopify credentials are also present, the bridge falls back to Shopify Admin GraphQL if the middleware call fails. If middleware variables are omitted, it connects directly to Shopify Admin GraphQL when `SHOPIFY_SHOP` and `SHOPIFY_ADMIN_ACCESS_TOKEN` are present.

| Variable | Description |
| --- | --- |
| `MCP_MIDDLEWARE_BASE_URL` | Public middleware base URL, for example `https://thedigitalimpressions.com/downloads/mcp`. Required for middleware mode. |
| `MCP_SHARED_SECRET` | Same shared secret configured for PHP middleware. Required for middleware mode. |
| `SHOPIFY_SHOP` | Shopify shop domain, for example `codex-mcp-2.myshopify.com`. Required for direct mode. |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Shopify Admin API access token. Required for direct mode. |
| `SHOPIFY_ADMIN_API_VERSION` | Shopify Admin API version for direct mode, default `2025-10`. |
| `MCP_HTTP_TIMEOUT_MS` | Optional HTTP timeout for middleware or direct mode, default `15000`. |

Use `.env.example` as a template only. Do not commit `.env`.

## Middleware endpoints

All API endpoints are `POST` and return JSON.

| Endpoint | Purpose |
| --- | --- |
| `/api/shop/info` | Read shop metadata. |
| `/api/products/search` | Search products. |
| `/api/products/get` | Get one product by GID. |
| `/api/products/create-basic` | Create a product with allowlisted basic fields only. |
| `/api/products/update-basic` | Update allowlisted basic product fields only. |
| `/api/collections/search` | Search collections. |
| `/api/pages/search` | Search pages. |
| `/api/blogs/list` | List blogs. |
| `/api/articles/search` | Search articles. |
| `/api/metafields/list` | List metafields for a Shopify owner GID. |
| `/api/files/search` | Search files. |
| `/api/themes/list` | List themes. |
| `/api/themes/files/list` | List theme files. |
| `/api/themes/files/get` | Get one theme file. |

There is intentionally no raw GraphQL endpoint.

## MCP tools

The bridge exposes allowlisted tools that map one-to-one to the PHP middleware endpoints:

- `shop_info`
- `products_search`
- `product_get`
- `product_create_basic`
- `product_update_basic`
- `collections_search`
- `pages_search`
- `blogs_list`
- `articles_search`
- `metafields_list`
- `files_search`
- `themes_list`
- `theme_file_list`
- `theme_file_get`

## Local setup

Install Node dependencies:

```bash
./scripts/setup-node.sh
```

Validate PHP syntax:

```bash
./scripts/validate-php.sh
```

Run the MCP bridge smoke test:

```bash
npm --prefix mcp-server run smoke
```

Create five random draft products directly in Shopify when Admin API credentials are available:

```bash
SHOPIFY_SHOP=codex-mcp-2.myshopify.com \
SHOPIFY_ADMIN_ACCESS_TOKEN=replace_with_your_admin_token \
PRODUCT_COUNT=5 \
PRODUCT_STATUS=DRAFT \
node scripts/create-random-products.js
```

Optionally call the deployed middleware if environment variables are available:

```bash
MCP_MIDDLEWARE_BASE_URL=https://thedigitalimpressions.com/downloads/mcp \
MCP_SHARED_SECRET=replace_with_your_shared_secret \
./scripts/verify-shop-info.sh
```

## Codex Cloud setup

### Middleware mode

1. Add these Codex Cloud environment variables:
   - `MCP_MIDDLEWARE_BASE_URL=https://thedigitalimpressions.com/downloads/mcp`
   - `MCP_SHARED_SECRET=<rotated shared secret>`
   - `MCP_HTTP_TIMEOUT_MS=15000`
2. Install Node dependencies in the `mcp-server` directory.
3. Register the MCP server with name `shopify-middleware`, command `node`, and args pointing to this repository's `mcp-server/server.js`.

### Direct Shopify mode

Use this when the PHP middleware is not deployed or when Codex should connect straight to Shopify. Do not commit real tokens. Store them as Codex environment variables or in an untracked local config.

1. Add these Codex Cloud environment variables:
   - `SHOPIFY_SHOP=codex-mcp-2.myshopify.com`
   - `SHOPIFY_ADMIN_API_VERSION=2025-10`
   - `SHOPIFY_ADMIN_ACCESS_TOKEN=<rotated Shopify Admin API token>`
   - `MCP_HTTP_TIMEOUT_MS=15000`
2. Install Node dependencies in the `mcp-server` directory.
3. Register the MCP server with name `shopify-direct`, command `node`, and args pointing to this repository's `mcp-server/server.js`.

Project-scoped examples for both modes are available in `.codex/config.toml.example`:

```toml
[mcp_servers.shopify-middleware]
command = "node"
args = ["/absolute/path/to/mcp-shopify-middleware/mcp-server/server.js"]

[mcp_servers.shopify-middleware.env]
MCP_MIDDLEWARE_BASE_URL = "https://thedigitalimpressions.com/downloads/mcp"
MCP_SHARED_SECRET = "replace_with_your_shared_secret"
MCP_HTTP_TIMEOUT_MS = "15000"

#[mcp_servers.shopify-direct]
#command = "node"
#args = ["/absolute/path/to/mcp-shopify-middleware/mcp-server/server.js"]
#
#[mcp_servers.shopify-direct.env]
#SHOPIFY_SHOP = "codex-mcp-2.myshopify.com"
#SHOPIFY_ADMIN_API_VERSION = "2025-10"
#SHOPIFY_ADMIN_ACCESS_TOKEN = "replace_with_your_admin_token"
#MCP_HTTP_TIMEOUT_MS = "15000"
```

## Sample cURL requests

Shop info:

```bash
curl --request POST 'https://thedigitalimpressions.com/downloads/mcp/api/shop/info' \
  --header 'Authorization: Bearer replace_with_your_shared_secret' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

Search products:

```bash
curl --request POST 'https://thedigitalimpressions.com/downloads/mcp/api/products/search' \
  --header 'Authorization: Bearer replace_with_your_shared_secret' \
  --header 'Content-Type: application/json' \
  --data '{"query":"status:active","first":10}'
```

Get product:

```bash
curl --request POST 'https://thedigitalimpressions.com/downloads/mcp/api/products/get' \
  --header 'Authorization: Bearer replace_with_your_shared_secret' \
  --header 'Content-Type: application/json' \
  --data '{"id":"gid://shopify/Product/1234567890"}'
```

Create a basic draft product:

```bash
curl --request POST 'https://thedigitalimpressions.com/downloads/mcp/api/products/create-basic' \
  --header 'Authorization: Bearer replace_with_your_shared_secret' \
  --header 'Content-Type: application/json' \
  --data '{"title":"Random test product","status":"DRAFT","vendor":"Digital Impression MCP","productType":"Random MCP Product"}'
```

Update basic product fields:

```bash
curl --request POST 'https://thedigitalimpressions.com/downloads/mcp/api/products/update-basic' \
  --header 'Authorization: Bearer replace_with_your_shared_secret' \
  --header 'Content-Type: application/json' \
  --data '{"id":"gid://shopify/Product/1234567890","title":"Updated title"}'
```


## GitHub Actions packaging

The repository includes a `Shopify MCP Middleware` GitHub Actions workflow. Configure these repository secrets before running it:

- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `MCP_SHARED_SECRET`

The workflow validates PHP, runs the MCP bridge smoke test, verifies Shopify Admin API access, and uploads a `shopify-mcp-middleware-deploy` artifact containing a generated production `config/app.php`. The artifact contains secrets, so download it only for deployment and do not commit or share it.

GitHub Actions does not currently deploy to shared hosting by itself; upload the artifact manually or add hosting deployment credentials/API details.

## Shared hosting / FTP deployment notes

Do not deploy until you intentionally choose to do so.

For shared hosting, upload these paths to the target directory, for example `/thedigitalimpressions.com/downloads/mcp`:

- `public/index.php`
- `src/`
- `config/app.example.php` or an untracked production `config/app.php`
- `storage/logs/.gitkeep` and a writable `storage/logs` directory

If the web root maps directly to the target directory rather than `public/`, configure the host so requests route to `public/index.php`, or copy the contents of `public/` into the public target and update `$rootPath` accordingly. Prefer a rewrite rule that preserves `public/index.php` as the front controller.

Production configuration options:

1. Environment variables set in the hosting panel, or
2. An untracked `config/app.php` copied from `config/app.example.php` with real values.

Ensure `storage/logs` is writable by PHP and that direct web access to `src`, `config`, and `storage` is blocked by hosting rules.

## Exact next steps

1. Rotate the Shopify Admin token and shared secret before production use.
2. Put production PHP config on the host through environment variables or untracked `config/app.php`.
3. Deploy only after approval.
4. Register Codex MCP using `.codex/config.toml.example` as the template. Use direct mode if the PHP middleware is not deployed.
