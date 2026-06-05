<?php

namespace App\Validators;

final class AuthValidator
{
    public function __construct(private readonly string $sharedSecret)
    {
    }

    /** @param array<string, string> $headers */
    public function isAuthorized(array $headers): bool
    {
        if ($this->sharedSecret === '') {
            return false;
        }

        $authorization = $headers['authorization'] ?? '';
        $headerSecret = $headers['x-mcp-secret'] ?? '';
        $bearer = '';

        if (preg_match('/^Bearer\s+(.+)$/i', $authorization, $matches) === 1) {
            $bearer = trim($matches[1]);
        }

        return hash_equals($this->sharedSecret, $bearer) || hash_equals($this->sharedSecret, $headerSecret);
    }
}
