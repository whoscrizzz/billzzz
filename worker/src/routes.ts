import type { Env } from "./env";
import { corsHeaders, error, json } from "./env";
import { API_PREFIX } from "./constants";
import {
  getMe,
  getSessionUserId,
  logout,
  requestMagicLink,
  verifyMagicLink,
  verifyMagicLinkCode,
} from "./auth";
import {
  getCalendarUrls,
  regenerateCalendarToken,
  serveCalendarFeed,
} from "./calendar";
import {
  createSubscription,
  deleteSubscription,
  listPaymentRecords,
  listSubscriptions,
  markSubscriptionPaid,
  savePushSubscription,
  snoozeSubscription,
  updateSubscription,
} from "./subscriptions";
import { exportUserData, getUserSettings, healthCheck, importUserData, updateUserSettings } from "./settings";

function apiPath(suffix: string): string {
  return `${API_PREFIX}${suffix}`;
}

export async function handleApi(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (url.pathname === apiPath("/health")) {
    return healthCheck(env);
  }

  const feedMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/calendar/feed/([^/]+)\\.ics$`),
  );
  if (feedMatch && request.method === "GET") {
    return serveCalendarFeed(env, feedMatch[1]);
  }

  if (url.pathname === apiPath("/vapid-public-key") && request.method === "GET") {
    return json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  if (url.pathname === apiPath("/auth/request-link") && request.method === "POST") {
    return requestMagicLink(request, env);
  }

  if (url.pathname === apiPath("/auth/verify-code") && request.method === "POST") {
    return verifyMagicLinkCode(request, env);
  }

  if (url.pathname === apiPath("/auth/verify")) {
    if (request.method === "POST") {
      const body = (await request.json()) as { token?: string };
      return verifyMagicLink(request, env, body.token ?? "");
    }
    if (request.method === "GET") {
      return error("Usa el botón «Entrar a Bills» en la página de verificación", 405);
    }
  }

  const userId = await getSessionUserId(request, env);
  if (!userId) {
    return error("Inicia sesión para continuar", 401);
  }

  if (url.pathname === apiPath("/auth/me") && request.method === "GET") {
    return getMe(env, userId);
  }

  if (url.pathname === apiPath("/auth/logout") && request.method === "POST") {
    return logout(request, env);
  }

  if (url.pathname === apiPath("/settings") && request.method === "GET") {
    return getUserSettings(env.DB, userId);
  }

  if (url.pathname === apiPath("/settings") && request.method === "PUT") {
    return updateUserSettings(request, env.DB, userId);
  }

  if (url.pathname === apiPath("/export") && request.method === "GET") {
    return exportUserData(env.DB, userId);
  }

  if (url.pathname === apiPath("/import") && request.method === "POST") {
    return importUserData(request, env.DB, userId);
  }

  if (url.pathname === apiPath("/subscriptions")) {
    if (request.method === "GET") {
      return listSubscriptions(env.DB, userId);
    }
    if (request.method === "POST") {
      return createSubscription(request, env.DB, userId);
    }
  }

  const markPaidMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)/mark-paid$`),
  );
  if (markPaidMatch && request.method === "POST") {
    return markSubscriptionPaid(request, env.DB, userId, markPaidMatch[1]);
  }

  const snoozeMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)/snooze$`),
  );
  if (snoozeMatch && request.method === "POST") {
    return snoozeSubscription(request, env.DB, userId, snoozeMatch[1]);
  }

  const subMatch = url.pathname.match(
    new RegExp(`^${API_PREFIX}/subscriptions/([^/]+)$`),
  );
  if (subMatch) {
    const id = subMatch[1];
    if (request.method === "PUT") {
      return updateSubscription(request, env.DB, userId, id);
    }
    if (request.method === "DELETE") {
      return deleteSubscription(env.DB, userId, id);
    }
  }

  if (url.pathname === apiPath("/push/subscribe") && request.method === "POST") {
    return savePushSubscription(request, env.DB, userId);
  }

  if (url.pathname === apiPath("/payments") && request.method === "GET") {
    return listPaymentRecords(env.DB, userId);
  }

  if (url.pathname === apiPath("/calendar/url") && request.method === "GET") {
    return getCalendarUrls(request, env, userId);
  }

  if (url.pathname === apiPath("/calendar/regenerate") && request.method === "POST") {
    return regenerateCalendarToken(env, userId);
  }

  return error("Not found", 404);
}

export function handleOptions(): Response {
  return new Response(null, { headers: corsHeaders });
}

export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}
