# Secrets y variables — dónde vive cada cosa

Este proyecto tiene tres tipos de credenciales distintos, y la confusión entre
ellos ya causó un incidente real (agosto 2026: se rotó `RESEND_API_KEY` en
Resend, pero nadie empujó el valor nuevo al Worker — el login dejó de mandar
emails durante días sin ningún error visible, porque el endpoint de login es
anti-enumeración y responde "revisa tu correo" incluso cuando el envío
falla). Esta tabla existe para no repetirlo.

## 1. GitHub Actions secrets (CI: deploy y backup)

Viven en GitHub, no en Cloudflare. Se configuran con `gh secret set` o los
scripts en `scripts/`.

| Secret | Para qué | Cómo se configura |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Autentica `wrangler` en CI para deploy, migraciones D1, y subir backups a R2 | `scripts/verify-cf-github-token.sh` (prueba el token antes de guardarlo) |
| `CLOUDFLARE_ACCOUNT_ID` | ID de cuenta, no es secreto (32 hex), pero vive como secret por convención | Mismo script — `npx wrangler whoami` lo muestra |
| `BACKUP_ENCRYPTION_KEY` | Cifra los backups de D1 antes de subirlos a R2 | `scripts/setup-backup-secret.sh` — **si se pierde, los backups viejos son irrecuperables** |

Permisos que necesita el `CLOUDFLARE_API_TOKEN`: Workers Scripts Edit,
Workers Routes Edit, D1 Edit, Account Settings Read, Workers R2 Storage Edit.

## 2. Cloudflare Worker secrets (producción, runtime)

Viven en Cloudflare, atados al Worker `billzzz-pwa`, no a GitHub. Se
configuran con `wrangler secret put <NOMBRE>` desde la Mac (necesita
`wrangler login` o las mismas credenciales que el token de CI). **Aplican de
inmediato, sin redeploy** — pero tampoco se sincronizan solas desde ningún
lado: si rotás la key en el proveedor (Resend, etc.), hay que volver a correr
`wrangler secret put` a mano, o el Worker sigue usando la vieja hasta que
falle.

| Secret | Para qué | Fuente del valor |
| --- | --- | --- |
| `RESEND_API_KEY` | Mandar emails (magic link de login, digest semanal de pagos, invitación) | dashboard de Resend |
| `VAPID_PRIVATE_KEY` | Firmar push notifications | par de claves VAPID (generado una vez) |
| `ACTION_TOKEN_SECRET` | Firmar tokens de acciones desde notificaciones (mark-paid, snooze) | generado una vez, no rota salvo incidente |
| `ADMIN_TOKEN` | Secreto compartido para `/billzzz-api/admin/*` (hoy: mandar el email de invitación) | generado una vez (`openssl rand -base64 32`), guardalo también en tu `.dev.vars` local — `scripts/invite-user.mjs --remote` lo necesita y no hay forma de leerlo de vuelta desde Cloudflare |

Verificar que un secret quedó bien puesto **sin poder leer su valor**: la
única forma es probarlo a través del flujo real que lo usa (ej. pedir un
magic link y ver qué mensaje da la app — ver `worker/src/auth.ts`, hay tres
mensajes distintos según qué falló) o mirar los logs del Worker
(`wrangler tail`) mientras se dispara la acción.

## 3. Vars públicas (no son secretas, viven en `wrangler.jsonc`)

Estas se ven en el repo tal cual — no requieren ninguna acción para
"configurarlas", cambian con un commit normal.

`VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `APP_URL`, `EMAIL_FROM`, `APP_VERSION`,
`API_VERSION`.

## 4. Local dev (`.dev.vars`, nunca comiteado)

Copiar `.dev.vars.example` a `.dev.vars` y llenar `VAPID_PRIVATE_KEY`,
`RESEND_API_KEY`, `ACTION_TOKEN_SECRET` con los mismos valores que producción
(o valores de prueba si no hace falta mandar emails reales en local).

## Regla general

Si algo cambia del lado del proveedor externo (Resend, VAPID, lo que sea),
cambiar la key ahí **no alcanza** — hay que empujarla al lugar donde
realmente se usa (Worker secret vía `wrangler secret put`, o GitHub secret
vía `gh secret set`, según la tabla de arriba). Nada de esto se sincroniza
solo entre sistemas.
