#!/usr/bin/env node
// Wraps `wrangler dev` so VITE_API_PORT from a gitignored .env.local (if
// present) picks the local port. Lets several worktrees/projects run their
// local Worker side by side without clashing on the default 8787.
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const ENV_FILE = '.env.local';

if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2];
    }
  }
}

const port = process.env.VITE_API_PORT || '8787';
const child = spawn('wrangler', ['dev', '--local', '--port', port, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 1));
