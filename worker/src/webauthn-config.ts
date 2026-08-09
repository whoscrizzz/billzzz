import type { Env } from './env';
import { appOrigin } from './env';

export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  origin: string;
  expectedOrigins: string[];
}

/** True si `value` es un origin http(s) apuntando a la máquina local. */
export function isLocalhostOrigin(value: string): boolean {
  try {
    const { hostname, protocol } = new URL(value);
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' || hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

/** RP ID and allowed origins — localhost vs production. */
export function getWebAuthnConfig(env: Env, request: Request): WebAuthnConfig {
  const origin = appOrigin(env, request);
  const url = new URL(origin);
  const hostname = url.hostname;

  let rpID: string;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    rpID = 'localhost';
  } else {
    rpID = hostname;
  }

  const expectedOrigins = new Set<string>([origin]);
  if (rpID === 'localhost') {
    expectedOrigins.add('http://localhost:5173');
    expectedOrigins.add('http://localhost:8787');
    expectedOrigins.add('http://127.0.0.1:5173');
    expectedOrigins.add('http://127.0.0.1:8787');

    // Puertos personalizados de dev: quien corre dos worktrees en paralelo
    // define VITE_PORT/VITE_API_PORT en un .env.local (gitignored), que el
    // Worker no puede leer — la lista fija de arriba nunca los va a conocer y
    // el passkey fallaba con "Unexpected authentication response origin".
    // Se acepta el Origin de la petición solo cuando ya resolvimos rpID a
    // localhost: en producción rpID es el dominio real y esta rama no corre,
    // así que esto no relaja nada fuera de la máquina del desarrollador.
    const requestOrigin = request.headers.get('Origin');
    if (requestOrigin && isLocalhostOrigin(requestOrigin)) {
      expectedOrigins.add(requestOrigin);
    }
  }

  return {
    rpName: 'Bills',
    rpID,
    origin,
    expectedOrigins: [...expectedOrigins],
  };
}
