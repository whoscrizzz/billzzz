# Tasks — billzzz-pwa

Backlog de tareas abiertas. El historial de auditorías y fixes ya resueltos (que antes
vivía en este archivo como bitácora) quedó documentado en los mensajes de commit
correspondientes — no se repite aquí para que este archivo siga siendo una lista de
pendientes, no un changelog.

## Pendientes (del repaso de fidelidad visual vs. handoff de diseño, 2026-08-08)

- [ ] **Reorganizar `src/components/` en subcarpetas** (`spending/`, `recurrence/`,
      `history/`, `settings/`, `shared/`). Hoy es plano, 42 archivos; mover todo
      mezclaría los archivos movidos con cambios reales en el mismo diff — diferido a un
      PR aparte.
- [ ] **Desviaciones chicas de escritorio vs. el prototipo del handoff.**
      `--sidebar-width` 252px vs 240px, celda de calendario 72px vs 84px, `SEM`/52px vs
      `SEMANA`/58px, y `.layout-content { max-width: 920px }` que no alcanza para
      `minmax(0,1fr) + 320px` + la canaleta de totales semanales.
- [ ] **Bug de accesibilidad: `role="img"` con hijos interactivos.** La retícula del
      calendario (`MonthCalendar`, dentro de `SpendingOverview.tsx`) tiene `role="img"`
      conteniendo `<button>` enfocables — un `role="img"` no debe tener hijos
      interactivos.
- [ ] **`?p=calendar` no renderiza ningún calendario**, solo `CalendarSync` +
      `CaptureSetup`, aunque el nav del prototipo lo implica.
