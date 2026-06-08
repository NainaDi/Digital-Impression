<?php

return [
    'shopify' => [
        'shop' => getenv('SHOPIFY_SHOP') ?: 'codex-mcp-2.myshopify.com',
        'admin_api_version' => getenv('SHOPIFY_ADMIN_API_VERSION') ?: '2025-10',
        'admin_access_token' => getenv('SHOPIFY_ADMIN_ACCESS_TOKEN') ?: '',
    ],
    'security' => [
        'shared_secret' => getenv('MCP_SHARED_SECRET') ?: '',
    ],
    'logging' => [
        'path' => getenv('LOG_PATH') ?: dirname(__DIR__) . '/storage/logs/app.log',
    ],
];
