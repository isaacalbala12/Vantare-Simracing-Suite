# Operaciones

Comandos contrastados con el código y CI de nightly del 2026-09-14. Salvo indicación, ejecutar desde `vantare-v2`.

## Requisitos y preparación

Go según [go.mod](../go.mod) (1.25.0 en este corte), Node 22 y pnpm 9.1.0 como [CI](../../.github/workflows/branch-channel-gates.yml). Wails v3 usa la versión fijada en ese workflow. Windows 10/11 con WebView2 es el entorno objetivo del runtime LMU.

Leer [AGENTS](../AGENTS.md) y la tarea/proyecto en Notion antes de editar. Obtener `origin/nightly`, comprobar HEAD y trabajar en rama/worktree propios.

## Estado del repo

```powershell
git status --short
git branch --show-current
```

Si hay cambios antes de empezar, no mezclarlos sin avisar.

## Instalar frontend

```powershell
cd ..
pnpm install --frozen-lockfile
cd vantare-v2
```

## Tests

En un checkout limpio, compilar primero los assets que Go embebe:

```powershell
pnpm --dir frontend build
go test ./...
pnpm --dir frontend test
```

## Build frontend

```powershell
pnpm --dir frontend build
```

## Lint frontend

```powershell
pnpm --dir frontend lint
```

## Ejecutar app

### Ruta normal: app de escritorio completa

```powershell
powershell -File tools\start-wails-dev.ps1
```

Este helper es solo para desarrollo interactivo del checkout actual. Detiene
procesos `vantare`/`wails3` duplicados, libera el puerto 9245 si lo sigue
ocupando el `node` de Vite que deja atras el `wails3 dev` anterior, usa la
configuracion local prevista por el script, genera
`cmd\vantare\supabase_build.go` y lanza `wails3 dev` en ese mismo puerto. No es
una receta de release, no produce artefactos publicables y no sustituye el
preflight de `docs/release-artifacts.md`.

Si el 9245 lo ocupa un proceso ajeno al stack, el script lo nombra y se para en
vez de matarlo.

Requisitos previos:

- `frontend\.env.local` debe existir con `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`. No esta versionado (`.gitignore`). En un worktree
  nuevo, obten la ruta o los valores publicos por el canal autorizado y crea
  su configuracion local; **no copies archivos `.env*` entre worktrees**. Para
  un build de artefactos, la receta oficial puede leer la ruta autorizada en su
  ubicacion original sin copiarla.
- Instalación desde la raíz con `pnpm install --frozen-lockfile` si no hay `node_modules`.

Una pareja Supabase local permite comprobar login contra ese proyecto, pero no
demuestra paridad real de licencia. Para ella hace falta tambien el registro
publico autorizado `VANTARE_LICENSE_PUBLIC_KEYS` y la configuracion de canal/CI
(ver `docs/billing/bil-08-offline-credential-runbook.md`). Sin el registro, el
verifier queda sin configurar y el estado puede permanecer `unconfigured`.

### App con assets compilados

Compila primero el frontend: Go lo embebe mediante [frontend/embed.go](../frontend/embed.go). El siguiente comando también abre Wails; no es un modo headless.

```powershell
pnpm --dir frontend build
go run ./cmd/vantare -live=false -profile configs/example-racing.json
go run ./cmd/vantare -profile configs/example-racing.json
```

La primera variante deshabilita el live y publica desconectado; la segunda intenta adquirir LMU. Ninguna convierte ausencia de fuente en datos de prueba. El diagnóstico sintético explícito pertenece a `lmu-debug -mock`, no al arranque de producto.

## Debug LMU

Mock:

```powershell
go run ./cmd/lmu-debug -mock -once
```

Live:

```powershell
go run ./cmd/lmu-debug -once
go run ./cmd/lmu-debug -hz 10
```

## Build con Task

`task` no suele estar en el PATH. `wails3` trae Task integrado, asi que la forma
portable de invocar cualquier target del `Taskfile.yml` es:

```powershell
wails3 task build
wails3 task run
wails3 task dev
```

`wails3 task dev` compila y abre la ventana, pero no prepara por si solo la
configuracion local que espera la sesion. Para el flujo interactivo concreto
descrito arriba puede usarse `tools\start-wails-dev.ps1`. Para build
distribuible, usa exclusivamente `docs/release-artifacts.md`.

## Commit pequeno

```powershell
git status --short
git add <archivos>
git commit -m "mensaje claro"
```

Buenos mensajes:

- `docs: add agent control layer`
- `fix(hub): refresh profiles after creation`
- `test(hub): cover widget studio layout separation`

Malos mensajes:

- `fix stuff`
- `update`
- `big changes`

## Rollback simple

No usar comandos destructivos sin aprobacion.

Si un cambio esta en un commit propio y hay que revertirlo:

```powershell
git revert <commit>
```

Si son archivos sin commit, pedir decision antes de descartar cambios.
