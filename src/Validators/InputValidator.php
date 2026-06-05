<?php

namespace App\Validators;

use InvalidArgumentException;

final class InputValidator
{
    /** @param array<string, mixed> $input */
    public function string(array $input, string $key, int $maxLength, bool $required = true): ?string
    {
        if (!array_key_exists($key, $input) || $input[$key] === null || $input[$key] === '') {
            if ($required) {
                throw new InvalidArgumentException("Missing required field: {$key}");
            }
            return null;
        }

        if (!is_string($input[$key])) {
            throw new InvalidArgumentException("Field must be a string: {$key}");
        }

        $value = trim($input[$key]);
        if ($value === '' && $required) {
            throw new InvalidArgumentException("Field cannot be empty: {$key}");
        }

        if (strlen($value) > $maxLength) {
            throw new InvalidArgumentException("Field is too long: {$key}");
        }

        return $value;
    }

    /** @param array<string, mixed> $input */
    public function int(array $input, string $key, int $min, int $max, int $default): int
    {
        if (!array_key_exists($key, $input) || $input[$key] === null || $input[$key] === '') {
            return $default;
        }

        if (!is_int($input[$key])) {
            if (!is_numeric($input[$key]) || (string) (int) $input[$key] !== (string) $input[$key]) {
                throw new InvalidArgumentException("Field must be an integer: {$key}");
            }
            $input[$key] = (int) $input[$key];
        }

        if ($input[$key] < $min || $input[$key] > $max) {
            throw new InvalidArgumentException("Field is out of range: {$key}");
        }

        return $input[$key];
    }

    /** @param array<string, mixed> $input */
    public function gid(array $input, string $key): string
    {
        $value = $this->string($input, $key, 255);
        if (!str_starts_with($value, 'gid://shopify/')) {
            throw new InvalidArgumentException("Field must be a Shopify GID: {$key}");
        }

        return $value;
    }
}
