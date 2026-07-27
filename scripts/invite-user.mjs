#!/usr/bin/env node
// Provisions an account so a person can log in. Registration is invite-only: the auth
// endpoints look users up but never create them (see `findUserIdByEmail` in
// worker/src/auth.ts), so this script is the only way in.
//
//   npm run invite -- alguien@correo.com          # D1 local
//   npm run invite:remote -- alguien@correo.com   # D1 de producción
//
// Idempotent: re-inviting an existing address leaves the account (and its data) untouched.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const email = args.find((arg) => !arg.startsWith('-'))?.trim().toLowerCase();

// Deliberately stricter than the Worker's isValidEmail: this charset excludes quotes and
// whitespace, which is what makes it safe to interpolate into the SQL below.
if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error('Uso: npm run invite -- correo@dominio.com');
  console.error('     npm run invite:remote -- correo@dominio.com');
  process.exit(1);
}

const id = crypto.randomUUID();
const sql = `INSERT OR IGNORE INTO users (id, email) VALUES ('${id}', '${email}');`;

const result = spawnSync(
  'npx',
  [
    'wrangler',
    'd1',
    'execute',
    'bills-pwa-db',
    remote ? '--remote' : '--local',
    '--command',
    sql,
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (result.status !== 0) {
  console.error(`\n✗ No se pudo invitar a ${email}`);
  process.exit(result.status ?? 1);
}

console.log(`\n✓ ${email} puede entrar (D1 ${remote ? 'producción' : 'local'}).`);
console.log('  Si ya tenía cuenta, no se modificó nada.');
