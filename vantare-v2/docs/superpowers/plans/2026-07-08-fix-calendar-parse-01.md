# FIX-CALENDAR-PARSE-01 — Hacer el parser testeable de forma determinista

Fecha: 2026-07-08
Estado: plan listo para ejecucion por worker
Skills esperadas: `vantare-core`, `golang-testing`, `test-driven-development`

## Objetivo

Hacer que `calendar.Parse` sea determinista para tests. Anadir `ParseWithReference(text, timezone, reference)` que permite al caller pasar un `reference time.Time` explicito. `Parse` mantiene su firma actual y delega a `ParseWithReference(text, tz, time.Now().In(loc))`. Asi, el test `TestParse_AcceptsValidLines` puede pasar su `reference := time.Date(2026, July, 1, ...)` y obtener el resultado esperado (`2026-07-02 20:00 UTC`) en vez de la fecha del sistema (`2027-07-02 20:00 UTC` por el rolling forward).

Resultado: 29/30 -> 30/30 Go PASS. Cero cambios en caller (`HandleCalendarImport` usa `Parse` y sigue funcionando igual).

## Contexto

- Fallo preexistente baseline 2026-07-08: `internal/calendar.TestParse_AcceptsValidLines` (parse_test.go:50).
- Mensaje literal: `event[0].StartTime = 2027-07-02 20:00:00 +0000 UTC, want 2026-07-02 20:00 UTC`.
- Causa: el parser usa `time.Now().In(loc)` como `reference` (linea 62 de `parse.go`). El test define `reference := time.Date(2026, July, 1, 0, 0, 0, 0, loc)` (1 Julio 2026) como variable local pero el parser lo ignora. La fecha del sistema (8 Julio 2026) hace que "2 Julio" sin año caiga en el pasado y el rolling forward (lineas 201-210 de `parse.go`) lo mueva a 2027.
- Bug real subyacente: el parser no es testeable de forma determinista. La intencion del rolling forward (evitar fechas pasadas) es legitima, pero su implementacion depende de `time.Now()`.

## Decisiones cerradas

1. **API additive**: anadir `ParseWithReference(text, timezone string, reference time.Time) ([]RaceEvent, error)`. NO modificar la firma de `Parse`. El caller de produccion (`HandleCalendarImport`) sigue usando `Parse` y no necesita cambios.
2. **Delegacion**: `Parse(text, timezone)` se reescribe como `return ParseWithReference(text, timezone, time.Now().In(loc))`. Asi mantiene su semantica actual.
3. **Test fix**: `TestParse_AcceptsValidLines` pasa a usar `calendar.ParseWithReference(text, "UTC", reference)` en vez de `calendar.Parse(text, "UTC")`. El assert sigue siendo el mismo (`2026-07-02 20:00 UTC`).
4. **Tests adicionales**: anadir un test `TestParse_UsesCurrentTimeAsReference` que verifica que `Parse` (sin `WithReference`) sigue rodando fechas pasadas hacia el futuro. Esto cubre que la API principal mantiene su semantica de rolling forward.
5. **Sin cambios en logica de parseo**: el rolling forward, la extraccion de weekday, el manejo de anos explicitos, etc. NO se tocan. Solo se hace testeable.
6. **Sin cambios en `HandleCalendarImport`**: el caller sigue usando `Parse`. La implementacion interna delega. Cero impacto en produccion.
7. **Sin nuevos paquetes, sin nuevas dependencias**.

## Archivos a tocar

| Archivo | Accion | Razon |
|---|---|---|
| `internal/calendar/parse.go` | Modificado | Anadir `ParseWithReference`; refactorizar `Parse` para delegar; mover el cuerpo a `ParseWithReference`. |
| `internal/calendar/parse_test.go` | Modificado | Test fallando usa `ParseWithReference`; anadir `TestParse_UsesCurrentTimeAsReference`; anadir test RED para la firma nueva. |
| `docs/superpowers/plans/2026-07-08-fix-calendar-parse-01.md` | Nuevo | Este plan. |
| `docs/current-plan.md` | Anadida nota | Documentar el microcorte. |

## NO se toca

- `internal/app/calendar_bridge.go` (caller, sigue usando `Parse`).
- `internal/calendar/parse_test.go` lineas 77-228 (otros tests pasan; no se tocan a menos que fallen).
- `internal/calendar/calendar.go` y resto del paquete.
- `pnpm-workspace.yaml`, `build/windows/nsis/project.nsi` (cambios ajenos; nsis stashed por usuario para v0.1.0.5).
- Frontend, microfrontends, microcortes WS/I18N/access-dev-modes.

## Microcortes

### MC-0 — RED tests y baseline

