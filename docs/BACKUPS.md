# Backups de la base de datos (D1)

## Qué protege esto y qué no

D1 ya tiene **Time Travel**: restaura toda la base a cualquier minuto de los
últimos 30 días, automático, sin configurar nada. Eso cubre el 90% de los
sustos (un bug, una migración mala, un borrado accidental) — no hace falta
nada más para eso.

Este sistema cubre lo que Time Travel no cubre:

- Que pase más de 30 días sin notar el problema.
- Perder acceso a la cuenta de Cloudflare, o borrar la base por error (Time
  Travel se va con la base si la base misma desaparece).
- Tener una copia fuera de Cloudflare, por si el problema es de Cloudflare y
  no tuyo.

## Cómo funciona

Cada domingo a las 04:00 UTC, `.github/workflows/backup-d1.yml`:

1. Exporta `bills-pwa-db` completa con `wrangler d1 export --remote`.
2. La comprime y la cifra (AES-256, con la clave `BACKUP_ENCRYPTION_KEY`).
3. Verifica que lo cifrado descifra exactamente igual al original **antes**
   de subir nada — si la verificación falla, el workflow falla y no sube un
   backup corrupto.
4. Sube el resultado a un bucket R2 (`bills-pwa-backups`), fuera de D1.

Si falta algún secret o algo sale mal, el workflow **falla en rojo** (no
"omite con warning" como `deploy.yml`) — un backup que se salta en silencio
es exactamente el problema que esto existe para resolver.

También se puede correr a mano: `gh workflow run backup-d1.yml --ref main`.

## Setup inicial (una sola vez)

1. **Crear el bucket R2** (necesita wrangler logueado en tu Mac):

   ```bash
   npx wrangler r2 bucket create bills-pwa-backups
   ```

2. **Agregar permiso R2 al token existente.** El `CLOUDFLARE_API_TOKEN` que ya
   usa `deploy.yml` (Workers + D1) NO incluye R2. En
   [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   editá ese token y agregale **Workers R2 Storage — Edit**. Si el dashboard no
   te deja editar permisos in-place, creá un token nuevo con los mismos
   permisos de siempre + este, y reemplazá el secret:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --repo whoscrizzz/billzzz-pwa
   ```

3. **Generar la clave de cifrado:**

   ```bash
   scripts/setup-backup-secret.sh
   ```

   Guarda la clave en un gestor de contraseñas antes de confirmar. **Si se
   pierde la clave, los backups cifrados son irrecuperables** — no hay forma
   de recuperarla, ni Cloudflare ni GitHub la tienen en ningún otro lado.

4. **(Opcional) Retención automática en R2** — para no acumular backups para
   siempre:

   ```bash
   npx wrangler r2 bucket lifecycle add bills-pwa-backups \
     --id expire-old-backups --expire-days 180
   ```

5. **Probar:**

   ```bash
   gh workflow run backup-d1.yml --ref main --repo whoscrizzz/billzzz-pwa
   gh run watch --repo whoscrizzz/billzzz-pwa
   ```

## Restaurar

```bash
scripts/restore-d1-backup.sh --list
scripts/restore-d1-backup.sh --file bills-pwa-20260802T040001Z.sql.gz.enc
```

Eso descarga y descifra el `.sql` a la carpeta actual — no toca ninguna base
todavía. Para probarlo de verdad, restaurar a una base separada, nunca directo
a producción:

```bash
npx wrangler d1 create bills-pwa-db-restore-test
scripts/restore-d1-backup.sh --file <archivo> --apply-to bills-pwa-db-restore-test
```

El script se niega a aplicar directo sobre `bills-pwa-db` (producción) — si
después de verificar los datos en la base de prueba hace falta reemplazar
producción, es un paso manual y deliberado, no un flag.

## Qué falta si esto crece

Esto alcanza para un proyecto personal. Si `bills-pwa` alguna vez tiene
usuarios que no sos vos, conviene sumar: alertas activas si el workflow falla
dos semanas seguidas (no solo el email default de GitHub), y probar la
restauración completa de vez en cuando en vez de confiar en que el script
sigue funcionando.
