#!/usr/bin/env node
// Prints the pending magic link for an address by reading local D1 directly.
//
// The API never returns a login token in its response body (worker/src/auth.ts) — not even
// in dev, because a branch that does that in *some* environment is a branch that can misfire
// in production. Local dev doesn't need it: whoever runs the dev server already has the
// database, so the link is read from there instead.
//
//   1. Pide el enlace desde la UI (o con curl) para que se genere la fila.
//   2. npm run dev:link -- alguien@correo.com
//
// Local D1 only — it never touches production.
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const email = process.argv.slice(2).find((arg) => !arg.startsWith('-'))?.trim().toLowerCase();

if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error('Uso: npm run dev:link -- correo@dominio.com');
  process.exit(1);
}

const result = spawnSync(
  'npx',
  [
    'wrangler',
    'd1',
    'execute',
    'bills-pwa-db',
    '--local',
    '--json',
    '--command',
    `SELECT token, short_code, expires_at FROM magic_links
     WHERE email = '${email}' AND used_at IS NULL
     ORDER BY expires_at DESC LIMIT 1;`,
  ],
  { encoding: 'utf8', shell: process.platform === 'win32' }
);

if (result.status !== 0) {
  console.error(result.stderr || 'wrangler falló');
  process.exit(result.status ?? 1);
}

// `wrangler --json` prints the JSON payload after any human-readable preamble.
const jsonStart = result.stdout.indexOf('[');
const rows =
  jsonStart === -1 ? [] : (JSON.parse(result.stdout.slice(jsonStart))[0]?.results ?? []);
const link = rows[0];

if (!link) {
  console.error(`No hay enlace pendiente para ${email}.`);
  console.error('Pide uno desde la UI primero — y confirma que la cuenta existe:');
  console.error(`  npm run invite -- ${email}`);
  process.exit(1);
}

if (new Date(link.expires_at).getTime() < Date.now()) {
  console.error(`El último enlace de ${email} expiró (${link.expires_at}). Pide otro.`);
  process.exit(1);
}

const env = loadEnv('development', process.cwd(), '');
const port = env.VITE_PORT || '5173';

console.log(`\nCódigo:  ${link.short_code}`);
console.log(`Enlace:  http://127.0.0.1:${port}/auth/verify?token=${link.token}\n`);
