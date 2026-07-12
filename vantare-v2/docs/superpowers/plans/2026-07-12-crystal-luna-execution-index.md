# Vantare Crystal Luna Execution Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute one microplan at a time, one checkbox at a time. Never start the next document until the current gate is green and `docs/current-plan.md` contains its evidence.

**Goal:** Convertir el plan maestro Crystal en seis entregas pequeñas, verificables y ordenadas para GPT-5.6 Luna.

**Architecture:** El orden fija primero contratos y UX, después material visual, widgets existentes y nuevos, y finalmente integración/cutover. Cada microplan deja software compilable y reversible; ningún renderer accede a transportes, persistencia, permisos o layout.

**Tech Stack:** Go, React 19, TypeScript estricto, Vitest, Playwright, Wails v3, CSS existente, sin dependencias nuevas.

---

## Autoridades y reglas que Luna no puede reinterpretar

- Rama/worktree esperado: `refactor`. Si `git branch --show-current` no devuelve `refactor`, parar.
- Antes del primer corte, el usuario debe haber dejado una base commiteada o un worktree dedicado. No absorber el worktree sucio actual.
- Autoridad funcional/arquitectónica: `docs/superpowers/plans/2026-07-12-vantare-crystal-glassmorphism-direct-replacement.md`.
- Autoridad visual: solo las secciones numeradas 01–16 de `docs/overlay-glassmorphism-pro.html`.
- Excluir por completo el bloque `V2. WIDGETS REESTILIZADOS` y `.v2-section`.
- Inventario fijo: 18 tipos, 21 diseños Crystal, mínimo 18 diseños Original.
- No modificar canvas drag/resize. Si una tarea parece requerirlo, parar: el renderer debe adaptarse al frame existente.
- No añadir dependencias, cambiar schema version, inventar telemetría live ni actualizar baselines para ocultar diferencias.

## Orden obligatorio

1. [Microplan 01 — Contratos, sistema→diseño y UX](/C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/superpowers/plans/2026-07-12-crystal-microplan-01-contracts-design-ui.md)
2. [Microplan 02 — Referencia, tokens y primitivas Crystal](/C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/superpowers/plans/2026-07-12-crystal-microplan-02-reference-foundation.md)
3. [Microplan 03 — Cuatro tipos actuales](/C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/superpowers/plans/2026-07-12-crystal-microplan-03-core-widgets.md)
4. [Microplan 04 — Widgets nuevos con datos live disponibles](/C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/superpowers/plans/2026-07-12-crystal-microplan-04-live-widgets.md)
5. [Microplan 05 — Widgets derivados y fuentes auxiliares](/C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/superpowers/plans/2026-07-12-crystal-microplan-05-derived-widgets.md)
6. [Microplan 06 — Catálogo, migración, paridad y cutover](/C:/Users/isaac/Desktop/Vantare-Overlays/vantare-v2/docs/superpowers/plans/2026-07-12-crystal-microplan-06-integration-cutover.md)

## Disponibilidad real de datos

| Dato | Fuente actual | Política |
|---|---|---|
| speed, gear, RPM, fuel, deltaBest, throttle, brake, clutch | `TelemetryPayload.snapshot.player` / `TelemetryRefState` | Live permitido |
| track, session, remaining time, global/sector flags | `TelemetryPayload.snapshot.session` | Live permitido |
| clasificación, laps, gaps, pits, tyres, penalties | `vehicles` / `VehicleScoring` | Live permitido mediante readers puros |
| history de inputs, delta trace, fuel por vuelta | historial acotado derivado de snapshots | Derivar fuera del renderer; reset por `sessionKey/sessionEpoch` |
| calendario | `configs/calendar-lmu.json` y capa Calendar existente | Adapter read-only; renderer sin fetch |
| weather y damage | no normalizados actualmente | Mock completo; live debe mostrar `unknown` hasta contrato real aprobado |

## Gate global por microplan

```powershell
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend design-system:check
git diff --check
```

Si toca Go/JSON compartido, añadir:

```powershell
gofmt -w pkg/config/profile_v3.go pkg/config/profile_v3_validate.go pkg/config/profile_v3_migrate.go
go test ./pkg/config/... ./internal/app/... -count=1
```

Cada commit debe contener un solo cambio de comportamiento y su test. No usar `git add .`.
