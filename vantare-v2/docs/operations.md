# Operaciones

Comandos basicos para trabajar en `vantare-v2`.

## Estado del repo

```powershell
git status --short
git branch --show-current
```

Si hay cambios antes de empezar, no mezclarlos sin avisar.

## Instalar frontend

```powershell
pnpm --dir frontend install
```

## Tests

```powershell
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
procesos `vantare`/`wails3` duplicados, usa la configuracion local prevista por
el script, genera `cmd\vantare\supabase_build.go` y lanza `wails3 dev` en el
puerto 9245. No es una receta de release, no produce artefactos publicables y
no sustituye el preflight de `docs/release-artifacts.md`.

Requisitos previos:

- `frontend\.env.local` debe existir con `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`. No esta versionado (`.gitignore`). En un worktree
  nuevo, obten la ruta o los valores publicos por el canal autorizado y crea
  su configuracion local; **no copies archivos `.env*` entre worktrees**. Para
  un build de artefactos, la receta oficial puede leer la ruta autorizada en su
  ubicacion original sin copiarla.
- `pnpm --dir frontend install` si no hay `node_modules`.

Una pareja Supabase local permite comprobar login contra ese proyecto, pero no
demuestra paridad real de licencia. Para ella hace falta tambien el registro
publico autorizado `VANTARE_LICENSE_PUBLIC_KEYS` y la configuracion de canal/CI
(ver `docs/billing/bil-08-offline-credential-runbook.md`). Sin el registro, el
verifier queda sin configurar y el estado puede permanecer `unconfigured`.

### Ruta minima: solo backend, sin ventana Wails

Util para probar telemetria o el servidor de overlays sin compilar el frontend.
No hay UI ni sesion de usuario.

```powershell
go run ./cmd/vantare -live=false -profile configs/example-racing.json   # mock sin LMU
go run ./cmd/vantare -profile configs/example-racing.json               # live con LMU
```

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
