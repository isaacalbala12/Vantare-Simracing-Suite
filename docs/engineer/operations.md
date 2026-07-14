# Operaciones Básicas — Vantare Ingeniero Go

> **Estado:** activo desde 2026-06-27.
> **Adaptado de:** Vantare Ingeniero Go original
> (`docs/operations.md`).

Runbook para operar el repo sin tener que entender todo el código.

## Estado del repo

Ver rama actual:

```powershell
git branch --show-current
```

Ver cambios pendientes:

```powershell
git status --short
```

Interpretación rápida:

- `?? archivo`: archivo nuevo no trackeado.
- `M archivo`: archivo modificado.
- `D archivo`: archivo borrado.
- Si hay cambios antes de empezar una tarea, no los mezcles sin
  entenderlos.

## Instalación básica

Go:

```powershell
go version
```

Frontend:

```powershell
cd frontend
pnpm install
```

Si `pnpm` no está instalado, no cambies de package manager sin aprobarlo
primero.

Wails CLI (prealpha):

```powershell
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
```

## Ejecutar tests

Todos los tests Go:

```powershell
go test ./...
```

Tests enfocados de spotter:

```powershell
go test ./internal/engineer/spotter -v
```

Spotter + runtime relacionado:

```powershell
go test ./internal/engineer/spotter ./internal/engineer/simulator ./internal/engineer/core ./internal/engineer/replay -v
```

> **CORRECCIÓN 2026-06-27:** los paths correctos son
> `internal/engineer/{spotter,simulator,core,replay}/`, no
> `internal/{spotter,simulator,core,sim/lmu}/`. Estos últimos no
> existen.

Si `task` está instalado:

```powershell
task test
```

## Ejecutar debug LMU

Mock sin LMU real:

```powershell
go run ./cmd/lmu-debug -mock -once
```

Live con LMU abierto:

```powershell
go run ./cmd/lmu-debug -hz 5
```

> **CORRECCIÓN 2026-06-27 (pase editorial):**
> `cmd/lmu-debug` solo expone los flags `-once`, `-mock` y `-hz`
> (`cmd/lmu-debug/main.go:24-27`). **No** acepta `-jsonl`. No existe
> `cmd/replay-tool`. Por tanto, esta versión de `operations.md` no
> promete captura JSONL desde CLI.
>
> - Para exportar decisiones del spotter por oponente en JSONL
>   (`alignedX/alignedZ/side/inOverlap/rejectReason`), usar el futuro
>   `cmd/spotter-debug -out <archivo>` (binario a crear; ver
>   `current-plan.md` § 6 Tarea 1).
> - Mientras `cmd/spotter-debug` no exista, **no** ejecutar
>   `cmd/lmu-debug -jsonl ...`. Cualquier traza live debe capturarse
>   manualmente o reutilizar el helper `spotter.WriteDebugRecordsJSONL`
>   desde un test Go (`internal/engineer/spotter/debug_test.go`).
>
> Para validar fixtures de replay, usar directamente los tests del
> paquete `internal/engineer/replay` (cuando existan fixtures), por
> ejemplo:
>
> ```powershell
> go test ./internal/engineer/replay -v
> ```
>
> No invocar `cmd/replay-tool`: ese binario no existe en este
> worktree.

## Frontend

Build frontend:

```powershell
cd frontend
npm run build
```

Nota: `frontend/package.json` tiene `npm test` como placeholder que
imprime `no tests`.

## Wails / App

Desarrollo:

```powershell
task dev
```

Build:

```powershell
task build
```

Estos comandos dependen de tener Wails/Task correctamente instalados.

## Crear rama

Para una tarea pequeña:

```powershell
git switch -c codex/nombre-corto-de-tarea
```

Usa una rama por tarea cuando sea posible.

## Preparar commit

Antes de commitear:

```powershell
git status --short
git diff --stat
```

Comprueba:

- La tarea tocó solo archivos esperados.
- No hay bindings generados mezclados por accidente.
- No hay dependencias nuevas sin aprobar.
- Los tests/checks relevantes pasaron.

Stage selectivo:

```powershell
git add AGENTS.md docs/README.md docs/current-plan.md
```

Commit:

```powershell
git commit -m "add agent control docs"
```

Buenos mensajes:

- `add agent control docs`
- `add spotter replay fixture`
- `fix stale clear message validation`

Malos mensajes:

- `update files`
- `fix stuff`
- `improve project`

## Revertir un cambio simple

No reviertas cambios de otro agente o del usuario sin permiso.

Si necesitas deshacer un archivo concreto, primero pregunta. La
operación típica sería:

```powershell
git restore -- path/to/file
```

Pero no la ejecutes automáticamente si no tienes claro que ese cambio es
tuyo.

## Interpretar errores básicos

`command not found`:

Falta instalar una herramienta o no está en `PATH`.

`go test` falla:

Reporta el paquete, nombre del test y error. No borres tests para pasar.

`npm run build` falla:

Normalmente TypeScript, imports rotos o bindings generados
desactualizados.

`D frontend/bindings/...` en `git status`:

Hay bindings Wails rastreados por git que aparecen borrados. No los
mezcles con otra tarea hasta decidir si se restauran o se regeneran.

`go vet ./...` reporta shadow o variable no usada:

Casi siempre error real. Revisa la línea y arregla el código, no
silencies con `_`.

## Regla de seguridad

Una tarea no está lista para commit si no puedes explicar:

- Qué cambió.
- Por qué cambió.
- Cómo se verificó.
- Cómo volver atrás si algo sale mal.
