# TC-02A — Reglas de dependencia de Telemetry Core

Fecha de corte: 2026-07-19. Estas reglas concretan la dirección del ADR 0004 sin exigir que los paquetes futuros ya existan. ISA-26 no mueve código productivo ni crea el runtime nuevo.

## Dirección canónica

```text
drivers concretos ─┐
                   ├─ core ── projections ── Overlay / Engineer / Strategy / Analysis
replay/test source ┘    │
schema ─────────────────┘

app/composition conecta puertos, transports y storage desde fuera.
```

La flecha significa “puede depender de”. `schema` es la capa más baja. `core` conoce contratos y puertos, nunca el driver LMU concreto. Una proyección consume core/schema y nunca readquiere datos. Los productos consumen proyecciones; core/schema no importan productos.

## Matriz permitida

| Desde | Puede importar | No puede importar |
| --- | --- | --- |
| `internal/telemetry/schema[/...]` | standard library y su propio árbol | otros subpaquetes telemetry, productos, transports, frameworks, DB |
| `internal/telemetry/core[/...]` | schema, standard library y contratos propios de core | drivers LMU, legacy `lmu`/`lmuapi`, projections, recording, productos, Wails/SSE/app/DB |
| `internal/telemetry/drivers/<source>` | schema/core ports y librerías de adquisición aprobadas | Overlay, Engineer, Strategy, app/server; ningún import inverso desde core |
| `internal/telemetry/projection/<consumer>` | schema/core y lógica pura de proyección | drivers concretos, legacy LMU, Wails/SSE/app/DB |
| `internal/telemetry/recording` | schema/core ports y formatos puros | implementación DuckDB/SQL dentro de Telemetry Core; productos/transports |
| `internal/app` o composition root | core, drivers, projections, transports y adapters de storage | —; aquí se cablean implementaciones, sin devolver dependencias hacia core |
| Overlay/Desktop/OBS/Engineer/Strategy/Analysis | su proyección/puerto público | driver LMU concreto y modelo interno de otro producto |

`recording` representa puertos y formatos del dominio. Un adapter DuckDB futuro debe vivir fuera del núcleo y conectarse desde composition; esta decisión evita que el core dependa de una DB concreta, sin aprobar todavía ubicación ni implementación.

## Prohibiciones mínimas

Todo código Go productivo bajo `internal/telemetry` rechaza imports de:

- `internal/app`, `internal/server`, `internal/overlay`, `pkg/overlay`;
- `internal/engineer` e `internal/strategy`;
- los módulos concretos Wails `github.com/wailsapp/wails/v3` y `github.com/wailsapp/wails/webview2`, `database/sql`, `github.com/marcboeker/go-duckdb` o `github.com/duckdb/duckdb-go-bindings`.

Además:

- `schema` no sube a ninguna otra capa telemetry;
- `core` no importa `drivers/*`, `lmu`, `lmuapi`, `projection*` ni `recording`;
- `projection/*` no importa `drivers/*`, `lmu` ni `lmuapi`.

SSE está representado hoy por `internal/server`, y Wails por su módulo externo; ambos son transports. “LMU concreto” incluye tanto el driver futuro `drivers/lmu` como los paquetes legacy actuales `internal/telemetry/lmu` y `lmuapi`.

## Caracterización compatible del estado actual

El árbol actual contiene paquetes legacy como `diff`, `fusion`, `gap`, `lmu`, `lmuapi`, `mock`, `normalize`, `pipeline` y `source`, pero todavía no contiene los paquetes canónicos `schema`, `core`, `drivers/*`, `projection/*` o `recording` completos.

Por eso el guard:

- escanea el código productivo existente y aplica prohibiciones globales desde ahora;
- activa las reglas específicas por ruta automáticamente cuando aparezca cada paquete futuro;
- no exige migraciones, imports o paquetes inexistentes;
- no declara que el grafo legacy ya sea la arquitectura final.

El test real comienza verde porque no hay hoy un import productivo que viole esas fronteras y los paquetes futuros aún no existen. El rojo previo comprobable se hizo contra la función de validación antes de implementarla. Los fixtures table-driven demuestran que un futuro `core -> drivers/lmu` falla y que los archivos excluidos no generan falsos positivos.

## Guard automatizado

`internal/telemetry/architecture_test.go`:

1. Localiza su raíz mediante `runtime.Caller`, sin asumir separador Unix ni cwd.
2. Recorre archivos con `filepath.WalkDir`.
3. Excluye `_test.go`, `testdata`, `tools`, `vendor`, directorios ocultos y archivos cuya primera línea contiene el marcador Go `Code generated ... DO NOT EDIT`.
4. Extrae imports con `go/parser`, no con regex ni shell externa.
5. Valida cada arista, informa `archivo:línea`, ordena las infracciones y produce salida determinista.

Las exclusiones son deliberadas:

- Tests pueden importar paquetes externos para pruebas black-box sin invertir producción.
- Generated files no se juzgan aquí porque su fuente/generador debe ser el punto de enforcement; el marcador debe estar en la primera línea.
- `tools` no forma parte del grafo runtime y puede necesitar drivers concretos para diagnóstico.
- `testdata` no es código productivo.

No se excluyen ejemplos, mocks productivos o simulator por nombre. Si son `.go` productivo bajo telemetry, siguen sujetos a las prohibiciones globales.

## Cómo extender sin debilitar el guard

Cuando TC-03 o cortes posteriores creen una capa:

1. Añadir primero un caso table-driven para cada dirección nueva permitida y prohibida.
2. Mantener las reglas por import path de módulo, no por nombre de paquete Go.
3. Si aparece una excepción real, documentarla en ADR/current plan; no ampliar exclusiones para hacer verde el test.
4. Si cambia el módulo Go o la ruta canónica aprobada, actualizar `modulePath` y fixtures en el mismo corte documental/arquitectónico.
5. Ejecutar el test focal, `go test ./internal/telemetry/...` y `go test ./...`.

## Búsqueda y verificación reproducible

```powershell
go list -deps ./internal/telemetry/...
rg -n '^\s*"github.com/vantare/overlays/v2/(internal|pkg)/' internal/telemetry -g '*.go'
rg -n 'wails|database/sql|duckdb|internal/(app|server|overlay|engineer|strategy)' internal/telemetry -g '*.go'
go test ./internal/telemetry/... -run 'TestTelemetryProductionImportsFollowADR0004|TestValidateImport|TestScanProductionImportsIgnoresTestsGeneratedFilesAndTools' -count=1
```

La búsqueda sirve de evidencia humana; el guard ejecutable es el test con parser.

## Seguridad, rendimiento y rollback

- Seguridad: el guard solo lee fuentes dentro de `internal/telemetry`; no abre `.env`, secretos ni red.
- Rendimiento: parsea únicamente imports de archivos Go y se ejecuta durante tests, no en runtime.
- Determinismo: no depende del orden del filesystem, proceso externo ni plataforma.
- Rollback: revertir `architecture_test.go` y estos documentos devuelve exactamente el comportamiento anterior, porque ISA-26 no modifica producción.
