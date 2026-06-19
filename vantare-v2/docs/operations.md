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

Mock sin LMU:

```powershell
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

Live con LMU:

```powershell
go run ./cmd/vantare -profile configs/example-racing.json
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

Si `task` esta disponible:

```powershell
task build
task run
task dev
```

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