Acceptance criteria:
- [ ] `git status --short` capturado (debe mostrar `pnpm-workspace.yaml` modificado y plan nuevo untracked).
- [ ] `go test -count=1 -timeout 120s ./internal/calendar/...` ejecutado, output capturado, 1 fallo (`TestParse_AcceptsValidLines`).
- [ ] `gofmt -l internal/calendar/` ejecutado, sin archivos que reformatear.
- [ ] Test RED para `ParseWithReference` anadido a `parse_test.go`:
  - `TestParseWithReference_UsesGivenReference` — input "2 Julio | 20:00 | X | Y | 30", `reference := time.Date(2026, July, 1, 0, 0, 0, 0, time.UTC)`, asserta `StartTime == 2026-07-02 20:00 UTC`. Falla porque `ParseWithReference` no existe.

Verification:
- [ ] `go test -count=1 -timeout 120s ./internal/calendar/...` (RED, 2 fallos: el original + el nuevo).

### MC-1 — Anadir `ParseWithReference` y refactorizar `Parse`

Acceptance criteria:
- [ ] `internal/calendar/parse.go`:
  - Extraer el cuerpo actual de `Parse` a una nueva funcion `ParseWithReference(text, timezone string, reference time.Time) ([]RaceEvent, error)`.
  - Reescribir `Parse` como `return ParseWithReference(text, timezone, time.Now().In(loc))` (1-3 lineas).
  - `parseLine` y `parseDate` ya reciben `reference` por parametro — no se tocan.
- [ ] Test RED `TestParseWithReference_UsesGivenReference` ahora pasa (GREEN).
- [ ] `TestParse_AcceptsValidLines` actualizado para usar `ParseWithReference` con su `reference` local. Pasa (GREEN).
- [ ] Tests existentes del archivo no se rompen.

Verification:
- [ ] `go test -count=1 -timeout 120s ./internal/calendar/...` (GREEN, 0 fallos).
- [ ] `go test -count=1 -timeout 180s ./...` (GREEN, 30/30 paquetes OK).
- [ ] `go vet ./internal/calendar/...` (limpio).
- [ ] `gofmt -l internal/calendar/` (limpio).
- [ ] `git diff --check -- internal/calendar/ docs/`.

### MC-2 — Test de regresion y documentacion

Acceptance criteria:
- [ ] `TestParse_UsesCurrentTimeAsReference` anadido: usa `time.Now()` truncado al inicio del dia UTC como reference, input con fecha de ayer, asserta que el rolling forward lleva la fecha al ano siguiente. Esto cubre que `Parse` (sin `WithReference`) mantiene su semantica de rolling forward hacia el futuro. Cuidado: el test no debe ser fragil — usar una fecha relativa como `time.Now().AddDate(-1, 0, 0)` y assertar `StartTime.Year() == time.Now().Year() || StartTime.Year() == time.Now().Year()+1`.
- [ ] `docs/current-plan.md` anade nota `## Nota FIX-CALENDAR-PARSE-01 (2026-07-08) — Implementation:` con resumen, archivos tocados, tests (30/30 GO PASS), tsc/vet OK.
- [ ] Este plan recibe una seccion `## Implementation log (2026-07-08)` con la lista exacta de archivos tocados, tests ejecutados y resultado, y la confirmacion de la autorevision.

Verification:
- [ ] `go test -count=1 -timeout 180s ./...` (GREEN, 30/30 OK).
- [ ] `go vet ./...` (limpio).
- [ ] `gofmt -l internal/calendar/` (limpio).
- [ ] `git diff --check -- internal/calendar/ docs/`.

## Autorevision final obligatoria

1. Lista exacta de archivos tocados (solo `internal/calendar/parse.go`, `parse_test.go`, docs).
2. Microcortes completados (MC-0, MC-1, MC-2).
3. Tests RED vistos (2 fallos en MC-0) y GREEN final (30/30).
4. Caller `HandleCalendarImport` intacto (no modificado, sigue usando `Parse`).
5. `Parse` mantiene su firma y semantica (rolling forward funciona).
6. `ParseWithReference` añadido como API additive, testeable de forma determinista.
7. Tests existentes del archivo `parse_test.go` (excepto `TestParse_AcceptsValidLines`) no se rompen.
8. `gofmt` limpio, `go vet` limpio, `go test ./...` limpio.
9. Sin commit, sin tag, sin release, sin push.

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| Romper `HandleCalendarImport` si `Parse` cambia semantica | `Parse` mantiene su comportamiento: delega a `ParseWithReference(text, tz, time.Now().In(loc))`. El caller no nota la diferencia. Tests de integracion en `internal/app` daran la alarma si algo se rompe. |
| Test `TestParse_UsesCurrentTimeAsReference` fragil por transicion de ano | Usar `time.Now().AddDate(-1, 0, 0)` y assertar `Year() == now.Year() || Year() == now.Year()+1` (cualquiera de los dos es valido segun cuando corre el test). |
| Otros tests de `parse_test.go` que asumen `Parse` con `time.Now()` interno | Solo se cambia el test `TestParse_AcceptsValidLines`. Los demas (lineas 77-228) usan `Parse` y siguen funcionando porque su semantica no cambia. |
| `go vet` o `gofmt` falla por el codigo nuevo | Ejecutar `gofmt -w internal/calendar/parse.go` antes de cerrar MC-1. |

