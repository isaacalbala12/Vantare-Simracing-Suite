# Testing Center — draft local y bridge Wails

Estado: TAU-04B / ISA-219 implementado en rama de issue, sin UI, red, Supabase
remoto, GitHub, Codex, Discord, deploy ni promoción.

## Datos que se guardan

El único archivo es
`<config>/testing-center/testing-center-report-draft.json`. Contiene versión de
schema, clave idempotente generada por backend y cinco campos reanudables:
acción, resultado esperado, resultado observado, contexto y módulo.

No existen campos para consentimiento, diagnóstico, logs, session replay,
tokens, email, UUID remoto o identidad del tester. El frontend tampoco puede
elegir la ruta ni la clave idempotente. Un usuario sí podría pegar información
sensible dentro de los campos libres; TAU-04C debe recordarlo y permitir borrar
el draft.

El archivo no está cifrado. En Windows queda bajo el directorio de configuración
del usuario y hereda su ACL; en sistemas POSIX se fuerzan directorio `0700` y
archivo `0600`. No tratar este mecanismo como almacenamiento de secretos.

## Persistencia y recuperación

- límite total de 16 KiB y límites por campo iguales o más estrictos que el RPC;
- JSON estricto, sin campos desconocidos ni trailing data;
- ruta fija con subdirectorio dedicado; symlinks y reparse points/junctions se
  rechazan antes de leer, escribir o borrar;
- escritura a temporal privada, `fsync`, reemplazo atómico y sync del directorio
  donde la plataforma lo soporta;
- mutex por store para serializar saves/loads/discards concurrentes;
- la clave idempotente permanece estable al guardar y rota tras descartar;
- un archivo corrupto, no regular o sobredimensionado se elimina y se devuelve
  el código cerrado `corrupt_removed`.

Si el reemplazo ya ocurrió pero falla el sync final, la operación puede devolver
error aunque el nuevo draft exista. Un retry carga el mismo documento y conserva
la clave, por lo que no crea un segundo reporte.

## Contrato Wails

Eventos de entrada:

- `testing-center:report-draft:save`
- `testing-center:report-draft:load`
- `testing-center:report-draft:discard`
- `testing-center:report-draft:cancel`

Respuestas: `saved`, `loaded`, `discarded` o `error`, siempre correlacionadas por
`requestId` seguro. Los errores solo exponen códigos cerrados y nunca paths o
mensajes internos. Hay timeout, límite de concurrencia, cancelación y cleanup al
cerrar la aplicación.

## Verificación local

Desde `vantare-v2`:

```powershell
go test ./internal/testingcenter/reportdraft ./internal/app -run 'Test(Store|TestingCenterReportDraft)' -count=20
$env:Path='C:\msys64\ucrt64\bin;' + $env:Path
$env:CGO_ENABLED='1'
$env:CC='gcc'
go test -race ./internal/testingcenter/reportdraft ./internal/app -run 'Test(Store|TestingCenterReportDraft)' -count=5
go vet ./internal/testingcenter/reportdraft ./internal/app ./cmd/vantare
```

El composition root necesita `frontend/dist`; en un worktree limpio se genera
con `pnpm install --frozen-lockfile` y `pnpm build` antes de ejecutar tests Go
globales.

## Verificación manual futura

TAU-04C deberá demostrar que reiniciar restaura solo los cinco campos, que los
opt-ins vuelven apagados, que descartar elimina el archivo y rota la clave, y que
un retry de red conserva la misma clave. No hay superficie visual en este corte.
