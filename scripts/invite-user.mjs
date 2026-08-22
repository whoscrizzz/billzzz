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
const email = args
  .find((arg) => !arg.startsWith('-'))
  ?.trim()
  .toLowerCase();

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
  ['wrangler', 'd1', 'execute', 'DB', remote ? '--remote' : '--local', '--command', sql],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (result.status !== 0) {
  console.error(`\n✗ No se pudo invitar a ${email}`);
  process.exit(result.status ?? 1);
}

console.log(`\n✓ ${email} puede entrar (D1 ${remote ? 'producción' : 'local'}).`);
console.log('  Si ya tenía cuenta, no se modificó nada.');

if (!remote) {
  console.log('  Modo local: no se manda email. Pedí el código con: npm run dev:link -- ' + email);
  process.exit(0);
}

// --remote: mandar el email de invitación de verdad. El Worker es el único lugar
// con RESEND_API_KEY en runtime — este script no la tiene ni la necesita, solo
// necesita ADMIN_TOKEN (el mismo secreto que se le puso a `wrangler secret put`)
// para que el Worker confíe en que el pedido viene de vos.
const adminToken = process.env.ADMIN_TOKEN;
if (!adminToken) {
  console.log('\n⚠️  No se mandó el email de invitación: falta ADMIN_TOKEN en tu entorno.');
  console.log('   Corré con:  ADMIN_TOKEN=tu_valor npm run invite:remote -- ' + email);
  console.log('   (el mismo valor que le pusiste con: wrangler secret put ADMIN_TOKEN)');
  process.exit(0);
}

const appUrl = process.env.APP_URL || 'https://billzzz.whoscrizzz.com';
try {
  const res = await fetch(`${appUrl}/billzzz-api/admin/send-invite`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  if (res.ok) {
    console.log(`  Email de invitación enviado a ${email}.`);
  } else {
    const body = await res.json().catch(() => ({}));
    console.log(
      `\n⚠️  La cuenta se creó, pero el email no se pudo mandar: ${body.error ?? res.status}`
    );
    console.log('   Podés avisarle vos por fuera que ya puede entrar a ' + appUrl);
  }
} catch (err) {
  console.log(
    `\n⚠️  La cuenta se creó, pero el email no se pudo mandar (error de red): ${err.message}`
  );
  console.log('   Podés avisarle vos por fuera que ya puede entrar a ' + appUrl);
}
