<?php

namespace App\Controllers;

use App\Services\ShopifyAdminClient;

final class ShopController
{
    public function __construct(private readonly ShopifyAdminClient $shopify)
    {
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function info(array $input): array
    {
        return $this->shopify->runStoredOperation('shop-info');
    }
}
