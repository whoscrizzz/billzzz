import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture, WebAuthnCredential } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { createUserSession, revokeOtherSessions } from './auth';
import type { Env } from './env';
import { error, json, logError } from './env';
import { checkRateLimit } from './rate-limit';
import { getWebAuthnConfig } from './webauthn-config';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

interface PasskeyRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_name: string | null;
  transports: string | null;
  backed_up: number;
  created_at: string;
  last_used_at: string | null;
}

interface ChallengeRow {
  id: string;
  challenge: string;
  user_id: string | null;
  type: 'registration' | 'authentication';
  expires_at: string;
}

function userIdToBytes(userId: string): Uint8Array {
  return new TextEncoder().encode(userId);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const pad = '='.repeat((4 - (value.length % 4)) % 4);
  const b64 = (value + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function parseTransports(raw: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((t): t is AuthenticatorTransportFuture => typeof t === 'string');
  } catch {
    return undefined;
  }
}

function rowToCredential(row: PasskeyRow): WebAuthnCredential {
  return {
    id: row.credential_id,
    publicKey: decodeBase64Url(row.public_key),
    counter: row.counter,
    transports: parseTransports(row.transports),
  };
}

async function storeChallenge(
  db: D1Database,
  challenge: string,
  type: ChallengeRow['type'],
  userId: string | null
): Promise<string> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  await db
    .prepare(
      `INSERT INTO webauthn_challenges (id, challenge, user_id, type, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, challenge, userId, type, expiresAt)
    .run();
  return id;
}

async function consumeChallenge(
  db: D1Database,
  challengeId: string,
  type: ChallengeRow['type'],
  userId?: string | null
): Promise<string | null> {
  const row = await db
    .prepare(`SELECT * FROM webauthn_challenges WHERE id = ? AND type = ?`)
    .bind(challengeId, type)
    .first<ChallengeRow>();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare(`DELETE FROM webauthn_challenges WHERE id = ?`).bind(challengeId).run();
    return null;
  }
  if (userId !== undefined && row.user_id !== userId) return null;

  await db.prepare(`DELETE FROM webauthn_challenges WHERE id = ?`).bind(challengeId).run();
  return row.challenge;
}

async function listUserPasskeys(db: D1Database, userId: string): Promise<PasskeyRow[]> {
  const { results } = await db
    .prepare(`SELECT * FROM passkey_credentials WHERE user_id = ? ORDER BY created_at DESC`)
    .bind(userId)
    .all<PasskeyRow>();
  return results ?? [];
}

async function getUserEmail(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT email FROM users WHERE id = ?`)
    .bind(userId)
    .first<{ email: string | null }>();
  return row?.email ?? null;
}

export async function passkeyRegisterOptions(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const rl = await checkRateLimit(env.DB, `passkey_register_opts:${userId}`);
  if (!rl.allowed) return error(`Demasiados intentos. Espera ${rl.retryAfterSec}s`, 429);

  const config = getWebAuthnConfig(env, request);
  const email = await getUserEmail(env.DB, userId);
  if (!email) return error('Usuario sin email — no se puede registrar passkey', 400);

  const existing = await listUserPasskeys(env.DB, userId);

  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName: email,
    userDisplayName: email.split('@')[0] ?? email,
    userID: userIdToBytes(userId),
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: parseTransports(row.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
      authenticatorAttachment: 'platform',
    },
  });

  const challengeId = await storeChallenge(env.DB, options.challenge, 'registration', userId);

  return json({ options, challengeId });
}

