<?php

namespace App\Services;

use RuntimeException;

final class ShopifyAdminClient
{
    public function __construct(
        private readonly string $shop,
        private readonly string $apiVersion,
        private readonly string $accessToken,
        private readonly OperationLoader $operationLoader,
    ) {
    }

    /** @param array<string, mixed> $variables @return array<string, mixed> */
    public function runStoredOperation(string $operationName, array $variables = []): array
    {
        if ($this->shop === '' || $this->apiVersion === '' || $this->accessToken === '') {
            throw new RuntimeException('Shopify Admin API configuration is incomplete.');
        }

        $query = $this->operationLoader->load($operationName);
        $url = sprintf('https://%s/admin/api/%s/graphql.json', $this->shop, $this->apiVersion);
        $payload = json_encode(['query' => $query, 'variables' => (object) $variables], JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            throw new RuntimeException('Unable to encode Shopify request.');
        }

        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Unable to initialize Shopify request.');
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Shopify-Access-Token: ' . $this->accessToken,
            ],
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 30,
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($body === false) {
            throw new RuntimeException('Shopify request failed: ' . $error);
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Shopify returned an invalid JSON response.');
        }

        if ($status < 200 || $status >= 300) {
            throw new RuntimeException('Shopify returned HTTP status ' . $status);
        }

        return $decoded;
    }
}
