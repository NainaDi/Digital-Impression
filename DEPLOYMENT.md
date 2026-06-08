# Manual shared-hosting deployment

Use this guide when FTP/SFTP is not reachable from the agent environment and you need to upload the Shopify MCP middleware manually.

## 1. Build the final deployment package

From the repository root, run:

```bash
./scripts/build-deployment-package.sh
```

This creates `dist/shopify-mcp-middleware-deploy.zip` when `zip` is installed, otherwise `dist/shopify-mcp-middleware-deploy.tar.gz`. The generated package intentionally excludes `config/app.php` and all real secrets.

## 2. Upload target directory

Upload/extract the package contents into this hosting directory:

```text
/thedigitalimpressions.com/downloads/mcp
```

That directory should correspond to this public URL:

```text
https://thedigitalimpressions.com/downloads/mcp
```

## 3. Files and folders to upload

The package contains these runtime paths:

```text
.htaccess
public/index.php
src/
config/app.example.php
storage/logs/.gitkeep
```

After upload, create this server-only file manually:

```text
config/app.php
```

Do not commit `config/app.php` to git and do not place real credentials in `config/app.example.php`.

## 4. Create `config/app.php`

On the hosting server, copy `config/app.example.php` to `config/app.php` and replace placeholders with the production values:

```php
<?php

return [
    'shopify' => [
        'shop' => 'codex-mcp-2.myshopify.com',
        'admin_api_version' => '2025-10',
        'admin_access_token' => 'REPLACE_WITH_SHOPIFY_ADMIN_API_ACCESS_TOKEN',
    ],
    'security' => [
        'shared_secret' => 'REPLACE_WITH_MCP_SHARED_SECRET',
    ],
    'logging' => [
        'path' => dirname(__DIR__) . '/storage/logs/app.log',
    ],
];
```

Use the Shopify Admin API access token and MCP shared secret you provided for deployment, preferably rotated before production use because they were shared in chat.

## 5. Required permissions

Ensure PHP can write to:

```text
storage/logs
```

Recommended directory/file permissions vary by host, but typical shared-hosting defaults are:

```text
folders: 755
files: 644
storage/logs: writable by the PHP user
```

## 6. Test middleware routing after upload

First confirm the front controller is reachable:

```bash
curl --fail --show-error --silent \
  https://thedigitalimpressions.com/downloads/mcp/health
```

Expected response:

```json
{
  "ok": true,
  "service": "shopify-middleware"
}
```

## 7. Verify Shopify connection

After `config/app.php` exists on the server, run:

```bash
MCP_MIDDLEWARE_BASE_URL=https://thedigitalimpressions.com/downloads/mcp \
MCP_SHARED_SECRET=REPLACE_WITH_MCP_SHARED_SECRET \
./scripts/verify-shop-info.sh
```

Or use cURL directly:

```bash
curl --fail --show-error --silent \
  --request POST 'https://thedigitalimpressions.com/downloads/mcp/api/shop/info' \
  --header 'Authorization: Bearer REPLACE_WITH_MCP_SHARED_SECRET' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

A successful JSON response with Shopify `shop` data confirms the middleware is connected to Shopify.

## 8. Register MCP in Codex after manual deployment

Install Node dependencies in this repository:

```bash
./scripts/setup-node.sh
```

Then register this MCP server in Codex using the project-scoped example in `.codex/config.toml.example`:

```toml
[mcp_servers.shopify-middleware]
command = "node"
args = ["/absolute/path/to/mcp-shopify-middleware/mcp-server/server.js"]

