/** Coarse device-name guess from a User-Agent header, for passkey and session labels. */
export function defaultDeviceName(userAgent: string | null): string {
  if (!userAgent) return 'Este dispositivo';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('mac')) return 'Mac';
  if (ua.includes('windows')) return 'Windows';
  return 'Este dispositivo';
}
