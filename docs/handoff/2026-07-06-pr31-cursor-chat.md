# Handoff — nuevo chat en `~/Projects/bills-pwa`

Copia **todo el bloque "PROMPT PARA CHAT NUEVO"** en un chat nuevo de Cursor (Agent) con el repo local abierto.

---

## PROMPT PARA CHAT NUEVO

```text
Proyecto: bills-pwa (PWA suscripciones). Repo canónico: ~/Projects/bills-pwa. Producción: https://bills.whoscrizzz.com

Lee primero (en este orden): AGENTS.md, memory.md, docs/ARCHITECTURE.md, docs/cloudflare/inventario.md.

Estado actual (jul 2026):
- Rama de trabajo: cursor/bills-pwa-improvements-0d18
- PR draft: https://github.com/whoscrizzz/bills-pwa/pull/31
- Commits clave: 4cacbe4 (plan PWA/offline/FAB/docs), c2a3a5b (fixes quick-add, long-press, snooze UTC)
- main sigue en 9ddd0a0 hasta merge del PR

Qué ya entró en el PR:
- Manifest PWA único en vite.config.ts (eliminado public/manifest.json obsoleto)
- FAB + QuickAddSheet en Inicio; navegación ?p=home|add|calendar|settings
- Offline: cola mark-paid, snooze, restore-archived en IndexedDB + sync.ts
- notify_hour = hora Ciudad de México (worker/src/timezone.ts)
- MarkPaidModal vía "Monto/fecha" / long-press; duplicar en tarjetas; docs alineados

Qué sigue (prioridad):
1. En Mac: git fetch && git checkout cursor/bills-pwa-improvements-0d18 && npm ci && npm run validate && npm run build
2. Revisar CI verde en PR #31; corregir lo que falle
3. Smoke manual: PWA instalada (login pegar link), FAB quick-add, mark-paid offline→online, push en Ajustes
4. Merge a main solo si validate + tu OK
5. Deploy: npm run deploy:safe SOLO con mi permiso explícito (nunca sin OK)
6. Opcional post-merge: bump APP_VERSION en wrangler.jsonc si quieres forzar refresh PWA en todos

Restricciones (no negociar):
- Un worker, puertos 8787 (API) y 5173 (Vite), local 127.0.0.1
- Sin deploy/DNS/bindings/secretos prod sin OK explícito
- Gate: npm run validate antes de PR

Tu tarea ahora: [ESCRIBE AQUÍ — ej. "merge PR 31 tras validate" o "probar FAB en iPhone y arreglar X"]

Al terminar la sesión: actualiza memory.md solo con hechos duraderos (no changelog). Si hubo decisión de producto, añade fila en docs/decisions/bills-ux-fixes.tsv.
```

---

## PROMPTS PARA MEMORIA DEL REPO (`memory.md`)

Pégalo al agente al **cerrar** una sesión útil (estilo Claude: consolidar, no volcar chat):

```text
Actualiza memory.md en bills-pwa siguiendo estas reglas:
- Es memoria operativa durable, NO changelog de sesión ni lista de commits.
- Máximo 120 líneas; tablas para puertos, bindings, comandos, web vs móvil.
- Incluye solo: URLs, IDs D1, convenciones offline/sync, timezone push, dónde vive el manifest PWA.
- Elimina o acorta entradas obsoletas (ej. public/manifest.json si ya no existe).
- No copies secretos ni tokens.
- Si algo es "próximo paso" temporal, ponlo en docs/handoff/ con fecha, no en memory.md.

Diff mínimo y legible. No toques AGENTS.md salvo que cambien comandos o prohibiciones.
```

---

## PROMPTS PARA MEMORIA GLOBAL (Cursor User Rules / Memory)

Para **tu perfil de usuario** en Cursor (aplica a todos los repos):

```text
Memoria global — bills-pwa / Cloudflare:
- Titular: Cristofer; producción bills.whoscrizzz.com; repo privado whoscrizzz/bills-pwa.
- Prefiere respuestas en español, prosa clara, sin emojis; deploy solo con OK explícito.
- Stack: React PWA + un Worker Cloudflare + D1; no segundo worker ni túneles para dev.
- Antes de PR: npm run validate en ~/Projects/bills-pwa.
- Agentes no deben deployar ni tocar secretos/DNS en prod sin permiso.
```

```text
Memoria global — cómo trabajar conmigo en código:
- Minimizar diff; no refactor no pedido; seguir convenciones del archivo.
- Leer AGENTS.md + memory.md al inicio en bills-pwa.
- Tras cambios grandes: rama cursor/<nombre>-0d18, commit, push, PR draft.
```

---

## Comandos rápidos en tu Mac

```bash
cd ~/Projects/bills-pwa
git fetch origin
git checkout cursor/bills-pwa-improvements-0d18
git pull
nvm use
npm ci
npm run validate
npm run dev:api   # terminal 1 — :8787
npm run dev       # terminal 2 — :5173
```

---

## Referencias

| Archivo | Uso |
|---------|-----|
| [memory.md](../../memory.md) | Estado operativo repo |
| [docs/decisions/bills-ux-fixes.tsv](../decisions/bills-ux-fixes.tsv) | Decisiones UX |
| [docs/handoff/2026-07-06-pr31-cursor-chat.md](./2026-07-06-pr31-cursor-chat.md) | Este handoff |