export async function passkeyRegisterVerify(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const rl = await checkRateLimit(env.DB, `passkey_register_verify:${userId}`);
  if (!rl.allowed) return error(`Demasiados intentos. Espera ${rl.retryAfterSec}s`, 429);

  const body = (await request.json()) as {
    challengeId?: string;
    response?: RegistrationResponseJSON;
    deviceName?: string;
  };

  if (!body.challengeId || !body.response) {
    return error('challengeId and response are required');
  }

  const expectedChallenge = await consumeChallenge(
    env.DB,
    body.challengeId,
    'registration',
    userId
  );
  if (!expectedChallenge) {
    return error('Challenge inválido o expirado', 410);
  }

  const config = getWebAuthnConfig(env, request);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
  } catch (err) {
    logError('passkey register verify failed', err);
    return error('No se pudo verificar el passkey', 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return error('Registro de passkey rechazado', 400);
  }

  const { credential } = verification.registrationInfo;
  const id = crypto.randomUUID();
  const deviceName =
    body.deviceName?.trim().slice(0, 80) || defaultDeviceName(request.headers.get('User-Agent'));

  try {
    await env.DB.prepare(
      `INSERT INTO passkey_credentials
         (id, user_id, credential_id, public_key, counter, device_name, transports, backed_up)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        userId,
        credential.id,
        encodeBase64Url(credential.publicKey),
        credential.counter,
        deviceName,
        credential.transports ? JSON.stringify(credential.transports) : null,
        verification.registrationInfo.credentialBackedUp ? 1 : 0
      )
      .run();
  } catch {
    const existing = await env.DB.prepare(
      `SELECT id, user_id, device_name, created_at FROM passkey_credentials WHERE credential_id = ?`
    )
      .bind(credential.id)
      .first<{ id: string; user_id: string; device_name: string | null; created_at: string }>();

    if (existing?.user_id === userId) {
      return json({
        ok: true,
        passkey: {
          id: existing.id,
          device_name: existing.device_name ?? deviceName,
          created_at: existing.created_at,
        },
      });
    }

    return error('Este passkey ya está registrado en otra cuenta', 409);
  }

  return json({
    ok: true,
    passkey: {
      id,
      device_name: deviceName,
      created_at: new Date().toISOString(),
    },
  });
}

export async function passkeyLoginOptions(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env.DB, `passkey_login_opts:${ip}`);
  if (!rl.allowed) return error(`Demasiados intentos. Espera ${rl.retryAfterSec}s`, 429);

  const config = getWebAuthnConfig(env, request);

  const options = await generateAuthenticationOptions({
    rpID: config.rpID,
    userVerification: 'preferred',
    timeout: 60_000,
  });

  const challengeId = await storeChallenge(env.DB, options.challenge, 'authentication', null);

  return json({ options, challengeId });
}

export async function passkeyLoginVerify(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env.DB, `passkey_login_verify:${ip}`);
  if (!rl.allowed) return error(`Demasiados intentos. Espera ${rl.retryAfterSec}s`, 429);

  const body = (await request.json()) as {
    challengeId?: string;
    response?: AuthenticationResponseJSON;
  };

  if (!body.challengeId || !body.response) {
    return error('challengeId and response are required');
  }

  const expectedChallenge = await consumeChallenge(env.DB, body.challengeId, 'authentication');
  if (!expectedChallenge) {
    return error('Challenge inválido o expirado', 410);
  }

  const passkey = await env.DB.prepare(`SELECT * FROM passkey_credentials WHERE credential_id = ?`)
    .bind(body.response.id)
    .first<PasskeyRow>();

  if (!passkey) {
    return error('Passkey no reconocido', 404);
  }

  const config = getWebAuthnConfig(env, request);
  const credential = rowToCredential(passkey);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: config.expectedOrigins,
      expectedRPID: config.rpID,
      credential,
      requireUserVerification: true,
    });
  } catch (err) {
    logError('passkey login verify failed', err);
    return error('No se pudo verificar el passkey', 400);
  }

  if (!verification.verified) {
    return error('Autenticación con passkey rechazada', 401);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE id = ?`)
    .bind(verification.authenticationInfo.newCounter, now, passkey.id)
    .run();

  const email = await getUserEmail(env.DB, passkey.user_id);
  if (!email) return error('Usuario no encontrado', 404);

  return createUserSession(env, passkey.user_id, email);
}

export async function listPasskeys(env: Env, userId: string): Promise<Response> {
  const rows = await listUserPasskeys(env.DB, userId);
  return json({
    passkeys: rows.map((row) => ({
      id: row.id,
      device_name: row.device_name ?? 'Dispositivo',
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      backed_up: row.backed_up === 1,
    })),
  });
}

export async function deletePasskey(
  env: Env,
  userId: string,
  passkeyId: string,
  currentToken: string | null,
  revokeOtherDevices: boolean
): Promise<Response> {
  const result = await env.DB.prepare(
    `DELETE FROM passkey_credentials WHERE id = ? AND user_id = ?`
  )
    .bind(passkeyId, userId)
    .run();

  if (result.meta.changes === 0) {
    return error('Passkey no encontrado', 404);
  }

  // Removing a credential usually means the device was lost or is no longer trusted —
  // optionally close out any other active sessions so a stolen token stops working too.
  const revoked =
    revokeOtherDevices && currentToken ? await revokeOtherSessions(env, userId, currentToken) : 0;

  return json({ ok: true, revoked });
}

function defaultDeviceName(userAgent: string | null): string {
  if (!userAgent) return 'Este dispositivo';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('mac')) return 'Mac';
  if (ua.includes('windows')) return 'Windows';
  return 'Este dispositivo';
}
