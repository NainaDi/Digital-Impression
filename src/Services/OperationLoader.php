<?php

namespace App\Services;

use RuntimeException;

final class OperationLoader
{
    public function __construct(private readonly string $operationsPath)
    {
    }

    public function load(string $name): string
    {
        if (!preg_match('/^[A-Za-z0-9_-]+$/', $name)) {
            throw new RuntimeException('Invalid operation name.');
        }

        $path = $this->operationsPath . '/' . $name . '.graphql';
        if (!is_file($path)) {
            throw new RuntimeException('Operation not found.');
        }

        $query = file_get_contents($path);
        if ($query === false || trim($query) === '') {
            throw new RuntimeException('Operation is empty.');
        }

        return $query;
    }
}
