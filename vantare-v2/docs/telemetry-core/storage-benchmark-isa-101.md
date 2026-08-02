# ISA-101 / TC-06A — benchmark reproducible de almacenamiento

Fecha: 2026-07-30. Base:
`4801dced7f93ab13ef639f01c3c4e6e9790b5d8c`.

## Veredicto

- **SQLite modernc:** candidato autoritativo `GO` condicionado para TC-06B.
- **MCAP:** candidato condicionado para export/import/replay; `NO-GO`
  autoritativo. Su recovery CLI es capacidad upstream no verificada localmente.
- **DuckDB:** `NO-GO` autoritativo actual por CGO/packaging Windows no
  satisfecho; solo cache analítica reconstruible en una issue futura.
- **Framing propio:** `NO-GO` productivo; control desechable.

El benchmark no añade ninguna de estas dependencias a Vantare. Todas viven en
`tools/benchmarks/isa101-storage/go.mod`.

## Entorno

| Dato | Valor |
|---|---|
| OS | Windows 11 Pro 10.0.26200, amd64 |
| CPU | AMD Ryzen 7 3700X, 8 cores / 16 logical |
| RAM | 32 GiB |
| Go | 1.26.4 |
| Producto | módulo principal Go 1.25 |
| CGO | `0` |
| Pasadas | repetición 1 `first`; no se purgó cache del SO; 2–5 `subsequent` |

`environment.txt` contiene el snapshot exacto. Las cifras son locales y
fechadas; no son un SLA.

## Fixture común

Cada candidato recibe exactamente los mismos bytes:

- observed: `RecordingPayloadV1`, `2.080` bytes; header de 32 bytes + 64
  vehículos sanitizados de 32 bytes;
- fact: `RecordingFactV1`, `160` bytes fijos y reservados en cero;
- epoch, secuencia y timestamps deterministas;
- CRC32 por payload;
- sin nombres, PII, raw real, secretos o rutas.

`RecordingPayloadV1` y `RecordingFactV1` son DTOs de almacenamiento aislados de
Core. Solo admiten slots locales, enums y señales numéricas allowlisted. Sus
golden SHA-256 son:

- observed:
  `a5776a3720c985f2296f78cd064dfe09e3235d5dfbd3b75b62376ee5d0f58564`;
- fact:
  `5ad5352c46197930a43af0234d24d9f3eb2501d4d654f49b41c338abbab4ade5`.

Tests con JSON base válido rechazan nombres, IDs remotos/Steam, rutas, metadata
y unknown mediante `UnknownRecordingFieldError`, no por otra validación.

Los valores siguen siendo sintéticos. El tamaño y ratio de esta fixture **no
estiman footprint real, retención ni crecimiento multisesión**. TC-06B debe
repetir el benchmark con el mapping productivo real de ambos DTOs.

Cada round-trip vuelve a concatenar payloads y calcula SHA-256. Todos los
candidatos CGO-free produjeron el mismo digest por escenario/repetición.

## Escenarios

| Escenario | Carga | Repeticiones |
|---|---|---:|
| nominal | 1.200 observed a 20 Hz + fact cada 20 | 5 |
| 4× | 4.800 observed a 80 Hz lógico + facts | 5 |
| facts burst | 1.200 observed + 1.200 facts | 5 |
| 24 h lógica | 86.400 observed a 1 Hz + 1.440 facts | 1 |

Cada repetición de throughput hace append, un único commit/cierre durable,
abre reader y mide:

- scan completo + digest + counts de canales/facts + último cursor;
- rango inclusivo central del 10 %;
- consulta del último timestamp/cursor;
- tamaño final.

Importante: estas cifras de escritura miden **cierre final**, no RPO periódico.
La durabilidad periódica y el kill viven en la sección de fallos.

## Resultados agregados

La repetición `first` se registra aparte. Las cifras siguientes son medianas de
las cuatro pasadas `subsequent`; no mezclan ambas clases:

