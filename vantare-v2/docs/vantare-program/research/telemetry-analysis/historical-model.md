# Modelo histórico canónico v1

Estado: modelo TA-03 corregido; TA-04A demostró vuelta, progreso y ancla
temporal. TA-04C cerró `NO-GO` documental para datum GPS y fórmula de anchura.
TA-04E mantuvo `local_shape=unknown` por fallo de repetibilidad rígida y no
validó un envelope lateral. TA-04F6 terminó en freeze `STOP insuficiente` sin
shape, F4 ni mapa. TA-04F7 agotó las grabaciones históricas y obtuvo dos GO
local-only y un NO-GO, cada uno con un único recording por grupo; la confianza
entre recordings sigue ausente y `local_shape` general permanece `unknown`.
TA-04F8 intentó extraer una forma descriptiva sanitizada de esos dos GO y quedó
en STOP sin figura por drift aditivo de la población en disco.
TA-04F9 preregistró C1-C5 para ese inventario vivo, los superó en una ejecución
única y congeló una figura técnica descriptiva de los grupos 1 y 37. La figura
no cambia el contrato: `local_shape` sigue `unknown`, no es mapa y no autoriza
producto ni TA-04B.
El adapter productivo existe en TA-03C/03E/03F.

## Objetivo y frontera

El modelo histórico pertenece a `internal/telemetryanalysis`, fuera de
`internal/telemetry`. No lee Shared Memory, REST, drivers LMU ni snapshots live.
Recibe una `AuthorizedHistoricalArtifact` emitida por el gate TA-02 y un
catálogo/páginas de un reader histórico ligado al mismo artefacto.

El corte entrega:

- sesión, canal, columnas, unidades, calidad y procedencia;
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

La presencia de una tabla llamada `Lap` no demuestra por sí sola que cada fila
sea un inicio de vuelta ni cuál sea su semántica. TA-03 conserva ese evento
como canal histórico, pero no construye límites ni publica `Boundary=valid`.
TA-04 debe observar valores/transiciones sanitizados y definir la regla antes
de poblar `HistoricalSession.Laps`.

Una primera observación TA-04A fue insuficiente. La observación multivuelta
posterior demostró un snapshot inicial, 70 eventos relacionados 1:1 con resets
de `Lap Dist`, 69 segmentos completos monotónicos con longitud compatible y una
relación estable entre `GPS Time`, eventos y continuas.

`spatial.go` implementa el contrato puro v1: ajuste OLS con pendiente fija,
cobertura temporal completa, evento por reset, dos vueltas completas mínimas,
longitud compatible, extremos parciales explícitos y progreso `s` acotado. El
snapshot inicial no se convierte en frontera válida y no existe fallback por
índice/frecuencia sin el ancla demostrada.

No habilita mapa ni anchura: el datum GPS y la semántica que relaciona
`Path Lateral` con `Track Edge` no están demostrados. Esas capacidades deben
permanecer explícitamente `unknown`/`incompatible`. Véase
`ta04a-spatial-evidence.md` y
`ta04c-spatial-semantics-evidence.md`.

TA-04E contrastó de forma pre-registrada si múltiples recordings compatibles
permitían una forma local métrica independiente del datum. Progreso/longitud,
escala, generalización de longitud y cierre pasaron, pero solo el 61,73 % de
las vueltas cumplió conjuntamente p95 `<= 5 m` y p99 `<= 10 m`, frente al
mínimo del 80 %. Por ello `metric_progress`/`length` siguen `valid` por TA-04A,
`local_shape` queda `unknown`, la geolocalización absoluta sigue `unknown` y la
anchura física continúa `incompatible`.

La exploración lateral separada cubrió ambos lados en 86,125 % de bins frente
al 95 % requerido y obtuvo un mínimo de una observación por lado frente a cinco.
Esos agregados son descriptivos: `empirical_edge_envelope` conserva semántica
`unknown` y uso de producto `incompatible`. No autorizan borde, envelope, mapa
o fórmula post hoc. Véase `ta04e-local-track-reconstruction-evidence.md`.

TA-04C confirma que la guía oficial LMU solo enumera nombres y frecuencias. El
header oficial Example Plugin v8 de rFactor 2 describe `mPathLateral` respecto
a un centro muy aproximado y `mTrackEdge` como el borde del mismo lado que el
vehículo, pero no declara unidad/signo explícitos ni equivalencia con LMU. Por
ello `2 * abs(Track Edge)` no es ancho total demostrado y
`abs(Track Edge - Path Lateral)` es solo una hipótesis rFactor 2 bajo supuestos
no demostrados, nunca contrato LMU. El GDB oficial tampoco identifica el
datum/elipsoide o transformación de la telemetría. Más agregados locales no
pueden sustituir esos contratos.

TA-04F6 ejecutó el Gate 3 local válido con 16 recordings en grupos ordinales
`1/1/1/3/10`: 7 fueron evaluables, 9 `low_event` y 0 inválidos. Aunque existían
69 ventanas preliminares, solo `group_5` tuvo un contributor con `>= 10`; al no
alcanzar tres, el protocolo prohíbe calcular centro o ejecutar postfiltro. Por
ello el resultado global fue `valid_laps=0`, selección `0/0` y
`stop_insufficient`. No cambia capabilities: `local_shape` permanece `unknown`
y no autoriza TA-04B. Solo puede reabrirse con `>= 3` recordings del mismo
grupo con `>= 10` vueltas preliminares cada uno, o mediante un protocolo nuevo
explícito, nunca seleccionando un subconjunto o relajando thresholds.

