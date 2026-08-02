#!/usr/bin/env node
// Revoca (o restaura) el acceso de una cuenta sin borrar sus datos.
//
//   npm run revoke -- alguien@correo.com           # D1 local
//   npm run revoke:remote -- alguien@correo.com    # D1 de producción
//   npm run revoke -- alguien@correo.com --undo    # restaura el acceso
//
// Marca `users.disabled` (migración 0017). Sus suscripciones, pagos e historial quedan
// intactos, así que restaurar devuelve la cuenta tal y como estaba. Al revocar también se
// borran sus sesiones: el guard de `getSessionUserId` ya las inutiliza al instante, pero no
// hay razón para dejar filas vivas de un acceso retirado.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const undo = args.includes('--undo');
const email = args
  .find((arg) => !arg.startsWith('-'))
  ?.trim()
  .toLowerCase();

// Charset sin comillas ni espacios — es lo que hace seguro interpolarlo en el SQL de abajo.
if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error('Uso: npm run revoke -- correo@dominio.com [--undo]');
  console.error('     npm run revoke:remote -- correo@dominio.com [--undo]');
  process.exit(1);
}

const sql = undo
  ? `UPDATE users SET disabled = 0 WHERE email = '${email}';`
  : `UPDATE users SET disabled = 1 WHERE email = '${email}';
     DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = '${email}');`;

const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'bills-pwa-db', remote ? '--remote' : '--local', '--command', sql],
  { stdio: 'inherit', shell: process.platform === 'win32' }
);

if (result.status !== 0) {
  console.error(`\n✗ No se pudo ${undo ? 'restaurar' : 'revocar'} a ${email}`);
  process.exit(result.status ?? 1);
}

const where = remote ? 'producción' : 'local';
if (undo) {
  console.log(`\n✓ ${email} vuelve a tener acceso (D1 ${where}).`);
  console.log('  Tendrá que iniciar sesión de nuevo.');
} else {
  console.log(`\n✓ ${email} ya no puede entrar (D1 ${where}).`);
  console.log('  Sus datos siguen intactos — restaura con: --undo');
}
