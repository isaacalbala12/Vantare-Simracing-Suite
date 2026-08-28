# Tareas ISA-915: login Clerk visible

Estado: T0-T4 completadas; T5 bloqueada para Wails real por configuración.

## T0 — SDD y baseline

- [x] Crear ISA-915 y añadirla al Project Vantare.
- [x] Crear rama/worktree aislados sobre ISA-909 `4751bfa5`.
- [x] Escribir spec, plan y tareas con límite de no sobreingeniería.
- [x] Actualizar roadmap y handoff; la issue se actualiza en cada checkpoint.
- [x] Regenerar digest y ejecutar `git diff --check`.
- [x] Ejecutar baseline focal: 5 archivos, 86 tests verdes.
- [x] Commit documental `fddc5c74`.

## T1 — SDK y sesión

- [x] Tests rojos del provider/bridge.
- [x] Añadir únicamente `@clerk/react` 6.14.7.
- [x] Implementar configuración, estados y `session.getToken()`.
- [x] Sustituir el bridge Supabase en AppShell sin envolver overlays.
- [x] 41 tests focales y typecheck verdes.
- [x] Commit del corte `4720fb18`.

## T2 — UI y cuenta

- [x] Tests rojos de LoginScreen.
- [x] Montar `SignIn` oficial sin formulario duplicado.
- [x] Migrar identidad visible a Clerk.
- [x] Migrar comprobación de acceso, reset de dispositivo y logout.
- [x] Completar traducciones ES/EN/IT/PT y retirar 27 claves huérfanas.
- [x] 125 tests focales, i18n audit y typecheck verdes.
- [ ] Commit del corte.

## T3 — Gates frontend

- [x] Suite frontend: 422 archivos, 3.185 tests verdes.
- [x] Typecheck.
- [x] Lint focal verde; lint completo conserva una deuda ajena en
  `car-damage-numbers-view-model-v2.ts`.
- [x] Build final después de extraer la vista reutilizada por el harness.
- [x] `git diff --check` y revisión completa del diff final.

## T4 — Pruebas UI

- [x] Harness sin credenciales/tokens y sin duplicar el marco productivo.
- [x] Playwright 375/414/768/1024/1440: 15/15 combinaciones.
- [x] Teclado, foco, overflow, targets, consola y red.
- [x] Screenshots de loading, signed-out y error.
- [ ] Commit de evidencia reproducible (se completa al cerrar este corte).

## T5 — Wails y cierre

- [ ] Wails real: bloqueado porque el proceso no tiene
  `VITE_CLERK_PUBLISHABLE_KEY`; no se leen ni generan `.env*`.
- [x] Actualizar spec, roadmap y handoff con evidencia exacta.
- [ ] Actualizar issue con el commit de evidencia exacto.
- [ ] Push/PR draft solo con gates verdes.
- [ ] Registrar por separado cualquier bloqueo de runtime real.

## Stop conditions

- Hace falta tocar Go, SQL, Edge, Billing o Testing Center.
- El SDK requiere otra dependencia directa o configuración secreta frontend.
- Clerk necesita un almacenamiento propio o un bridge genérico para funcionar.
- Los tests fallan por causa no comprendida.
- La prueba real necesita deploy, merge o mutación de usuarios/datos.
