# Tasks — bills-pwa

## Revisión de estado del repo en GitHub (2026-07-18)

- [x] **Pre-commit no corre typecheck.** ~~`.husky/pre-commit` solo corre `lint-staged`
      (prettier + oxlint). El bajón de CI del 2026-07-06 fue por errores de `tsc` en
      commits directos a `main` — ese gap sigue abierto y puede repetirse.~~ Resuelto:
      se agregó `npm run typecheck` al final de `.husky/pre-commit`.
- [ ] **Sin branch protection en `main`.** Repo privado en plan free de GitHub
      (`branch protection` requiere GitHub Pro o repo público). Sin gate de PR
      obligatorio, cualquiera puede pushear directo a `main` y romper CI. Evaluar:
      pasar el repo a público, o pagar GitHub Pro, o aceptar el riesgo con el
      pre-commit como única red.
- [ ] **Deploy silencioso si faltan secrets.** `deploy.yml` hace `exit 0` +
      `::warning::` cuando falta `CLOUDFLARE_API_TOKEN`, en vez de fallar. Es
      intencional, pero nadie revisa los warnings activamente — considerar una
      notificación más visible (ej. GitHub Step Summary destacado) si vuelve a pasar.
- [ ] **Sin badges de estado en el README.** Agregar badges de CI y Deploy
      (shields.io apuntando a los workflows) para ver el estado a simple vista.
- [ ] **Confirmar vigencia del `KNOWN_ACCOUNT_ID` hardcodeado** en `deploy.yml`
      (fallback si el secret de Account ID está mal) — no es secreto, pero revisar
      periódicamente que siga siendo la cuenta correcta.
- [ ] Issue [#33](https://github.com/whoscrizzz/bills-pwa/issues/33) (densidad de UI
      en Inicio) — sin relación con este tema, pendiente en el backlog general.
- [ ] **`.husky/pre-commit` usa sintaxis deprecada.** Al commitear salió el aviso:
      *"Please remove the following two lines... They WILL FAIL in v10.0.0"*
      (el shebang `#!/usr/bin/env sh` y la línea `. "$(dirname -- "$0")/_/husky.sh"`).
      Actualizar el hook al formato nuevo de husky antes de que se actualice a v10.
