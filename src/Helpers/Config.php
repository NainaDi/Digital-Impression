<?php

namespace App\Helpers;

final class Config
{
    /** @var array<string, mixed> */
    private array $values;

    public function __construct(string $rootPath)
    {
        $configFile = $rootPath . '/config/app.php';
        if (!is_file($configFile)) {
            $configFile = $rootPath . '/config/app.example.php';
        }

        $values = require $configFile;
        $this->values = is_array($values) ? $values : [];
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $segments = explode('.', $key);
        $current = $this->values;

        foreach ($segments as $segment) {
            if (!is_array($current) || !array_key_exists($segment, $current)) {
                return $default;
            }
            $current = $current[$segment];
        }

        return $current;
    }
}
