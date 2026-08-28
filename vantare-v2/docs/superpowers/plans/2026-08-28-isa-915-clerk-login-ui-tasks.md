# Tareas ISA-915: login Clerk visible

Estado: T0 y T1 completadas; T2 en curso.

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
- [ ] Commit del corte.

## T2 — UI y cuenta

- [ ] Tests rojos de LoginScreen.
- [ ] Montar `SignIn` oficial sin formulario duplicado.
- [ ] Migrar identidad visible a `useUser`.
- [ ] Migrar comprobación de acceso y logout.
- [ ] Completar traducciones ES/EN/IT/PT.
- [ ] Tests focales verdes y commit.

## T3 — Gates frontend

- [ ] Suite frontend.
- [ ] Typecheck.
- [ ] Lint.
- [ ] Build.
- [ ] `git diff --check` y revisión completa del diff.

## T4 — Pruebas UI

- [ ] Harness sin credenciales/tokens.
- [ ] Playwright 375/414/768/1024/1440.
- [ ] Teclado, foco, overflow, targets, consola y red.
- [ ] Screenshots de loading, signed-out y error.
- [ ] Commit de evidencia reproducible.

## T5 — Wails y cierre

- [ ] Wails real si configuración/backend están disponibles.
- [ ] Actualizar spec, roadmap, handoff e issue con evidencia exacta.
- [ ] Push/PR draft solo con gates verdes.
- [ ] Registrar por separado cualquier bloqueo de runtime real.

## Stop conditions

- Hace falta tocar Go, SQL, Edge, Billing o Testing Center.
- El SDK requiere otra dependencia directa o configuración secreta frontend.
- Clerk necesita un almacenamiento propio o un bridge genérico para funcionar.
- Los tests fallan por causa no comprendida.
- La prueba real necesita deploy, merge o mutación de usuarios/datos.
