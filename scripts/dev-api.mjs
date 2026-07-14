#!/usr/bin/env node
// Wraps `wrangler dev` so VITE_API_PORT from a gitignored .env.local (if
// present) picks the local port. Lets several worktrees/projects run their
// local Worker side by side without clashing on the default 8787.
//
// Uses Vite's own `loadEnv` (same parser vite.config.ts uses for VITE_PORT)
// instead of a hand-rolled regex — a bespoke parser here previously handled
// quoting/whitespace differently than Vite's, so the two could resolve a
// given .env.local to different ports.
import { spawn } from 'node:child_process';
import { loadEnv } from 'vite';

const env = loadEnv('development', process.cwd(), '');
const port = env.VITE_API_PORT || '8787';
const child = spawn('wrangler', ['dev', '--local', '--port', port, ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 1));
