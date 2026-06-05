<?php

declare(strict_types=1);

use App\Controllers\ProductController;
use App\Controllers\ReadOnlyController;
use App\Controllers\ShopController;
use App\Helpers\Config;
use App\Helpers\JsonResponse;
use App\Helpers\Logger;
use App\Services\OperationLoader;
use App\Services\ShopifyAdminClient;
use App\Validators\AuthValidator;
use App\Validators\InputValidator;

$rootPath = dirname(__DIR__);

spl_autoload_register(static function (string $class) use ($rootPath): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $path = $rootPath . '/src/' . str_replace('\\', '/', $relative) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

$config = new Config($rootPath);
$logger = new Logger((string) $config->get('logging.path', $rootPath . '/storage/logs/app.log'));

set_exception_handler(static function (Throwable $throwable) use ($logger): void {
    $status = $throwable instanceof InvalidArgumentException ? 422 : 500;
    $logger->error('Request failed', [
        'exception' => get_class($throwable),
        'message' => $throwable->getMessage(),
        'file' => $throwable->getFile(),
        'line' => $throwable->getLine(),
    ]);

    JsonResponse::send([
        'ok' => false,
        'error' => $status === 422 ? $throwable->getMessage() : 'Internal server error.',
    ], $status);
});

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$scriptName = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '');
$scriptDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
$projectDir = basename($scriptDir) === 'public' ? rtrim(dirname($scriptDir), '/') : $scriptDir;

foreach (array_unique([$scriptDir, $projectDir]) as $basePath) {
    if ($basePath !== '' && $basePath !== '/' && str_starts_with($path, $basePath)) {
        $path = substr($path, strlen($basePath)) ?: '/';
        break;
    }
}

if (str_starts_with($path, '/public/')) {
    $path = substr($path, strlen('/public')) ?: '/';
}

if ($method === 'GET' && $path === '/health') {
    JsonResponse::send(['ok' => true, 'service' => 'shopify-middleware']);
}

if ($method !== 'POST') {
    JsonResponse::send(['ok' => false, 'error' => 'Only POST requests are supported.'], 405);
}

$headers = [];
foreach ($_SERVER as $key => $value) {
    if (str_starts_with($key, 'HTTP_')) {
        $name = strtolower(str_replace('_', '-', substr($key, 5)));
        $headers[$name] = (string) $value;
    }
}
if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) && !isset($headers['authorization'])) {
    $headers['authorization'] = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
}
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $headers['authorization'] = (string) $_SERVER['HTTP_AUTHORIZATION'];
}

$auth = new AuthValidator((string) $config->get('security.shared_secret', ''));
if (!$auth->isAuthorized($headers)) {
    JsonResponse::send(['ok' => false, 'error' => 'Unauthorized.'], 401);
}

$rawBody = file_get_contents('php://input') ?: '{}';
$input = json_decode($rawBody, true);
if (!is_array($input)) {
    JsonResponse::send(['ok' => false, 'error' => 'Request body must be a JSON object.'], 400);
}

$operationLoader = new OperationLoader($rootPath . '/src/Operations');
$shopify = new ShopifyAdminClient(
    (string) $config->get('shopify.shop', ''),
    (string) $config->get('shopify.admin_api_version', ''),
    (string) $config->get('shopify.admin_access_token', ''),
    $operationLoader,
);
$validator = new InputValidator();

$shopController = new ShopController($shopify);
$productController = new ProductController($shopify, $validator);
$readOnlyController = new ReadOnlyController($shopify, $validator);

$routes = [
    '/api/shop/info' => [$shopController, 'info'],
    '/api/products/search' => [$productController, 'search'],
    '/api/products/get' => [$productController, 'get'],
    '/api/products/update-basic' => [$productController, 'updateBasic'],
    '/api/collections/search' => [$readOnlyController, 'collections'],
    '/api/pages/search' => [$readOnlyController, 'pages'],
    '/api/blogs/list' => [$readOnlyController, 'blogs'],
    '/api/articles/search' => [$readOnlyController, 'articles'],
    '/api/metafields/list' => [$readOnlyController, 'metafields'],
    '/api/files/search' => [$readOnlyController, 'files'],
    '/api/themes/list' => [$readOnlyController, 'themes'],
    '/api/themes/files/list' => [$readOnlyController, 'themeFileList'],
    '/api/themes/files/get' => [$readOnlyController, 'themeFileGet'],
];

if (!isset($routes[$path])) {
    JsonResponse::send(['ok' => false, 'error' => 'Endpoint not found.'], 404);
}

$logger->info('Handling request', ['path' => $path]);
$result = $routes[$path]($input);
JsonResponse::send(['ok' => true, 'data' => $result]);
