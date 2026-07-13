# TC-01B — Baseline de tests antes del merge

## Entorno

- Fecha: 2026-07-14.
- HEAD inicial ISA-24: bb1eeafd1f7dd299fd41387f889a88acce15059e.
- Go: go1.26.4 windows/amd64; el módulo declara Go 1.25.0.
- Node: v24.14.1.
- pnpm: 9.1.0.

El worktree nuevo no contenía node_modules. Se ejecutó pnpm --dir frontend install --frozen-lockfile: exit 0, 18.454 ms, 848 paquetes desde el lockfile y sin cambios de manifiestos o lockfiles. pnpm mostró el warning Node DEP0169 sobre url.parse().

## Resultado de comandos canónicos

| Comando | Resultado | Duración medida | Evidencia |
|---|---:|---:|---|
| go test ./internal/telemetry/... ./internal/app/... ./internal/server/... -count=1 | FAIL, exit 1 | 9.890 ms | Telemetry y app PASS; tres tests nonce de server fallan |
| pnpm --dir frontend test | PASS, exit 0 | 49.965 ms | 252 files, 1.679 tests PASS; dos AbortError después del resumen |
| pnpm --dir frontend build | PASS, exit 0 | 12.450 ms | 739 módulos; chunk JS 1.161,56 kB; warning mayor de 500 kB |
| pnpm --dir frontend visual:overlay-studio | FAIL, exit 1 | 6.677 ms | 3 Original PASS; primer Crystal falla con 99,963% |
| go test ./internal/engineer/... -count=1 | PASS, exit 0 | 13.221 ms | 31 paquetes Engineer PASS |
| go test ./internal/telemetry/... ./internal/engineer/... ./internal/app/... ./internal/server/... -count=1 | FAIL, exit 1 | 26.108 ms | Gate global: todos los paquetes listados PASS salvo los mismos tres tests nonce |
| go build -o %TEMP%\vantare-isa24.exe ./cmd/vantare | PASS, exit 0 | 1.688 ms | Binario de diagnóstico fuera del repo |

## Fallos exactos del baseline

### Go server

El comando combinado falla solo en internal/server:

~~~text
TestAuthTokenRejectsMissingNonce: POST /auth/token missing nonce = 200, want 401
TestAuthTokenRejectsInvalidNonce: POST /auth/token invalid nonce = 200, want 401
TestAuthTokenRejectsReusedNonce: reused nonce = 200, want 401
~~~

También se registró el caso esperado de listener ocupado en un test de servidor. Los tres fallos nonce ya constan como deuda preexistente en docs/current-plan.md; ISA-24 no los corrige ni debilita.

### Frontend unit tests

Vitest finalizó con:

~~~text
Test Files  252 passed (252)
Tests       1679 passed (1679)
Duration    48.23s
~~~

Después del resumen aparecieron dos trazas DOMException AbortError desde teardown de Happy DOM. El exit fue 0; se registran porque pueden señalar trabajo fetch pendiente aunque no fallen la suite.

### Frontend build

El build terminó correctamente. Vite advirtió que el chunk principal minificado mide 1.161,56 kB, por encima de 500 kB. No se cambia code splitting en este corte.

### Visual Overlay Studio

El harness produjo:

~~~text
ok delta-original-ready-studio (0.000% delta)
ok delta-original-ready-desktop (0.000% delta)
ok delta-original-ready-obs (0.000% delta)
delta-crystal-ready-studio: pixel delta 99.963% exceeds 0.500%
~~~

El fallo ocurre sobre el SHA base sin cambios de código, por lo que queda caracterizado como baseline preexistente. No se actualizaron baselines visuales.

## Baseline Engineer aislado

El checkout activo C:\Users\isaac\Desktop\Vantare-Overlays\vantare-v2-engineer estaba en el SHA correcto, pero no limpio:

- 3 archivos tracked modificados;
- 34 rutas untracked;
- total: 37 entradas de git status --short.

No se modificó ni limpió ese checkout. Para evitar contaminar la evidencia se creó un worktree detached y limpio:

C:\Users\isaac\emdash\worktrees\vantare-v2\isa-24-engineer-baseline

Ese snapshot apunta exactamente a 91cf7e9323bd53edbf1d554d2d32f3f4fd748c82. La suite Engineer pasó en sus 31 paquetes, incluidos audio, commands, core, todos los monitores, pitmanager, replay, service, simulator, spotter y telemetry.

## Interpretación

- No hay pérdida observable en la suite Engineer del commit donante.
- El baseline refactor no está verde globalmente por los tres tests nonce ya conocidos.
- El frontend funcional está verde, pero muestra AbortError de teardown.
- El build está verde con deuda de tamaño de chunk.
- El baseline visual Crystal no es reproducible en este entorno y falla antes de cualquier merge.

ISA-25 no debe presentar estos fallos como introducidos por la resolución del merge. También debe demostrar que no añade fallos nuevos sobre esta lista.
