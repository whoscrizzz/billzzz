import type { Env } from './env';
import { appOrigin } from './env';

export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  origin: string;
  expectedOrigins: string[];
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
  }

  return {
    rpName: 'Bills',
    rpID,
    origin,
    expectedOrigins: [...expectedOrigins],
  };
}