[mcp_servers.shopify-middleware.env]
MCP_MIDDLEWARE_BASE_URL = "https://thedigitalimpressions.com/downloads/mcp"
MCP_SHARED_SECRET = "REPLACE_WITH_MCP_SHARED_SECRET"
MCP_HTTP_TIMEOUT_MS = "15000"
```

After registration, restart Codex so it loads the MCP server. The MCP bridge exposes only allowlisted tools and calls the deployed PHP middleware over HTTPS.

## 9. GitHub Actions deployment artifact from secrets

If `SHOPIFY_ADMIN_ACCESS_TOKEN` and `MCP_SHARED_SECRET` are configured as GitHub Actions repository secrets, run the **Shopify MCP Middleware** workflow from the GitHub Actions tab.

The workflow will:

1. Validate PHP syntax.
2. Install MCP bridge Node dependencies and run the MCP smoke test.
3. Verify the Shopify Admin API connection using `SHOPIFY_ADMIN_ACCESS_TOKEN` without printing the token.
4. Build `shopify-mcp-middleware-deploy.zip` with a generated `config/app.php` populated from GitHub Actions secrets.
5. Upload the zip as a short-lived workflow artifact named `shopify-mcp-middleware-deploy`.

Download that artifact and upload/extract it to:

```text
/thedigitalimpressions.com/downloads/mcp
```

Because the Actions artifact includes `config/app.php`, do not share it publicly and do not commit it back to the repository.

### Required GitHub Actions secrets

```text
SHOPIFY_ADMIN_ACCESS_TOKEN
MCP_SHARED_SECRET
```

### Non-secret workflow defaults

```text
SHOPIFY_SHOP=codex-mcp-2.myshopify.com
SHOPIFY_ADMIN_API_VERSION=2025-10
MCP_MIDDLEWARE_BASE_URL=https://thedigitalimpressions.com/downloads/mcp
MCP_HTTP_TIMEOUT_MS=15000
```

### Still required outside GitHub Actions

GitHub Actions always creates the upload artifact. Push-triggered runs stop there. Manual runs from the Actions tab also deploy over SSH when the SSH deployment secrets below are present; there is no separate `deploy_over_ssh` option to select.

## 13. Optional GitHub Actions SSH deployment

If this environment cannot SSH into the new server directly, GitHub Actions can deploy the generated middleware package from GitHub's runners instead.

Add these GitHub Actions repository secrets:

```text
SHOPIFY_ADMIN_ACCESS_TOKEN=<Shopify Admin API access token>
MCP_SHARED_SECRET=<MCP shared secret>
SSH_HOST=65.2.30.134
SSH_USERNAME=satori
SSH_PASSWORD=<SSH password>
SSH_TARGET_DIR=/var/www/html/downloads/mcp
PUBLIC_BASE_URL=http://65.2.30.134/downloads/mcp
```

`PUBLIC_BASE_URL` is required for SSH deployment verification. Use `http://65.2.30.134/downloads/mcp` until DNS and SSL are configured for `thedigitalimpressions.com`, then switch it to `https://thedigitalimpressions.com/downloads/mcp`.


### Amazon Linux Apache/httpd target setup

On the new Amazon Linux server, Apache serves from `/var/www/html` by default. After installing `httpd` and PHP, the expected middleware target is:

```text
SSH_TARGET_DIR=/var/www/html/downloads/mcp
PUBLIC_BASE_URL=http://65.2.30.134/downloads/mcp
```

The middleware relies on `.htaccess` rewrite rules to route `/health` and `/api/...` to `public/index.php`, so Apache must allow overrides for this directory. Run this once on the server if `/health` returns 404 after deployment:

```bash
sudo tee /etc/httpd/conf.d/shopify-mcp-middleware.conf >/dev/null <<'APACHE'
<Directory "/var/www/html/downloads/mcp">
    AllowOverride All
    Require all granted
</Directory>
APACHE
sudo systemctl restart httpd
```

Also verify the PHP cURL extension is installed because the Shopify client uses PHP `curl_*` functions to call Admin GraphQL. If `php -m | grep -i curl` returns no output, install the extension with the package name available on the server, then restart Apache.

Run the **Shopify MCP Middleware** workflow manually from the Actions tab. The workflow will deploy automatically on manual runs and will:

1. Validate PHP syntax.
2. Install and smoke-test the Node MCP bridge.
3. Verify the Shopify Admin API token against Shopify Admin GraphQL.
4. Build both `dist/shopify-mcp-middleware-deploy.zip` and `dist/shopify-mcp-middleware-deploy.tar.gz` with production `config/app.php` generated from GitHub Secrets.
5. Copy the tarball to the SSH server with the password secret.
6. Extract it into `SSH_TARGET_DIR`.
7. Call `${PUBLIC_BASE_URL}/health`.
8. Call `${PUBLIC_BASE_URL}/api/shop/info` with `MCP_SHARED_SECRET` to verify the deployed Shopify connection.

For the Amazon Linux server prepared with Apache/httpd, use `SSH_TARGET_DIR=/var/www/html/downloads/mcp`. If you later change the Apache document root or domain virtual host, update `SSH_TARGET_DIR` to the directory that maps to the public middleware URL.
