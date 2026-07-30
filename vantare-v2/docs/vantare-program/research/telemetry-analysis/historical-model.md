# Modelo histórico canónico v1

Estado: TA-03 / ISA-126, preparado para review.

## Objetivo y frontera

El modelo histórico pertenece a `internal/telemetryanalysis`, fuera de
`internal/telemetry`. No lee Shared Memory, REST, drivers LMU ni snapshots live.
Recibe un manifest aceptado por TA-02 y un catálogo/páginas de un reader
histórico.

El corte entrega:

- sesión, vuelta, canal, columnas, unidades, calidad y procedencia;
- parser de catálogo LMU DuckDB;
- normalización paginada;
- ejes continuos implícitos y eventos timestamped;
- diccionario sanitizado completo del schema observado;
- límites, cancelación, errores sanitizados, fuzz y benchmark.

No entrega el reader DuckDB concreto, almacenamiento, UI, distancia, mapa,
delta, recomendaciones ni integración.

## Contratos

### Sesión

`HistoricalSession` usa como ID la clave de deduplicación del manifest. Incluye
versión de schema, parser, fuente, fingerprint de schema, metadatos por clave,
canales y futuras vueltas. Nunca contiene el locator real.

El fingerprint se calcula sobre catálogo canónico ordenado por nombre. Un
cambio de frecuencia, unidad, columna o tipo produce otro fingerprint.

### Canales

Cada canal conserva:

- ID determinista derivado de tipo de muestreo y nombre fuente;
- orden del catálogo normalizado;
- nombre de tabla fuente;
- sampling;
- frecuencia declarada cuando aplica;
- unidad declarada o `unknown`;
- columnas y tipos escalares;
- capability `valid` o `unknown`;
- parser, fuente y origen temporal.

Un tipo futuro no se borra: la columna queda `ScalarUnknown` y la capability
queda `unknown`. `DECIMAL`, incluso sin parámetros, permanece desconocido
hasta demostrar precisión, escala y representación. Así una actualización de
LMU degrada el canal afectado sin silenciar su existencia ni reinterpretarlo.

### Valores y calidad

Calidad es independiente del valor:

| Calidad | Significado |
|---|---|
| `valid` | valor presente y finito/tipado |
| `stale` | valor presente marcado stale por una fuente histórica compatible |
| `missing` | NULL/ausente |
| `invalid` | no finito, tipo incompatible o marca inválida |
| `unknown` | significado/capability aún no demostrada |

`Present` distingue cero, `false` y texto vacío de ausencia. NaN/Inf no se
publican como escalares válidos.

### Páginas

El constructor rechaza presupuestos superiores a 16.384 filas. El parser
solicita como máximo el límite configurado por página. Para comprobar el orden
entre páginas de eventos puede pedir además una única fila predecesora, que
nunca publica en la página solicitada. Las páginas preservan orden e índice y
no cargan una sesión completa:

- continuo: no acepta `ts`; calcula tiempo relativo por índice/frecuencia;
- evento: exige `ts` finito y no decreciente;
- ambos: exigen el número exacto de columnas.

Una página vacía o que solo contiene la fila predecesora conserva siempre el
`start` pedido y devuelve cero muestras. El límite se valida antes de sumar la
fila de contexto.

Los valores de una página comparten un único backing allocation, manteniendo
ownership de la página y evitando una asignación por muestra.

### Vueltas

`BuildHistoricalLaps` acepta únicamente el evento `Lap` timestamped y entero.
También valida por sí misma que cada timestamp sea finito y no decreciente,
aunque las muestras no hayan pasado por el normalizador. Cada evento crea un
inicio; el siguiente crea el final del anterior. La última vuelta queda
abierta. `Validity` permanece `unknown` hasta combinar flags y reglas
demostradas en cortes posteriores.

### Metadata

Las claves desconocidas son sensibles por defecto. Solo `CarClass`, `CarName`,
`SessionType`, `TrackLayout`, `TrackName`, `Version` y `WeatherConditions`
forman la allowlist pública demostrada. Setup, identidad, Steam ID, tiempos de
grabación/sesión y cualquier clave futura no salen de un límite de privacidad
sin una decisión posterior.

## Puerto de infraestructura

`LMUDuckDBReader` tiene dos operaciones:

```text
Catalog(ctx) -> schema sanitizable
ReadRows(ctx, sourceTable, start, limit) -> página tipada
```

El parser:

- valida manifest/schema;
- congela una copia interna del catálogo tras `Inspect`;
- resuelve `channelID` contra esa copia y nunca confía en nombres, columnas o
  provenance entregados por el llamador;
- rechaza lecturas antes de `Inspect` y canales que no estaban en el catálogo;
- impone límite duro por página;
- propaga cancelación;
- no devuelve errores crudos del reader;
- no conoce ruta, SQL, `database/sql`, CLI, CGO ni filesystem;
- no crea goroutines.

El reader concreto deberá citar/escapar identificadores, abrir únicamente una
copia estable en read-only y materializar NULL/tipos sin usar `any` en el
modelo. Esa implementación no forma parte de TA-03.

## Presupuestos

- máximo 1.024 canales/eventos;
- máximo 64 columnas por canal;
- máximo 512 claves de metadata;
- nombres/unidades limitados a 256 bytes y sin caracteres de control;
- páginas acotadas por el constructor del parser a un máximo de 16.384 filas
  publicadas, más una única predecesora interna para eventos.

El benchmark modela dos horas a 100 Hz (720.000 muestras) en páginas de 4.096.
Cinco pasadas midieron 56,15–70,99 ms/op,
103.686.144–103.691.528 B/op acumulados y 352–364 allocs/op. Las asignaciones
son acumuladas para todo el recorrido; cada página se libera antes de la
siguiente y el modelo no retiene simultáneamente las 720.000 muestras.

## Verificación

```text
go test ./internal/telemetryanalysis -count=20
go test -race ./internal/telemetryanalysis -count=10
go test ./internal/telemetryanalysis -run '^$' \
  -bench '^BenchmarkNormalizeLMUDuckDBTwoHours100Hz$' \
  -benchtime=1x -count=5 -benchmem
go test ./... -count=1
git diff --check
```

El corpus de schema prueba 12 claves, 56 canales continuos, 42 eventos y un
fingerprint fijo. No contiene una base DuckDB ni valores reales.