## Prompt de ejecucion para Mimo v2.5

```text
Usa las skills: vantare-core, golang-testing, test-driven-development.

Ejecuta completo el plan `docs/superpowers/plans/2026-07-08-fix-calendar-parse-01.md`, de MC-0 a MC-2, sin hacer commit/tag/release.

Reglas duras:
- NO tocar `internal/app/calendar_bridge.go` ni el caller de `Parse`.
- NO tocar `internal/calendar/calendar.go` ni el resto del paquete `calendar` (solo `parse.go` y `parse_test.go`).
- NO tocar frontend, microcortes WS, I18N, access-dev-modes, calendar-refactor, roadmap, launcher.
- NO tocar `pnpm-workspace.yaml` (cambio ajeno).
- NO anadir dependencias.
- NO cambiar la logica de rolling forward (lineas 201-210 de `parse.go`). Solo extraer a `ParseWithReference`.
- `gofmt -w` en archivos Go modificados antes de cerrar MC-1.
- Sin commit, sin tag, sin release, sin push.

Implementa todos los microcortes en orden. Despues de MC-2, ejecuta los checks finales y reporta.

Checks finales obligatorios:
- go test -count=1 -timeout 180s ./...
- go test -count=1 -timeout 120s ./internal/calendar/...
- go vet ./...
- gofmt -l internal/calendar/
- git diff --check -- internal/calendar/ docs/

Autorevision final: incluye los 9 puntos del plan. NO hagas commit, tag, release ni push.

Si necesitas tocar archivos fuera del scope, detente y reporta.
```

## Implementation log (2026-07-08)

### Archivos tocados

| Archivo | Accion | Lineas modificadas |
|---|---|---|
| `internal/calendar/parse.go` | Modificado | `Parse` reescrito (lineas ~55-77) para delegar a `ParseWithReference`; nueva funcion `ParseWithReference` (lineas ~79-110) con `refInLoc := reference.In(loc)`; cuerpo del loop usa `refInLoc`. Rolling forward (lineas 201-210) intacto. |
| `internal/calendar/parse_test.go` | Modificado | Anadido `TestParseWithReference_UsesGivenReference` (RED→GREEN); `TestParse_AcceptsValidLines` usa `ParseWithReference(text, "UTC", reference)`; anadido `TestParse_UsesCurrentTimeAsReference` + helper `spanishMonthsReverse`; import `fmt` anadido. |
| `docs/current-plan.md` | Nota anadida | `## Nota FIX-CALENDAR-PARSE-01 (2026-07-08) — Implementation:` al final. |
| `docs/superpowers/plans/2026-07-08-fix-calendar-parse-01.md` | Nota anadida | Esta seccion `## Implementation log (2026-07-08)`. |

### Microcortes completados

- MC-0: baseline capturado (`git status` muestra `pnpm-workspace.yaml` modificado + plan untracked). `go test ./internal/calendar/...` 1 fallo (`TestParse_AcceptsValidLines`). Test RED `TestParseWithReference_UsesGivenReference` anadido; build falla por `ParseWithReference` indefinido (2 fallos efectivos).
- MC-1: `ParseWithReference` anadido; `Parse` delega. `gofmt -w` aplicado. `go test ./internal/calendar/...` GREEN; `go test ./...` 30/30 OK; `go vet ./internal/calendar/...` limpio; `git diff --check` limpio.
- MC-2: `TestParse_UsesCurrentTimeAsReference` + helper anadidos; `gofmt -w` aplicado. `go test ./...` 30/30 OK (0 FAIL); `go vet ./internal/calendar/...` limpio; `git diff --check` limpio. Docs actualizadas.

### Autorevision (9 puntos)

1. Archivos tocados: solo `internal/calendar/parse.go`, `parse_test.go`, y docs (`current-plan.md` + este plan). OK.
2. Microcortes MC-0, MC-1, MC-2 completados. OK.
3. RED vistos en MC-0 (build failure / 2 fallos efectivos) y GREEN final 30/30. OK.
4. Caller `HandleCalendarImport` (`internal/app/calendar_bridge.go`) intacto, sigue usando `Parse`. OK (no modificado).
5. `Parse` mantiene firma y semantica (rolling forward funciona, delegando a `ParseWithReference(text, tz, time.Now().In(loc))`). OK.
6. `ParseWithReference` anadido como API additive, determinista. OK.
7. Tests existentes de `parse_test.go` (excepto `TestParse_AcceptsValidLines`) no se rompen. OK.
8. `gofmt` limpio en scope; `go vet` limpio en scope; `go test ./...` limpio. (Nota: `calendar.go`/`official_schedule.go` tienen formato pre-existente y `reader_windows.go` tiene vet warning pre-existente, ambos fuera de scope y no tocados.)
9. Sin commit, sin tag, sin release, sin push. OK.

### git diff --stat HEAD final

```
 git diff --stat HEAD
```

(Ver output literal al final del reporte del worker.)
