# Tasks — billzzz-pwa

Backlog de tareas abiertas. El historial de auditorías y fixes ya resueltos (que antes
vivía en este archivo como bitácora) quedó documentado en los mensajes de commit
correspondientes — no se repite aquí para que este archivo siga siendo una lista de
pendientes, no un changelog.

## Pendientes operativos D1/Deploy

- [x] **Separar deploy de migraciones D1 de producción.** `deploy:safe`,
      `scripts/deploy-production.sh` y `.github/workflows/deploy.yml` ya no aplican
      migraciones remotas como efecto secundario del deploy.
- [x] **Agregar flujo manual para migraciones D1 prod.** `npm run db:migrate:production`
      exige `CONFIRM_D1_PROD_MIGRATION=bills-pwa-db` y valida antes de tocar D1.
- [x] **Bloquear deploy automático cuando cambian migraciones.** GitHub Actions falla
      antes de desplegar si el push a `main` incluye archivos en `migrations/`.
- [x] **Reforzar borrado de payment record restaurado.** El `DELETE` interno de
      `restoreArchivedSubscription` ahora también filtra por `user_id`.
- [ ] **Probar restauración real en D1 temporal.** Usar un backup reciente de R2,
      restaurarlo en una base no productiva y verificar conteos/tablas antes del
      siguiente cambio de esquema.

## Pendientes (del repaso de fidelidad visual vs. handoff de diseño, 2026-08-08)

- [ ] **Reorganizar `src/components/` en subcarpetas** (`spending/`, `recurrence/`,
      `history/`, `settings/`, `shared/`). Hoy es plano, 51 archivos; mover todo
      mezclaría los archivos movidos con cambios reales en el mismo diff — diferido a un
      PR aparte.
- [ ] **Desviaciones chicas de escritorio vs. el prototipo del handoff.**
      `--sidebar-width` 300px vs 240px, celda de calendario 72px vs 84px, `SEM`/52px vs
      `SEMANA`/58px, y `.layout-content { max-width: 920px }` que no alcanza para
      `minmax(0,1fr) + 320px` + la canaleta de totales semanales.
- [ ] **Bug de accesibilidad: `role="img"` con hijos interactivos.** La retícula del
      calendario (`MonthCalendar`, dentro de `SpendingOverview.tsx`) tiene `role="img"`
      conteniendo `<button>` enfocables — un `role="img"` no debe tener hijos
      interactivos.
- [ ] **`?p=calendar` no renderiza ningún calendario**, solo `CalendarSync` +
      `CaptureSetup`, aunque el nav del prototipo lo implica.