TA-04F7 ejecutó un barrido existing-only multirrate sobre 319 candidatos. De
ellos, 186 fueron recordings canónicos, 183 insuficientes, 3 elegibles y 133
`data_invalid`, repartidos en 48 grupos. Los grupos 1 y 37 pasaron localmente
con 4/5 y 2/2 slots; el grupo 36 falló 0/2. Como cada grupo elegible contiene un
solo recording, los GO son `technical_go_local_shape_local_only` con confidence
`none`; no demuestran repetición entre recordings. El freeze mantiene
`local_shape=unknown` y `product_map_authorization=false`. Un resultado previo
`319/319 data_invalid` se conserva únicamente como evidencia rechazada de un
bug de materialización multirrate.

TA-04F8 reejecutó el mismo barrido existing-only en modo
`existing-authorized-shape` bajo protocolo
`bc13c7015a44b108ed63e1c00d70e43811acb57e` y runner
`2a99445765b11c251fd20abb0445b535120c7ab5`, con el único fin de extraer una
forma descriptiva sanitizada de los dos GO. El run salió con código 0 en 597 s y
outcome `analysis_complete`, publicando el shape export y el manifest de control
con temporales 0, procesos 0, staging ausente y worktree limpio. Falló sin
embargo la regla de igualdad congelada frente al freeze-v2:
`inventory_candidates` pasó de 319 a 322, `canonical_recordings` de 186 a 189 e
`insufficient_laps_recordings` de 183 a 186, mientras `eligible_recordings` se
mantuvo en 3 y `data_invalid` en 133; los grupos pasaron de 48 a 49. Los 48
grupos previos resultaron idénticos campo a campo en sus catorce campos y la
única diferencia fue un grupo 49 nuevo con 3 descubiertos, 3 `insufficient_laps`,
0 elegibles y decisión `stop_insufficient`. No es no determinismo del pipeline:
es deriva real y aditiva de la población en disco, porque la regla asumió una
población congelada mientras el protocolo sólo garantiza estabilidad de
inventario dentro de un run. El drift es benigno, pero relajar el criterio
después de ver el resultado sería exactamente el post hoc rechazado desde
TA-04E, así que se mantiene el STOP: no hay SVG, no hay figura y no hay
promoción. Ambas salidas se custodian byte a byte como evidencia rechazada.
`local_shape` sigue `unknown`, `product_map_authorization` sigue `false` y
TA-04B sigue bloqueada. Aceptar un inventario vivo aditivo exigiría un protocolo
nuevo y explícito, no diseñado ni autorizado aquí.

TA-04F9 aportó ese protocolo prospectivo y una autorización humana separada.
La ejecución única terminó `analysis_complete`: los 48 grupos de la baseline
permanecieron idénticos y apareció sólo un grupo 49 aditivo con 3 recordings
insuficientes; los deltas fueron `+3/+3/+3/0`. Gate 4 congeló manifest, shape
export y SVG técnico para los grupos 1 y 37, con cleanup `0/0/0` y privacidad
PASS. El SVG sólo representa forma relativa canonicalizada; no demuestra
orientación, posición, escala geodésica, quiralidad, anchura ni bordes.
`local_shape=unknown`, `product_map_authorization=false` y TA-04B sigue
bloqueada.

### Metadata

Las claves desconocidas son sensibles por defecto. Solo `CarClass`, `CarName`,
`SessionType`, `TrackLayout`, `TrackName`, `Version` y `WeatherConditions`
forman la allowlist pública demostrada. Setup, identidad, Steam ID, tiempos de
grabación/sesión y cualquier clave futura no salen de un límite de privacidad
sin una decisión posterior. Los valores sensibles nunca se copian al modelo:
se conserva presencia y `redacted=true`. Un valor público que supera el
presupuesto o contiene controles queda `invalid` sin invalidar el catálogo ni
ocultar sus canales.

## Puerto de infraestructura

`LMUDuckDBReader` tiene tres operaciones:

```text
ArtifactEvidence(ctx) -> hash + tamaño/mtime + identidad, sin ruta
Catalog(ctx) -> schema sanitizable
ReadRows(ctx, sourceTable, start, limit) -> página tipada
```

El parser:

- exige una capability emitida por `BuildAuthorizedHistoricalArtifact`, no un
  manifest construible por separado;
- revalida hash, tamaño/mtime e identidad antes y después de catálogo/página;
- no publica datos si el artefacto cambia durante la lectura;
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
copia estable en read-only, recalcular evidencia para cada revalidación y
materializar NULL/tipos sin usar `any` en el modelo. Esa implementación no
forma parte de este commit y mantiene TA-03 abierta hasta un corte explícito de
dependencia/build/empaquetado Windows y adapter.

## Presupuestos

- máximo 1.024 canales/eventos;
- máximo 64 columnas por canal;
- máximo 512 claves de metadata;
- nombres/unidades limitados a 256 bytes y sin caracteres de control;
- valores sensibles siempre redacted; valores públicos fuera del presupuesto
  se marcan invalid sin rechazar la sesión;
- páginas acotadas por el constructor del parser a un máximo de 16.384 filas
  publicadas, más una única predecesora interna para eventos.
- el normalizador público también rechaza directamente más de 16.384 filas.

El benchmark modela dos horas a 100 Hz (720.000 muestras) en páginas de 4.096.
Cinco pasadas midieron 58,04–75,16 ms/op,
103.686.400–103.696.592 B/op acumulados y 355–368 allocs/op. Las asignaciones
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
