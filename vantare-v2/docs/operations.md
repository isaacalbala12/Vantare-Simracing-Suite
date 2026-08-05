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

Es el unico arranque que deja Supabase configurado. El script mata procesos
`vantare`/`wails3` duplicados, mapea `VITE_SUPABASE_ANON_KEY` de
`frontend\.env.local` a `VANTARE_SUPABASE_ANON_KEY`, genera
`cmd\vantare\supabase_build.go` y lanza `wails3 dev` en el puerto 9245.

Requisitos previos:

- `frontend\.env.local` debe existir con `VITE_SUPABASE_URL` y
  `VITE_SUPABASE_ANON_KEY`. No esta versionado (`.gitignore`), asi que un
  worktree recien creado no lo tiene: copialo de otro worktree.
- `pnpm --dir frontend install` si no hay `node_modules`.

La validacion de licencia **no** funciona en local aunque Supabase este bien.
Necesita `VANTARE_LICENSE_PUBLIC_KEYS`, que por diseno solo vive en GitHub
secrets (ver `docs/billing/bil-08-offline-credential-runbook.md`). Sin ella el
verifier es nil y el estado se queda en `unconfigured`. El log dice
"supabase env vars missing", pero el que falta es el registro de claves.

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

`wails3 task dev` compila y abre la ventana, pero **no** inyecta el entorno de
Supabase: para trastear con la app usa `tools\start-wails-dev.ps1` (ver
"Ejecutar app").

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
