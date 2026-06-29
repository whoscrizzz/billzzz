import { clearSession } from './auth';

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** Clears stored session and notifies AuthContext (401 / expired). */
export function handleUnauthorizedSession(): void {
  clearSession();
  unauthorizedHandler?.();
}
