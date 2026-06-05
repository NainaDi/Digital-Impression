<?php

namespace App\Controllers;

use App\Services\ShopifyAdminClient;
use App\Validators\InputValidator;
use InvalidArgumentException;

final class ProductController
{
    public function __construct(
        private readonly ShopifyAdminClient $shopify,
        private readonly InputValidator $validator,
    ) {
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function search(array $input): array
    {
        $query = $this->validator->string($input, 'query', 250, false) ?? '';
        $first = $this->validator->int($input, 'first', 1, 50, 10);

        return $this->shopify->runStoredOperation('products-search', [
            'first' => $first,
            'query' => $query,
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function get(array $input): array
    {
        return $this->shopify->runStoredOperation('product-get', [
            'id' => $this->validator->gid($input, 'id'),
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function updateBasic(array $input): array
    {
        $id = $this->validator->gid($input, 'id');
        $product = ['id' => $id];

        foreach (['title', 'descriptionHtml', 'vendor', 'productType', 'status'] as $field) {
            $value = $this->validator->string($input, $field, $field === 'descriptionHtml' ? 50000 : 255, false);
            if ($value !== null) {
                $product[$field] = $value;
            }
        }

        if (count($product) === 1) {
            throw new InvalidArgumentException('At least one editable product field is required.');
        }

        return $this->shopify->runStoredOperation('product-update-basic', [
            'product' => $product,
        ]);
    }
}
