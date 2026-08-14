# Security model — bills-pwa

This documents the deliberate security/privacy decisions in this codebase, so a future
contributor (or agent) doesn't "fix" something that's actually working as intended, and so
gaps that are known-but-deferred aren't mistaken for gaps nobody noticed.

## Auth

- **Revocation is non-destructive and covers every access path** (`users.disabled`,
  migración `0017`, `npm run revoke`). Flipping the flag is not enough on its own: the paths
  that matter are the ones that deliberately work *without* a session, so they survive any
  credential change. All seven carry the check:

  | Camino | Por qué se escapa | Ventana si falta el check |
  | --- | --- | --- |
  | `findUserIdByEmail` (login) | — | permanente |
  | `getSessionUserId` | JOINs `users` para esto exactamente | 90 días |
  | `serveCalendarFeed` (`.ics`) | sin autenticar, solo posesión de URL | permanente |
  | `captureExpense` (Atajos/Siri) | sin autenticar, y **escribe** | permanente |
  | `verifyActionToken` / `resolveGroupActionAuth` | botones de una push ya entregada, y **escriben** | 14 días |
  | `getUserEmail` (login con passkey) | verifica WebAuthn y crea sesión sin pasar por el correo | permanente |
  | crons de push y correo | salientes | — |

  Las tres últimas filas se escaparon de la primera versión de este cambio y salieron en
  revisión: el criterio "los caminos que leen datos de usuario" era el equivocado, porque dos
  de ellas escriben. Un camino nuevo que resuelva identidad sin `getSessionUserId` necesita el
  check y su test en `scripts/test-user-disabled.mjs`.

  `npm run revoke` además sube `action_token_version`, para que `--undo` no reviva tokens de
  acción emitidos antes de revocar.
- **Registration is invite-only, and logging in never creates an account.**
  `requestMagicLink` looks the address up in `users` and, when there is no row, returns the
  *same* response it returns for a real send without issuing a link or writing anything —
  so the endpoint can't be used to enumerate who has an account either. Verification
  re-checks the account still exists (a link outlives the row by up to 15 min). Accounts
  are provisioned out of band with `npm run invite -- correo@dominio.com` (add `:remote`
  for production). Passkey *registration* already required an authenticated session
  ([routes.ts](worker/src/routes.ts)), so it is not a second way in.
- **No response ever carries a login token, in any environment.** `requestMagicLink` used to
  return the `verifyUrl` and `shortCode` in the body whenever `RESEND_API_KEY`/`EMAIL_FROM`
  were absent — a dev convenience keyed off *missing config*, which meant a production
  deploy that lost that secret would silently start handing a valid login token to anyone
  who posted an address. Missing email config now logs and returns 503.

  The fix deliberately removes the branch instead of gating it on "am I in dev". There is no
  trustworthy dev signal inside this Worker: `wrangler dev` rewrites both `request.url` and
  the `Host` header to the `custom_domain` declared in `wrangler.jsonc`, so a loopback
  request is indistinguishable from production — a host-based gate was tried, and it fails
  closed in local dev and would have been silently wrong if the route config ever changed.
  Local dev reads the pending link out of D1 instead (`npm run dev:link`), a capability the
  developer already has. Re-adding any environment-conditional token echo re-opens this.
- **Magic link + optional passkeys** ([auth.ts](worker/src/auth.ts), [passkeys.ts](worker/src/passkeys.ts)).
  Sessions are opaque `crypto.randomUUID()` bearer tokens stored server-side in `sessions`
  (D1) — not JWTs, so nothing to sign/rotate and every session is trivially revocable by
  deleting its row.
- **Bearer token in `localStorage`, not a cookie** ([src/lib/auth.ts](src/lib/auth.ts),
  [src/lib/api.ts](src/lib/api.ts)). The token is attached explicitly via JS on every
  request. This means:
  - No ambient credential a third-party origin can piggyback on → no CSRF surface.
  - It also means an XSS bug would be able to read the token directly. There is currently
    no `dangerouslySetInnerHTML`/`innerHTML` usage anywhere in `src/` (verified by
    repo-wide search) — subscription `name`/`notes`/`category` are rendered through JSX,
    which escapes by default.
- **Session TTL**: 90 days, with a lazy "slide" refresh only when fewer than 45 days
  remain (avoids a write on every request).
