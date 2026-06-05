<?php

namespace App\Controllers;

use App\Services\ShopifyAdminClient;
use App\Validators\InputValidator;

final class ReadOnlyController
{
    public function __construct(
        private readonly ShopifyAdminClient $shopify,
        private readonly InputValidator $validator,
    ) {
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function collections(array $input): array
    {
        return $this->shopify->runStoredOperation('collections-list', [
            'first' => $this->validator->int($input, 'first', 1, 50, 10),
            'query' => $this->validator->string($input, 'query', 250, false) ?? '',
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function pages(array $input): array
    {
        return $this->shopify->runStoredOperation('pages-list', [
            'first' => $this->validator->int($input, 'first', 1, 50, 10),
            'query' => $this->validator->string($input, 'query', 250, false) ?? '',
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function blogs(array $input): array
    {
        return $this->shopify->runStoredOperation('blogs-list', [
            'first' => $this->validator->int($input, 'first', 1, 50, 10),
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function articles(array $input): array
    {
        return $this->shopify->runStoredOperation('articles-list', [
            'first' => $this->validator->int($input, 'first', 1, 50, 10),
            'query' => $this->validator->string($input, 'query', 250, false) ?? '',
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function metafields(array $input): array
    {
        return $this->shopify->runStoredOperation('metafields-list', [
            'ownerId' => $this->validator->gid($input, 'ownerId'),
            'first' => $this->validator->int($input, 'first', 1, 50, 10),
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function files(array $input): array
    {
        return $this->shopify->runStoredOperation('files-list', [
            'first' => $this->validator->int($input, 'first', 1, 50, 10),
            'query' => $this->validator->string($input, 'query', 250, false) ?? '',
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function themes(array $input): array
    {
        return $this->shopify->runStoredOperation('themes-list', [
            'first' => $this->validator->int($input, 'first', 1, 50, 10),
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function themeFileList(array $input): array
    {
        return $this->shopify->runStoredOperation('theme-file-list', [
            'themeId' => $this->validator->gid($input, 'themeId'),
            'first' => $this->validator->int($input, 'first', 1, 100, 25),
        ]);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function themeFileGet(array $input): array
    {
        return $this->shopify->runStoredOperation('theme-file-get', [
            'themeId' => $this->validator->gid($input, 'themeId'),
            'filename' => $this->validator->string($input, 'filename', 500),
        ]);
    }
}
