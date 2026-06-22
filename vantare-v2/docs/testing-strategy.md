# Estrategia de testing

## Objetivo

Que el usuario pueda confiar en agentes sin revisar codigo complejo. Los jueces reales son tests, build, lint cuando aplique y verificacion manual.

## Comandos principales

Desde la raiz `vantare-v2`:

```powershell
go test ./...
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
```

Usar `pnpm --dir frontend lint` cuando el cambio toque frontend y el estado actual de ESLint lo permita. Si falla por problemas preexistentes, el worker debe decirlo claramente.

## Ejecutar la app

Modo mock sin LMU:

```powershell
go run ./cmd/vantare -live=false -profile configs/example-racing.json
```

Modo live con LMU:

```powershell
go run ./cmd/vantare -profile configs/example-racing.json
```

## Go

Usar:

```powershell
go test ./...
```

Para cambios en telemetria LMU:

```powershell
go test ./internal/telemetry/lmu/ -run Fixture
```

Si falta fixture real, algunos tests pueden hacer `Skip`; eso debe informarse.

## Frontend

Tests con Vitest:

```powershell
pnpm --dir frontend test
```

Build:

```powershell
pnpm --dir frontend build
```

Tests focalizados cuando se trabaja en una zona concreta:

```powershell
pnpm --dir frontend test -- WidgetStudio.test.tsx
pnpm --dir frontend test -- LayoutStudio.test.tsx
pnpm --dir frontend test -- OverlaysStudioPage.test.tsx
```

Preview aislada de WidgetStudio:

```powershell
pnpm --dir frontend test -- PreviewScaler WidgetSandboxPreview WidgetPreviewPanel RelativeWidget relative-format WidgetRenderer
```

Usar este bloque cuando se toque centrado, escala, medicion DOM, Relative compacto/fill o `WidgetPreviewPanel`.

## Reglas

- Bug arreglado: anadir test de regresion si es viable.
- Refactor: primero proteger comportamiento existente con tests.
- UI: testear texto, botones, callbacks y estados relevantes.
- No borrar tests para hacer pasar el build.
- No bajar aserciones sin explicar por que.
- No dar una tarea por terminada sin indicar comandos ejecutados.

## Cuando basta verificacion manual

Puede bastar si:

- el cambio es solo documentacion,
- el cambio es estetico menor,
- no hay comportamiento automatizable facil.

Aun asi, el worker debe indicar pasos manuales concretos.

## Si un test falla

1. No ocultarlo.
2. Indicar comando exacto.
3. Indicar si parece fallo propio o preexistente.
4. No arreglar problemas no relacionados sin permiso.
5. Si bloquea la tarea, parar y pedir decision.
