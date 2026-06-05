#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '../mcp-server/server.js');

const child = spawn(process.execPath, [serverPath, '--smoke'], {
  env: {
    ...process.env,
    MCP_MIDDLEWARE_BASE_URL: process.env.MCP_MIDDLEWARE_BASE_URL || 'https://example.test/mcp',
    MCP_SHARED_SECRET: process.env.MCP_SHARED_SECRET || 'smoke-test-secret',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk; });
child.stderr.on('data', (chunk) => { stderr += chunk; });

const timeout = setTimeout(() => {
  child.kill('SIGTERM');
  console.error('Smoke test timed out.');
  process.exit(1);
}, 5000);

child.on('exit', (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    console.error(stderr || stdout || `Server exited with ${code}`);
    process.exit(code || 1);
  }

  const parsed = JSON.parse(stdout);
  if (parsed.ok !== true || parsed.name !== 'shopify-middleware-mcp') {
    console.error('Unexpected smoke response:', stdout);
    process.exit(1);
  }

  console.log('MCP bridge smoke test passed.');
});
