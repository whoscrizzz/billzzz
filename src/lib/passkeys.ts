import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import {
  fetchPasskeyLoginOptions,
  fetchPasskeyRegisterOptions,
  verifyPasskeyLogin,
  verifyPasskeyRegister,
} from './api';

export function isPasskeyApiAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  );
}

export async function canUsePlatformPasskey(): Promise<boolean> {
  if (!isPasskeyApiAvailable()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Face ID / huella cancelada por el usuario — no mostrar error. */
export function isWebAuthnUserCancelled(err: unknown): boolean {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as { name: string }).name);
    if (name === 'NotAllowedError' || name === 'AbortError') return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /cancel/i.test(message) || /abort/i.test(message) || /not allowed/i.test(message);
}

export async function loginWithPasskey(): Promise<{
  token: string;
  user: { id: string; email: string };
}> {
  const { options, challengeId } = await fetchPasskeyLoginOptions();
  const response: AuthenticationResponseJSON = await startAuthentication({ optionsJSON: options });
  return verifyPasskeyLogin(challengeId, response);
}

export async function registerPasskey(deviceName?: string): Promise<void> {
  const { options, challengeId } = await fetchPasskeyRegisterOptions();
  const response: RegistrationResponseJSON = await startRegistration({ optionsJSON: options });
  await verifyPasskeyRegister(challengeId, response, deviceName);
}

export type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON };
