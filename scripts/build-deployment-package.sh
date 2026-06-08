#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/dist/deploy-build"
PACKAGE_BASE="${ROOT_DIR}/dist/shopify-mcp-middleware-deploy"
INCLUDE_PRODUCTION_CONFIG="${INCLUDE_PRODUCTION_CONFIG:-0}"

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}/public" "${BUILD_DIR}/config" "${BUILD_DIR}/storage/logs"

cp "${ROOT_DIR}/.htaccess" "${BUILD_DIR}/.htaccess"
cp "${ROOT_DIR}/public/index.php" "${BUILD_DIR}/public/index.php"
cp -R "${ROOT_DIR}/src" "${BUILD_DIR}/src"
cp "${ROOT_DIR}/config/app.example.php" "${BUILD_DIR}/config/app.example.php"
touch "${BUILD_DIR}/storage/logs/.gitkeep"

if [[ "${INCLUDE_PRODUCTION_CONFIG}" == "1" ]]; then
    : "${SHOPIFY_ADMIN_ACCESS_TOKEN:?Set SHOPIFY_ADMIN_ACCESS_TOKEN to include production config}"
    : "${MCP_SHARED_SECRET:?Set MCP_SHARED_SECRET to include production config}"
    export SHOPIFY_SHOP="${SHOPIFY_SHOP:-codex-mcp-2.myshopify.com}"
    export SHOPIFY_ADMIN_API_VERSION="${SHOPIFY_ADMIN_API_VERSION:-2025-10}"
    export BUILD_DIR

    php -r '
        $shop = var_export(getenv("SHOPIFY_SHOP"), true);
        $apiVersion = var_export(getenv("SHOPIFY_ADMIN_API_VERSION"), true);
        $accessToken = var_export(getenv("SHOPIFY_ADMIN_ACCESS_TOKEN"), true);
        $sharedSecret = var_export(getenv("MCP_SHARED_SECRET"), true);
        $php = <<<PHP
<?php

return [
    "shopify" => [
        "shop" => {$shop},
        "admin_api_version" => {$apiVersion},
        "admin_access_token" => {$accessToken},
    ],
    "security" => [
        "shared_secret" => {$sharedSecret},
    ],
    "logging" => [
        "path" => dirname(__DIR__) . "/storage/logs/app.log",
    ],
];
PHP;
        file_put_contents(getenv("BUILD_DIR") . "/config/app.php", $php);
    '
fi

rm -f "${PACKAGE_BASE}.zip" "${PACKAGE_BASE}.tar.gz"
tar -C "${BUILD_DIR}" -czf "${PACKAGE_BASE}.tar.gz" .
echo "Created ${PACKAGE_BASE}.tar.gz"

if command -v zip >/dev/null 2>&1; then
    (cd "${BUILD_DIR}" && zip -qr "${PACKAGE_BASE}.zip" .)
    echo "Created ${PACKAGE_BASE}.zip"
else
    echo "zip command not found; skipped ${PACKAGE_BASE}.zip"
fi

cat <<MSG

Package contents are staged in:
${BUILD_DIR}
MSG

if [[ "${INCLUDE_PRODUCTION_CONFIG}" == "1" ]]; then
    cat <<'MSG'

Production config/app.php was included from environment variables.
Do not commit or publicly share this generated package.
MSG
else
    cat <<'MSG'

IMPORTANT: The package intentionally does not include config/app.php or any real secrets.
Create config/app.php on the server from config/app.example.php after upload.
MSG
fi