| Candidato | Escenario | Write/close | Full scan | Rango | Último cursor | Ratio fichero/payload |
|---|---|---:|---:|---:|---:|---:|
| framing | nominal | 8,27 ms | 3,14 ms | 3,39 ms | 1,76 ms | 1,02× |
| MCAP | nominal | 8,31 ms | 5,65 ms | 1,50 ms | 1,27 ms | 1,02× |
| SQLite | nominal | 74,29 ms | 32,97 ms | 5,75 ms | 1,92 ms | 2,00× |
| framing | 4× | 19,25 ms | 14,60 ms | 9,87 ms | 5,80 ms | 1,02× |
| MCAP | 4× | 24,08 ms | 20,28 ms | 3,81 ms | 1,69 ms | 1,02× |
| SQLite | 4× | 235,77 ms | 95,16 ms | 8,92 ms | 1,88 ms | 2,00× |
| framing | facts burst | 7,32 ms | 5,06 ms | 2,75 ms | 2,49 ms | 1,04× |
| MCAP | facts burst | 11,38 ms | 5,66 ms | 2,73 ms | 3,81 ms | 1,04× |
| SQLite | facts burst | 89,33 ms | 36,17 ms | 4,66 ms | 2,00 ms | 1,89× |

Lectura: MCAP y SQLite sí usan índices para rangos/cursor. El framing debe
escanear linealmente y su coste crece con 24 h. SQLite conserva margen enorme
frente a 80 Hz lógico, aunque consume aproximadamente 2× por páginas e índices.
La única pasada `first` de 24 h queda en el CSV crudo y se excluye de esta tabla:
no existe mediana ni inferencia estadística para ese escenario.

## Durabilidad, crash y recovery

El proceso hijo persiste primero un manifest experimental
`integrity_state=recording`, `access_mode=read_write`,
confirma 200 registros y luego acepta en memoria un lote hasta 240. El padre
mata exactamente en cuatro límites y recupera una copia:

| Límite | Accepted volátil | Watermark manifest | Backend recuperado | Lectura |
|---|---:|---:|---:|---|
| antes de append | 200 | 200 | 200 | aún no se aceptó el siguiente lote |
| antes de commit | 240 | 200 | 200 | lote no confirmado ausente |
| después de commit, antes de manifest | 240 | 200 | 240 | DB por delante del watermark |
| después de replace del manifest | 240 | 240 | 240 | checkpoint alineado |

Framing y SQLite pasaron esos límites del harness. `opening`, `recording` y
`recovering` se interpretan `incomplete` al reiniciar; `complete` se conserva.
`access_mode=read_only` permanece separado y no altera integridad. Esto **no**
es el manifest
productivo ni un ACK durable por batch: accepted es volátil, el último accepted
persistido es un watermark, y la pérdida posterior queda acotada por cola y
cadencia pero no puede calcularse exactamente tras un crash.

MCAP no expone commit parcial en la API Go probada, por lo que estos límites
quedan `NO-GO` autoritativo. TC-06B debe demostrar RPO `<=2 s`, intervalo
`<=1,5 s`, timeout `500 ms`, cola acotada y parada visible con su coordinator.

Tail truncado:

- framing: `unexpected EOF`;
- SQLite: `database disk image is malformed (11)`;
- MCAP: magic/footer final inválido;
- los tres conservaron el SHA-256 del original porque solo se abrió la copia.

Lectura concurrente:

- framing y SQLite leyeron `200/200` después de checkpoint con el writer abierto;
- MCAP no expuso un checkpoint parcial y quedó `NO-GO` autoritativo.

No ejecutado:

| Probe | Estado | Motivo exacto |
|---|---|---|
| disk full | bloqueado por entorno | no hay volumen Windows aislado/cuota ni VFS inyectable; llenar el disco host es inseguro |
| writer lento | TC-06B | un `sleep` mediría coordinator/cola, no el backend; requiere store inyectable |
| permisos | bloqueado por entorno | una denegación determinista exige mutar ACL Windows; usar fixture aislada o filesystem inyectable |
| MCAP CLI recover | no verificado localmente | la documentación upstream anuncia recovery, pero el CLI consultado no compila por incompatibilidad de versiones; error crudo guardado |

