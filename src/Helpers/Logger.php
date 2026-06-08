<?php

namespace App\Helpers;

final class Logger
{
    public function __construct(private readonly string $path)
    {
    }

    /** @param array<string, mixed> $context */
    public function info(string $message, array $context = []): void
    {
        $this->write('INFO', $message, $context);
    }

    /** @param array<string, mixed> $context */
    public function error(string $message, array $context = []): void
    {
        $this->write('ERROR', $message, $context);
    }

    /** @param array<string, mixed> $context */
    private function write(string $level, string $message, array $context): void
    {
        $dir = dirname($this->path);
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }

        $safeContext = $this->redact($context);
        $line = sprintf(
            "[%s] %s %s %s\n",
            gmdate('c'),
            $level,
            $message,
            json_encode($safeContext, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        );

        file_put_contents($this->path, $line, FILE_APPEND | LOCK_EX);
    }

    private function redact(mixed $value): mixed
    {
        if (is_array($value)) {
            $redacted = [];
            foreach ($value as $key => $item) {
                $lower = strtolower((string) $key);
                if (str_contains($lower, 'token') || str_contains($lower, 'secret') || str_contains($lower, 'authorization')) {
                    $redacted[$key] = '[redacted]';
                    continue;
                }
                $redacted[$key] = $this->redact($item);
            }
            return $redacted;
        }

        return $value;
    }
}