- **Rate limiting** ([rate-limit.ts](worker/src/rate-limit.ts)): magic-link requests, the
  6-digit code, and all four passkey endpoints are limited to 5 attempts / 15 min, keyed
  by IP (unauthenticated endpoints) or user id (authenticated ones). This is IP-scoped for
  the unauthenticated paths, not a global per-account ceiling — an attacker rotating
  source IPs gets a fresh budget per IP. Known limitation, not currently addressed.
- **Device/session management**: a user can revoke every *other* session
  (`POST /auth/sessions/revoke-others`), and removing a passkey can optionally cascade
  into that. There is **no per-session list or targeted single-session revoke** —
  `sessions` doesn't record `user_agent`/IP/label, so today's only lever is "nuke
  everything else." Tracked as a follow-up feature, not shipped here.

## Data isolation

Every subscription read/write is scoped by `user_id`. The three mutations that used to
check ownership only in a preceding `SELECT` (`snoozeSubscription`,
`restoreArchivedSubscription`, `markSubscriptionPaid`) now also filter the `UPDATE` itself
by `user_id` — defense in depth against a future refactor accidentally dropping the
upstream check, not a fix for an exploited bug (ids are UUIDs, not enumerable).

## Calendar feed (`.ics`)

The feed URL (`/bills-api/calendar/feed/:token.ics`) is **intentionally unauthenticated**
— calendar apps subscribing via `webcal://` can't send a bearer token or cookie. Access
control is entirely "possession of the URL," gated by a 122-bit random token
(`users.calendar_token`). This is the same trust model every ICS-subscription feature
uses (Google Calendar's private address, Outlook's published calendar link, etc.) — not a
shortcut taken here. Consequences worth remembering:

- Anyone who gets the link sees every bill's name, amount, due date, and notes,
  indefinitely, until the token is regenerated.
- The token **does not expire on its own** — matches the standard pattern, not changed.
- Regenerating invalidates the old URL server-side, but iOS doesn't know to delete the
  now-dead subscribed calendar on its own — the app's UI explicitly walks the user through
  deleting the old calendar before re-subscribing (see
  [CalendarSync.tsx](src/components/CalendarSync.tsx)) to avoid duplicate events.

## Email digest

`sendEmailDigests` ([email-digest.ts](worker/src/email-digest.ts)) HTML-escapes
subscription names before interpolating into the digest email — a subscription named
with HTML/script-like text can't inject markup into the outbound email.

## CORS

`makeCorsHeaders` ([env.ts](worker/src/env.ts)) scopes `Access-Control-Allow-Origin` to
`APP_URL` (or localhost in dev), not a wildcard. The top-level 401/404/405 responses and
`exportUserData` route through this. A long tail of narrower `error()` calls deep inside
individual handlers (subscriptions, passkeys, auth) still fall back to a wildcard origin
constant when no request/env context is threaded through — low real-world risk today
(there's no cookie-based ambient credential to steal), but not fully unified. Left as a
known gap rather than a 50-call-site mechanical refactor bundled into an unrelated PR.

## Headers

- `worker/src/index.ts` wraps every `/bills-api/*` response with
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  and a same-origin `Content-Security-Policy`.
- **The main HTML document does not get these via HTTP headers.** Cloudflare's Workers
  Assets binding serves static files (including the SPA's `index.html`) directly,
  short-circuiting before the Worker's `fetch()` handler runs, unless
  `assets.run_worker_first` is enabled (a real performance tradeoff on every asset
  request — not enabled here). Instead, CSP and `Referrer-Policy` are set via `<meta>`
  tags in [index.html](index.html). `frame-ancestors` and CSP reporting directives only
  work as an HTTP header, so they're intentionally absent from the meta-tag version.

## Explicitly accepted, not "gaps"

- **iOS push self-heal**: a Service Worker can't reliably resubscribe after
  `pushsubscriptionchange` without an open window/client to delegate to — a platform
  constraint (more acute on iOS), not something fixable in this codebase.
- **Calendar token never expires** — see above, matches the standard pattern.

## Known follow-ups (deferred on purpose, not forgotten)

- Real session/device list with targeted revoke.
- A real push-delivery-health indicator in Settings, surfacing `notification_log` instead
  of just comparing local-subscription-presence to a server row count.