No se inventan resultados para estos probes. Son gates obligatorios de TC-06B.

## Packaging y tamaño

Probe Go aislado, `CGO_ENABLED=0`, `-trimpath`:

| Candidato | Estado | Bytes | Delta frente framing |
|---|---|---:|---:|
| framing | PASS | 4.001.280 | — |
| MCAP | PASS | 7.719.424 | +3.718.144 |
| SQLite | PASS | 10.824.192 | +6.822.912 |
| DuckDB | BLOCKED | n/a | no medible |

DuckDB CGO=0:

```text
duckdb-go-bindings/lib/windows-amd64:
build constraints exclude all Go files
```

DuckDB CGO=1:

```text
cgo: C compiler "gcc" not found
```

El producto base también pasó `pnpm --dir frontend build` y `wails3 build` con
CGO=0 (`bin/vantare.exe`, 14.959.616 bytes). Ese build valida el entorno Wails,
no el delta final de SQLite integrado; TC-06B debe repetirlo tras incorporar el
adaptador.

## Dependencias y licencias

El inventario exacto por build tag y SHA-256 de cada licencia está en
`raw-dependencies-*.txt` y `raw-licenses.csv`.

| Candidato | Módulos runtime observados | Familias |
|---|---:|---|
| framing | 0 externos | stdlib Go |
| SQLite | 9 | MIT, BSD-3-Clause; SQLite embebido public domain |
| MCAP | 7 | MIT, Apache-2.0, BSD, ISC; YAML dual MIT/Apache-2.0 |
| DuckDB | 5 antes del bloqueo | MIT/BSD observadas; inventario enlazado incompleto |

La licencia incompleta del binario DuckDB es otra razón para no aprobarlo en
este corte. SQLite exige conservar notices/licencias de wrapper y transitivas.

## Reproducción

Desde `tools/benchmarks/isa101-storage`:

```powershell
go test ./... -count=1
go test -tags sqlite ./... -count=1
go test -tags mcap ./... -count=1

go run . -candidate framing -scenario all -output raw-framing.csv
go run -tags sqlite . -candidate sqlite -scenario all -output raw-sqlite.csv
go run -tags mcap . -candidate mcap -scenario all -output raw-mcap.csv

go build -o "$env:TEMP\framing-fault.exe" .
& "$env:TEMP\framing-fault.exe" -candidate framing -faults -output faults.csv
```

Usar un `-workdir` nuevo por pasada. Los tags aseguran que las dependencias de
cada candidato no se enlazan en los demás probes.

## Evidencia cruda

- `environment.txt`
- `raw-framing.csv`, `raw-sqlite.csv`, `raw-mcap.csv`
- `raw-aggregate.csv`
- `raw-faults-*.csv`
- `raw-builds.csv`, `raw-wails-build.csv`
- `raw-race.txt`
- `raw-dependencies-*.txt`, `raw-licenses.csv`
- `raw-mcap-cli-recover.txt`

## Limitaciones

- host único y SSD/cache no controlados;
- solo una repetición de 24 h lógica;
- no hay sesión real de 24 h ni raw LMU;
- no se midieron compresión, retención o crecimiento multisesión;
- DuckDB no produjo cifras runtime;
- disk full, writer lento y ACL quedan pendientes por las razones registradas;
- el manifest ejecutado es solo harness experimental; coordinator productivo no existe;
- accepted posterior al último watermark no se conoce exactamente tras crash;
- `go test -race` no está disponible en este host CGO=0 sin `gcc`;
- la suite frontend no se repitió porque no hay cambios frontend; build y Wails
  Windows sí pasaron.

Por estas limitaciones el veredicto SQLite es condicionado, no una aprobación
previa del backend productivo.
